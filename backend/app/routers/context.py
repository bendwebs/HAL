"""Context Management Router - Token tracking and context window management"""

from fastapi import APIRouter, HTTPException, Depends, Query
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import httpx

from app.database import database
from app.auth import get_current_user
from app.config import settings

router = APIRouter(prefix="/context", tags=["Context"])


# Known context window sizes for common models
MODEL_CONTEXT_SIZES = {
    # Qwen models
    "qwen3:8b": 40960,
    "qwen3:8b-32k": 32768,
    "qwen3:8b-8k": 8192,
    "qwen3:32b": 40960,
    "qwen2.5:7b": 32768,
    "qwen2.5:14b": 32768,
    "qwen2.5:32b": 32768,
    "qwen2.5vl:7b": 32768,
    # Llama models
    "llama3.2:3b": 131072,
    "llama3.2:latest": 131072,
    "llama3:8b": 8192,
    "llama3.1:8b": 131072,
    "llama3.3:70b": 131072,
    # Other models
    "dolphin3:latest": 131072,
    "gemma3:4b": 8192,
    "codellama:7b": 16384,
    "nouscoder-14b:q4_k_m": 32768,
    # Default fallback
    "default": 8192,
}


def estimate_tokens(text: str) -> int:
    """Estimate token count for text using a simple heuristic.
    Roughly 4 characters per token for English text."""
    if not text:
        return 0
    # More accurate: ~0.75 tokens per word, or ~4 chars per token
    return max(1, len(text) // 4)


class MessageGroup(BaseModel):
    """A group of related messages"""
    id: str
    title: str
    summary: str
    message_ids: List[str]
    token_count: int
    start_time: str
    end_time: str
    message_count: int
    is_summary: bool = False  # True if this group is already a summary


class ContextAnalysis(BaseModel):
    """Analysis of current context window"""
    total_tokens: int
    max_tokens: int
    usage_percent: float
    model: str
    message_count: int
    system_prompt_tokens: int
    messages_tokens: int
    groups: List[MessageGroup]


class SummarizePreview(BaseModel):
    """Preview of what summarization will do"""
    group_id: str
    summary: str
    original_tokens: int
    summary_tokens: int
    tokens_saved: int
    original_message_count: int
    messages_to_delete: List[str]


class SummarizeRequest(BaseModel):
    """Request to apply a summarization"""
    summary: str
    message_ids: List[str]
    mode: str = "replace"  # "replace" = remove from UI, "context_only" = keep in UI but exclude from context


@router.get("/model-info/{model_name}")
async def get_model_info(
    model_name: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get context window size and info for a model"""
    # Try to get from Ollama API first
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.ollama_base_url}/api/show",
                json={"name": model_name}
            )
            if response.status_code == 200:
                data = response.json()
                model_info = data.get("model_info", {})
                
                context_length = None
                for key in model_info:
                    if "context" in key.lower():
                        context_length = model_info[key]
                        break
                
                if not context_length:
                    context_length = MODEL_CONTEXT_SIZES.get(
                        model_name, 
                        MODEL_CONTEXT_SIZES.get("default")
                    )
                
                return {
                    "model": model_name,
                    "context_length": context_length,
                    "parameters": data.get("parameters", ""),
                    "template": data.get("template", ""),
                    "details": data.get("details", {}),
                }
    except Exception as e:
        pass
    
    context_length = MODEL_CONTEXT_SIZES.get(
        model_name, 
        MODEL_CONTEXT_SIZES.get("default")
    )
    
    return {
        "model": model_name,
        "context_length": context_length,
        "parameters": None,
        "template": None,
        "details": {},
    }


@router.get("/chat/{chat_id}/analysis", response_model=ContextAnalysis)
async def analyze_chat_context(
    chat_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Analyze the context window usage for a chat"""
    chat = await database.chats.find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    user_id = current_user["_id"]
    if str(chat["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get messages - exclude those marked as excluded from context, and hidden summaries
    messages = await database.messages.find({
        "chat_id": ObjectId(chat_id),
        "$or": [
            {"exclude_from_context": {"$ne": True}},
            {"exclude_from_context": {"$exists": False}}
        ]
    }).sort("created_at", 1).to_list(1000)
    
    # Filter out hidden UI messages for display but keep for context calculation
    visible_messages = [m for m in messages if not m.get("hidden_from_ui")]
    
    model = chat.get("model_override") or settings.default_chat_model
    max_tokens = MODEL_CONTEXT_SIZES.get(model, MODEL_CONTEXT_SIZES.get("default"))
    
    system_prompt_tokens = 0
    if chat.get("persona_id"):
        persona = await database.personas.find_one({"_id": chat["persona_id"]})
        if persona and persona.get("system_prompt"):
            system_prompt_tokens = estimate_tokens(persona["system_prompt"])
    
    total_message_tokens = 0
    groups = []
    current_group_messages = []
    current_group_tokens = 0
    current_group_start = None
    group_counter = 0
    
    for i, msg in enumerate(messages):
        content = msg.get("content", "")
        thinking = msg.get("thinking", "") or ""
        msg_tokens = estimate_tokens(content) + estimate_tokens(thinking)
        msg_tokens += 10  # overhead
        
        total_message_tokens += msg_tokens
        
        # Check if this is a summary message (starts with [SUMMARY])
        is_summary_msg = content.startswith("[SUMMARY]")
        
        if current_group_start is None:
            current_group_start = msg["created_at"]
        
        current_group_messages.append(msg)
        current_group_tokens += msg_tokens
        
        # Create groups: every 6 messages, 2000 tokens, or if we hit a summary
        should_close_group = (
            len(current_group_messages) >= 6 or 
            current_group_tokens >= 2000 or
            is_summary_msg
        )
        
        if should_close_group:
            group_counter += 1
            
            first_user_msg = next(
                (m for m in current_group_messages if m["role"] == "user"), 
                None
            )
            
            # Check if this group is a summary
            group_is_summary = any(
                m.get("content", "").startswith("[SUMMARY]") 
                for m in current_group_messages
            )
            
            title = "Conversation"
            if group_is_summary:
                title = "📝 Summary"
            elif first_user_msg:
                content = first_user_msg.get("content", "")[:50]
                title = content + "..." if len(first_user_msg.get("content", "")) > 50 else content
            
            groups.append(MessageGroup(
                id=f"group_{group_counter}",
                title=title or f"Messages {group_counter}",
                summary="",
                message_ids=[str(m["_id"]) for m in current_group_messages],
                token_count=current_group_tokens,
                start_time=current_group_start.isoformat(),
                end_time=current_group_messages[-1]["created_at"].isoformat(),
                message_count=len(current_group_messages),
                is_summary=group_is_summary
            ))
            
            current_group_messages = []
            current_group_tokens = 0
            current_group_start = None

    # Don't forget the last group
    if current_group_messages:
        group_counter += 1
        first_user_msg = next(
            (m for m in current_group_messages if m["role"] == "user"), 
            None
        )
        
        group_is_summary = any(
            m.get("content", "").startswith("[SUMMARY]") 
            for m in current_group_messages
        )
        
        title = "Conversation"
        if group_is_summary:
            title = "📝 Summary"
        elif first_user_msg:
            content = first_user_msg.get("content", "")[:50]
            title = content + "..." if len(first_user_msg.get("content", "")) > 50 else content
        
        groups.append(MessageGroup(
            id=f"group_{group_counter}",
            title=title or f"Messages {group_counter}",
            summary="",
            message_ids=[str(m["_id"]) for m in current_group_messages],
            token_count=current_group_tokens,
            start_time=current_group_start.isoformat() if current_group_start else datetime.utcnow().isoformat(),
            end_time=current_group_messages[-1]["created_at"].isoformat(),
            message_count=len(current_group_messages),
            is_summary=group_is_summary
        ))
    
    total_tokens = system_prompt_tokens + total_message_tokens
    usage_percent = (total_tokens / max_tokens * 100) if max_tokens > 0 else 0
    
    return ContextAnalysis(
        total_tokens=total_tokens,
        max_tokens=max_tokens,
        usage_percent=round(usage_percent, 1),
        model=model,
        message_count=len(messages),
        system_prompt_tokens=system_prompt_tokens,
        messages_tokens=total_message_tokens,
        groups=groups
    )


@router.post("/chat/{chat_id}/summarize-group/{group_id}/preview", response_model=SummarizePreview)
async def preview_summarize_group(
    chat_id: str,
    group_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Generate a summary preview - shows what will change without applying it"""
    import ollama
    
    chat = await database.chats.find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    if str(chat["user_id"]) != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    analysis = await analyze_chat_context(chat_id, current_user)
    
    group = next((g for g in analysis.groups if g.id == group_id), None)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if group.is_summary:
        raise HTTPException(status_code=400, detail="This group is already a summary")
    
    # Get the messages in this group
    message_ids = [ObjectId(mid) for mid in group.message_ids]
    messages = await database.messages.find(
        {"_id": {"$in": message_ids}}
    ).sort("created_at", 1).to_list(100)
    
    # Format messages for summarization
    conversation_text = ""
    for msg in messages:
        role = "User" if msg["role"] == "user" else "Assistant"
        content = msg.get("content", "")[:500]
        conversation_text += f"{role}: {content}\n\n"
    
    # Generate summary using Ollama
    try:
        client = ollama.Client(host=settings.ollama_base_url)
        response = client.chat(
            model=settings.default_chat_model,
            messages=[
                {
                    "role": "system",
                    "content": """You are a helpful assistant that creates concise conversation summaries. 
                    Create a summary that captures:
                    1. The main topics discussed
                    2. Key decisions or conclusions
                    3. Any important facts or information shared
                    
                    The summary should be comprehensive enough that someone reading it would understand what was discussed,
                    but concise enough to save context space. Aim for 3-5 sentences."""
                },
                {
                    "role": "user",
                    "content": f"Summarize this conversation:\n\n{conversation_text}"
                }
            ],
            options={"temperature": 0.3}
        )
        
        summary = response['message']['content']
        summary_tokens = estimate_tokens(summary) + 20  # Add overhead for role markers
        tokens_saved = group.token_count - summary_tokens
        
        return SummarizePreview(
            group_id=group_id,
            summary=summary,
            original_tokens=group.token_count,
            summary_tokens=summary_tokens,
            tokens_saved=tokens_saved,
            original_message_count=len(messages),
            messages_to_delete=group.message_ids
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate summary: {str(e)}"
        )


@router.post("/chat/{chat_id}/summarize-group/{group_id}/apply")
async def apply_summarize_group(
    chat_id: str,
    group_id: str,
    request: SummarizeRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Apply a summarization.
    
    Modes:
    - "replace": Delete messages and replace with summary in chat UI
    - "context_only": Keep messages visible in UI but exclude from AI context
    """
    chat = await database.chats.find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    if str(chat["user_id"]) != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    message_ids = [ObjectId(mid) for mid in request.message_ids]
    first_msg = await database.messages.find_one(
        {"_id": {"$in": message_ids}},
        sort=[("created_at", 1)]
    )
    
    if not first_msg:
        raise HTTPException(status_code=404, detail="Messages not found")
    
    # Calculate original tokens
    original_messages = await database.messages.find(
        {"_id": {"$in": message_ids}}
    ).to_list(100)
    
    original_tokens = sum(
        estimate_tokens(m.get("content", "")) + estimate_tokens(m.get("thinking", "") or "") + 10
        for m in original_messages
    )
    
    summary_content = f"[SUMMARY] Previous conversation summary:\n\n{request.summary}"
    summary_tokens = estimate_tokens(summary_content) + 10
    
    if request.mode == "context_only":
        # Mode 2: Keep messages visible but exclude from context
        # Mark original messages as excluded from context
        await database.messages.update_many(
            {"_id": {"$in": message_ids}},
            {"$set": {"exclude_from_context": True}}
        )
        
        # Create a hidden summary message for context only
        summary_msg = {
            "chat_id": ObjectId(chat_id),
            "role": "system",
            "content": summary_content,
            "created_at": first_msg["created_at"],
            "is_summary": True,
            "hidden_from_ui": True,  # Don't show in chat UI
            "replaces_messages": request.message_ids  # Track which messages this summarizes
        }
        
        result = await database.messages.insert_one(summary_msg)
        
        return {
            "success": True,
            "mode": "context_only",
            "excluded_count": len(original_messages),
            "summary_message_id": str(result.inserted_id),
            "original_tokens": original_tokens,
            "new_tokens": summary_tokens,
            "tokens_saved": original_tokens - summary_tokens
        }
    else:
        # Mode 1: Replace - delete messages and show summary in UI
        delete_result = await database.messages.delete_many({
            "_id": {"$in": message_ids},
            "chat_id": ObjectId(chat_id)
        })
        
        summary_msg = {
            "chat_id": ObjectId(chat_id),
            "role": "system",
            "content": summary_content,
            "created_at": first_msg["created_at"],
            "is_summary": True
        }
        
        result = await database.messages.insert_one(summary_msg)
        
        return {
            "success": True,
            "mode": "replace",
            "deleted_count": delete_result.deleted_count,
            "summary_message_id": str(result.inserted_id),
            "original_tokens": original_tokens,
            "new_tokens": summary_tokens,
            "tokens_saved": original_tokens - summary_tokens
        }


# Keep the old endpoint for backwards compatibility but mark as deprecated
@router.post("/chat/{chat_id}/summarize-group/{group_id}")
async def summarize_message_group(
    chat_id: str,
    group_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """DEPRECATED: Use /preview and /apply endpoints instead.
    Generate a summary for a message group (preview only, doesn't apply)"""
    return await preview_summarize_group(chat_id, group_id, current_user)


@router.delete("/chat/{chat_id}/messages")
async def delete_messages(
    chat_id: str,
    message_ids: List[str],
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Delete specific messages to free up context space"""
    chat = await database.chats.find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    if str(chat["user_id"]) != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    object_ids = [ObjectId(mid) for mid in message_ids]
    result = await database.messages.delete_many({
        "_id": {"$in": object_ids},
        "chat_id": ObjectId(chat_id)
    })
    
    return {
        "deleted": result.deleted_count,
        "message": f"Deleted {result.deleted_count} messages"
    }


@router.post("/chat/{chat_id}/summarize-all/preview")
async def preview_summarize_all(
    chat_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Generate a summary preview for ALL messages in the chat"""
    import ollama
    
    chat = await database.chats.find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    if str(chat["user_id"]) != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get all messages (excluding already excluded ones)
    messages = await database.messages.find({
        "chat_id": ObjectId(chat_id),
        "$or": [
            {"exclude_from_context": {"$ne": True}},
            {"exclude_from_context": {"$exists": False}}
        ]
    }).sort("created_at", 1).to_list(1000)
    
    if not messages:
        raise HTTPException(status_code=400, detail="No messages to summarize")
    
    # Calculate original tokens
    original_tokens = sum(
        estimate_tokens(m.get("content", "")) + estimate_tokens(m.get("thinking", "") or "") + 10
        for m in messages
    )
    
    # Format messages for summarization (limit content to avoid token overflow)
    conversation_text = ""
    for msg in messages:
        role = "User" if msg["role"] == "user" else "Assistant" if msg["role"] == "assistant" else "System"
        content = msg.get("content", "")[:300]  # Limit each message
        conversation_text += f"{role}: {content}\n\n"
    
    # Truncate if too long
    if len(conversation_text) > 8000:
        conversation_text = conversation_text[:8000] + "\n\n[...conversation truncated for summarization...]"
    
    try:
        client = ollama.Client(host=settings.ollama_base_url)
        response = client.chat(
            model=settings.default_chat_model,
            messages=[
                {
                    "role": "system",
                    "content": """You are a helpful assistant that creates comprehensive conversation summaries.
                    Create a detailed summary that captures:
                    1. All main topics discussed throughout the conversation
                    2. Key decisions, conclusions, or outcomes
                    3. Important facts, preferences, or information shared
                    4. Any ongoing tasks or projects mentioned
                    5. Technical details or code discussions if applicable
                    
                    The summary should be thorough enough that the AI can continue the conversation
                    with full context of what was discussed. Aim for a comprehensive but concise summary."""
                },
                {
                    "role": "user",
                    "content": f"Summarize this entire conversation:\n\n{conversation_text}"
                }
            ],
            options={"temperature": 0.3}
        )
        
        summary = response['message']['content']
        summary_tokens = estimate_tokens(summary) + 20
        
        return {
            "summary": summary,
            "original_tokens": original_tokens,
            "summary_tokens": summary_tokens,
            "tokens_saved": original_tokens - summary_tokens,
            "original_message_count": len(messages),
            "message_ids": [str(m["_id"]) for m in messages]
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate summary: {str(e)}"
        )


@router.post("/chat/{chat_id}/summarize-all/apply")
async def apply_summarize_all(
    chat_id: str,
    request: SummarizeRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Apply summarization to ALL messages - replaces entire conversation with summary"""
    chat = await database.chats.find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    if str(chat["user_id"]) != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    message_ids = [ObjectId(mid) for mid in request.message_ids]
    
    # Get the first message timestamp
    first_msg = await database.messages.find_one(
        {"_id": {"$in": message_ids}},
        sort=[("created_at", 1)]
    )
    
    if not first_msg:
        raise HTTPException(status_code=404, detail="Messages not found")
    
    # Calculate original tokens
    original_messages = await database.messages.find(
        {"_id": {"$in": message_ids}}
    ).to_list(1000)
    
    original_tokens = sum(
        estimate_tokens(m.get("content", "")) + estimate_tokens(m.get("thinking", "") or "") + 10
        for m in original_messages
    )
    
    summary_content = f"[SUMMARY] Complete conversation summary:\n\n{request.summary}"
    summary_tokens = estimate_tokens(summary_content) + 10
    
    if request.mode == "context_only":
        # Mark all messages as excluded from context
        await database.messages.update_many(
            {"_id": {"$in": message_ids}},
            {"$set": {"exclude_from_context": True}}
        )
        
        # Create hidden summary for context
        summary_msg = {
            "chat_id": ObjectId(chat_id),
            "role": "system",
            "content": summary_content,
            "created_at": first_msg["created_at"],
            "is_summary": True,
            "hidden_from_ui": True,
            "replaces_messages": request.message_ids
        }
        
        result = await database.messages.insert_one(summary_msg)
        
        return {
            "success": True,
            "mode": "context_only",
            "excluded_count": len(original_messages),
            "summary_message_id": str(result.inserted_id),
            "original_tokens": original_tokens,
            "new_tokens": summary_tokens,
            "tokens_saved": original_tokens - summary_tokens
        }
    else:
        # Delete all messages and replace with summary
        delete_result = await database.messages.delete_many({
            "_id": {"$in": message_ids},
            "chat_id": ObjectId(chat_id)
        })
        
        summary_msg = {
            "chat_id": ObjectId(chat_id),
            "role": "system",
            "content": summary_content,
            "created_at": first_msg["created_at"],
            "is_summary": True
        }
        
        result = await database.messages.insert_one(summary_msg)
        
        return {
            "success": True,
            "mode": "replace",
            "deleted_count": delete_result.deleted_count,
            "summary_message_id": str(result.inserted_id),
            "original_tokens": original_tokens,
            "new_tokens": summary_tokens,
            "tokens_saved": original_tokens - summary_tokens
        }
