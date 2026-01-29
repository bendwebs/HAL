"""Context Management Router - Token tracking and context window management"""

from fastapi import APIRouter, HTTPException, Depends, Query
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import tiktoken
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


class SummarizeRequest(BaseModel):
    """Request to summarize and compact messages"""
    group_ids: List[str]
    keep_recent: int = 5  # Keep N most recent messages unsummarized


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
                # Ollama returns model info including parameters
                model_info = data.get("model_info", {})
                parameters = data.get("parameters", "")
                
                # Try to extract context length from parameters or model_info
                context_length = None
                
                # Check model_info for context_length
                for key in model_info:
                    if "context" in key.lower():
                        context_length = model_info[key]
                        break
                
                # If not found, use our known sizes
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
    
    # Fallback to known sizes
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
    # Get chat
    chat = await database.chats.find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    # Check access
    user_id = current_user["_id"]
    if str(chat["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get messages
    messages = await database.messages.find(
        {"chat_id": ObjectId(chat_id)}
    ).sort("created_at", 1).to_list(1000)
    
    # Get model info
    model = chat.get("model_override") or settings.default_chat_model
    max_tokens = MODEL_CONTEXT_SIZES.get(model, MODEL_CONTEXT_SIZES.get("default"))
    
    # Get persona system prompt if any
    system_prompt_tokens = 0
    if chat.get("persona_id"):
        persona = await database.personas.find_one({"_id": chat["persona_id"]})
        if persona and persona.get("system_prompt"):
            system_prompt_tokens = estimate_tokens(persona["system_prompt"])
    
    # Calculate message tokens and group them
    total_message_tokens = 0
    groups = []
    current_group_messages = []
    current_group_tokens = 0
    current_group_start = None
    group_counter = 0
    
    # Group messages by conversation turns (roughly every 4-6 exchanges or by topic)
    for i, msg in enumerate(messages):
        content = msg.get("content", "")
        thinking = msg.get("thinking", "") or ""
        msg_tokens = estimate_tokens(content) + estimate_tokens(thinking)
        
        # Add overhead for role markers etc
        msg_tokens += 10
        
        total_message_tokens += msg_tokens
        
        if current_group_start is None:
            current_group_start = msg["created_at"]
        
        current_group_messages.append(msg)
        current_group_tokens += msg_tokens
        
        # Create a new group every 6 messages or 2000 tokens
        if len(current_group_messages) >= 6 or current_group_tokens >= 2000:
            group_counter += 1
            
            # Generate a simple title from first user message
            first_user_msg = next(
                (m for m in current_group_messages if m["role"] == "user"), 
                None
            )
            title = "Conversation"
            if first_user_msg:
                content = first_user_msg.get("content", "")[:50]
                title = content + "..." if len(first_user_msg.get("content", "")) > 50 else content
            
            groups.append(MessageGroup(
                id=f"group_{group_counter}",
                title=title or f"Messages {group_counter}",
                summary="",  # Will be generated on demand
                message_ids=[str(m["_id"]) for m in current_group_messages],
                token_count=current_group_tokens,
                start_time=current_group_start.isoformat(),
                end_time=current_group_messages[-1]["created_at"].isoformat(),
                message_count=len(current_group_messages)
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
        title = "Conversation"
        if first_user_msg:
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
            message_count=len(current_group_messages)
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


@router.post("/chat/{chat_id}/summarize-group/{group_id}")
async def summarize_message_group(
    chat_id: str,
    group_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Generate a summary for a message group using the LLM"""
    import ollama
    
    # Get chat
    chat = await database.chats.find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    # Check access
    if str(chat["user_id"]) != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get analysis to find the group
    analysis = await analyze_chat_context(chat_id, current_user)
    
    group = next((g for g in analysis.groups if g.id == group_id), None)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Get the messages in this group
    message_ids = [ObjectId(mid) for mid in group.message_ids]
    messages = await database.messages.find(
        {"_id": {"$in": message_ids}}
    ).sort("created_at", 1).to_list(100)
    
    # Format messages for summarization
    conversation_text = ""
    for msg in messages:
        role = "User" if msg["role"] == "user" else "Assistant"
        content = msg.get("content", "")[:500]  # Limit content length
        conversation_text += f"{role}: {content}\n\n"
    
    # Generate summary using Ollama
    try:
        client = ollama.Client(host=settings.ollama_base_url)
        response = client.chat(
            model=settings.default_chat_model,
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that creates concise summaries. Summarize the following conversation in 2-3 sentences, capturing the key topics discussed and any important conclusions or decisions."
                },
                {
                    "role": "user",
                    "content": f"Summarize this conversation:\n\n{conversation_text}"
                }
            ],
            options={"temperature": 0.3}
        )
        
        summary = response['message']['content']
        
        return {
            "group_id": group_id,
            "summary": summary,
            "message_count": len(messages),
            "original_tokens": group.token_count,
            "summary_tokens": estimate_tokens(summary)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate summary: {str(e)}"
        )


@router.delete("/chat/{chat_id}/messages")
async def delete_messages(
    chat_id: str,
    message_ids: List[str],
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Delete specific messages to free up context space"""
    # Get chat
    chat = await database.chats.find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    # Check access
    if str(chat["user_id"]) != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Delete messages
    object_ids = [ObjectId(mid) for mid in message_ids]
    result = await database.messages.delete_many({
        "_id": {"$in": object_ids},
        "chat_id": ObjectId(chat_id)
    })
    
    return {
        "deleted": result.deleted_count,
        "message": f"Deleted {result.deleted_count} messages"
    }
