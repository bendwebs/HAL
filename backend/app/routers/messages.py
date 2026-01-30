"""Messages Router - Handles chat messages and AI responses"""
# Force reload trigger

from fastapi import APIRouter, HTTPException, status, Depends, Query
from fastapi.responses import StreamingResponse
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, List, Optional, AsyncGenerator
import json
import uuid
import logging

logger = logging.getLogger(__name__)

from app.database import database
from app.auth import get_current_user
from app.models.message import (
    MessageCreate, MessageResponse, MessageRole, 
    MessageAction, ActionType, ActionStatus, TokenUsage, StreamChunk
)
from app.models.chat import ChatVisibility, SharePermission
from app.models.tool import ToolPermissionLevel
from app.models.user import UserRole

router = APIRouter(prefix="/chats/{chat_id}/messages", tags=["Messages"])


async def get_allowed_tools(user: Dict[str, Any], requested_tools: Optional[List[str]] = None) -> Optional[List[str]]:
    """Filter tools based on admin permission levels.
    
    This ensures that even if a chat has a DISABLED tool in its enabled_tools list,
    it won't be passed to the agent. Admin permissions always take precedence.
    
    Args:
        user: Current user dict
        requested_tools: List of tool names from chat.enabled_tools (or None for defaults)
    
    Returns:
        Filtered list of tool names that the user is actually allowed to use
    """
    if requested_tools is None:
        # If no tools specified, return None to let agent use defaults
        # But we still need to filter out DISABLED tools from defaults
        requested_tools = [
            "web_search", "youtube_search", "generate_image", 
            "document_search", "memory_recall", "memory_store", "calculator"
        ]
    
    is_admin = user.get("role") == UserRole.ADMIN
    
    # Get all tools with their permission levels from database
    tools = await database.tools.find(
        {"name": {"$in": requested_tools}}
    ).to_list(100)
    
    tool_permissions = {t["name"]: t.get("permission_level", ToolPermissionLevel.USER_TOGGLE) for t in tools}
    
    allowed = []
    for tool_name in requested_tools:
        perm = tool_permissions.get(tool_name, ToolPermissionLevel.USER_TOGGLE)
        
        # DISABLED tools are never available to anyone
        if perm == ToolPermissionLevel.DISABLED:
            logger.info(f"[TOOL FILTER] Tool '{tool_name}' is DISABLED - excluding from chat (applies to all users)")
            continue
        
        # ADMIN_ONLY tools only available to admins
        if perm == ToolPermissionLevel.ADMIN_ONLY and not is_admin:
            logger.info(f"[TOOL FILTER] Tool '{tool_name}' is ADMIN_ONLY - excluding for non-admin user")
            continue
        
        # All other permission levels: USER_TOGGLE, OPT_IN, ALWAYS_ON are allowed
        allowed.append(tool_name)
    
    logger.info(f"[TOOL FILTER] Requested: {requested_tools}, Allowed: {allowed}")
    return allowed if allowed else None


async def get_chat_with_permission(chat_id: str, user: Dict[str, Any], require_write: bool = False):
    """Get chat and verify user has permission"""
    try:
        chat = await database.chats.find_one({"_id": ObjectId(chat_id)})
    except:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    user_id = user["_id"]
    is_owner = str(chat["user_id"]) == user_id
    
    if is_owner:
        return chat
    
    if chat["visibility"] == ChatVisibility.PUBLIC:
        if require_write:
            raise HTTPException(status_code=403, detail="Cannot modify public chat")
        return chat
    
    if chat["visibility"] == ChatVisibility.SHARED:
        for share in chat.get("shared_with", []):
            if share["user_id"] == user_id:
                if require_write and share["permission"] != SharePermission.WRITE:
                    raise HTTPException(status_code=403, detail="No write permission")
                return chat
    
    raise HTTPException(status_code=403, detail="Access denied")


@router.get("", response_model=List[MessageResponse])
async def list_messages(
    chat_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=200),
    before: Optional[str] = None,
):
    """List messages in a chat"""
    chat = await get_chat_with_permission(chat_id, current_user)
    
    user_id = current_user["_id"]
    is_owner = str(chat["user_id"]) == user_id
    
    # Build query - exclude messages hidden from UI
    query = {
        "chat_id": ObjectId(chat_id),
        "$or": [
            {"hidden_from_ui": {"$ne": True}},
            {"hidden_from_ui": {"$exists": False}}
        ]
    }
    
    # Check if user should see history
    if not is_owner and not chat.get("share_includes_history", True):
        shared_at = None
        for share in chat.get("shared_with", []):
            if share["user_id"] == user_id:
                shared_at = share.get("shared_at")
                break
        
        if shared_at:
            query["created_at"] = {"$gte": shared_at}
    
    # Add pagination
    if before:
        try:
            query["_id"] = {"$lt": ObjectId(before)}
        except:
            pass
    
    messages = await database.messages.find(query).sort("created_at", 1).limit(limit).to_list(limit)
    
    return [
        MessageResponse(
            id=str(msg["_id"]),
            chat_id=str(msg["chat_id"]),
            role=msg["role"],
            content=msg["content"],
            thinking=msg.get("thinking"),
            actions=msg.get("actions", []),
            document_ids=[str(d) for d in msg.get("document_ids", [])],
            model_used=msg.get("model_used"),
            token_usage=TokenUsage(**msg["token_usage"]) if msg.get("token_usage") else None,
            created_at=msg["created_at"]
        )
        for msg in messages
    ]


@router.post("")
async def send_message(
    chat_id: str,
    message_data: MessageCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    stream: bool = Query(True),
):
    """Send a message and get AI response"""
    from app.services.agent_system import get_agent_system
    
    chat = await get_chat_with_permission(chat_id, current_user, require_write=True)
    
    now = datetime.utcnow()
    
    # Save user message
    user_msg_doc = {
        "chat_id": ObjectId(chat_id),
        "role": MessageRole.USER,
        "content": message_data.content,
        "document_ids": [ObjectId(d) for d in message_data.document_ids],
        "created_at": now
    }
    
    await database.messages.insert_one(user_msg_doc)
    
    # Update chat timestamp
    await database.chats.update_one(
        {"_id": ObjectId(chat_id)},
        {"$set": {"updated_at": now}}
    )
    
    agent_system = get_agent_system()
    
    # Filter tools based on admin permissions - this is the key fix
    # Even if chat.enabled_tools contains a DISABLED tool, it will be filtered out
    allowed_tools = await get_allowed_tools(current_user, chat.get("enabled_tools"))
    
    if stream:
        # Streaming response
        async def generate() -> AsyncGenerator[str, None]:
            full_response = {
                "content": "",
                "thinking": None,
                "actions": [],
                "model_used": None,
                "token_usage": None
            }
            
            try:
                async for chunk in agent_system.generate_response_stream(
                    chat_id=chat_id,
                    user_id=current_user["_id"],
                    message=message_data.content,
                    document_ids=message_data.document_ids,
                    persona_id=str(chat.get("persona_id")) if chat.get("persona_id") else None,
                    model_override=chat.get("model_override"),
                    voice_mode=chat.get("voice_mode", False),
                    enabled_tools=allowed_tools  # Use filtered tools
                ):
                    # Update full response for saving
                    if chunk["type"] == "thinking":
                        full_response["thinking"] = chunk["data"].get("content", "")
                    elif chunk["type"] == "content":
                        full_response["content"] += chunk["data"].get("delta", "")
                    elif chunk["type"] == "action_complete":
                        full_response["actions"].append(chunk["data"])
                        logger.info(f"[SSE] Yielding action_complete for {chunk['data'].get('name')}, status={chunk['data'].get('status')}")
                    elif chunk["type"] == "done":
                        full_response["model_used"] = chunk["data"].get("model")
                        full_response["token_usage"] = chunk["data"].get("token_usage")
                    
                    yield f"data: {json.dumps(chunk)}\n\n"
                
                # Save assistant message
                assistant_msg_doc = {
                    "chat_id": ObjectId(chat_id),
                    "role": MessageRole.ASSISTANT,
                    "content": full_response["content"],
                    "thinking": full_response.get("thinking"),
                    "actions": full_response.get("actions", []),
                    "model_used": full_response.get("model_used"),
                    "token_usage": full_response.get("token_usage"),
                    "created_at": datetime.utcnow()
                }
                
                result = await database.messages.insert_one(assistant_msg_doc)
                
                # Send final message with ID
                yield f"data: {json.dumps({'type': 'saved', 'data': {'message_id': str(result.inserted_id)}})}\n\n"
                
                # Auto-generate title if this is the first exchange
                # Applies to "New Chat" and "Voice Conversation" titles
                current_title = chat.get("title", "").strip().lower()
                needs_title = current_title in ["new chat", "voice conversation", ""]
                
                if needs_title:
                    message_count = await database.messages.count_documents({"chat_id": ObjectId(chat_id)})
                    if message_count >= 2:  # At least user message + assistant response
                        try:
                            from app.services.ollama_client import get_ollama_client
                            ollama = get_ollama_client()
                            
                            # Get first user message for title generation
                            first_user_msg = await database.messages.find_one(
                                {"chat_id": ObjectId(chat_id), "role": "user"},
                                sort=[("created_at", 1)]
                            )
                            
                            if first_user_msg:
                                title_prompt = f"Generate a very short title (3-6 words max) for a chat that starts with this message: \"{first_user_msg['content'][:200]}\"\n\nRespond with ONLY the title, no quotes, no explanation."
                                
                                title_response = await ollama.chat(
                                    model=chat.get("model_override") or "qwen2.5:7b",
                                    messages=[{"role": "user", "content": title_prompt}]
                                )
                                
                                new_title = title_response.get("message", {}).get("content", "").strip()
                                # Clean up the title
                                new_title = new_title.strip('"\'').strip()
                                if new_title and len(new_title) <= 50:
                                    await database.chats.update_one(
                                        {"_id": ObjectId(chat_id)},
                                        {"$set": {"title": new_title}}
                                    )
                                    yield f"data: {json.dumps({'type': 'title_updated', 'data': {'title': new_title}})}\n\n"
                        except Exception as e:
                            print(f"Failed to auto-generate title: {e}")
                
                # Extract and save memories in background (don't block the response)
                import asyncio
                
                async def extract_and_save_memories():
                    """Background task to extract and save memories"""
                    try:
                        print(f"[DEBUG] Starting background memory extraction for chat {chat_id}")
                        recent_msgs = await database.messages.find(
                            {"chat_id": ObjectId(chat_id)}
                        ).sort("created_at", -1).limit(6).to_list(6)
                        
                        if len(recent_msgs) >= 2:
                            recent_msgs.reverse()
                            from app.services.memory_system import get_memory_system
                            mem_system = get_memory_system()
                            
                            if mem_system.is_available:
                                formatted = [
                                    {"role": m["role"], "content": m["content"]} 
                                    for m in recent_msgs
                                ]
                                
                                result = await mem_system.extract_memories(
                                    user_id=current_user["_id"],
                                    messages=formatted,
                                    metadata={"chat_id": chat_id}
                                )
                                
                                if result:
                                    pending = result.get("pending", [])
                                    for memory_content in pending:
                                        add_result = await mem_system.add_memory(
                                            user_id=current_user["_id"],
                                            content=memory_content,
                                            metadata={"chat_id": chat_id, "auto_extracted": True}
                                        )
                                        if add_result and not add_result.get("skipped"):
                                            print(f"[DEBUG] Background saved memory: {memory_content[:60]}...")
                                        elif add_result and add_result.get("skipped"):
                                            print(f"[DEBUG] Skipped duplicate memory: {memory_content[:60]}...")
                                
                                # Periodically consolidate memories (every ~20 messages)
                                total_msgs = await database.messages.count_documents(
                                    {"chat_id": {"$in": await database.chats.distinct("_id", {"user_id": ObjectId(current_user["_id"])})}}
                                )
                                if total_msgs > 0 and total_msgs % 20 == 0:
                                    print(f"[DEBUG] Triggering periodic memory consolidation (message #{total_msgs})")
                                    consolidate_result = await mem_system.auto_consolidate(
                                        user_id=current_user["_id"],
                                        threshold=0.80
                                    )
                                    print(f"[DEBUG] Consolidation result: {consolidate_result}")
                                    
                    except Exception as e:
                        print(f"[DEBUG] Background memory extraction error: {e}")
                        import traceback
                        traceback.print_exc()
                
                # Start background task (non-blocking)
                asyncio.create_task(extract_and_save_memories())
                
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'data': {'message': str(e)}})}\n\n"
        
        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        )
    else:
        # Non-streaming response
        response = await agent_system.generate_response(
            chat_id=chat_id,
            user_id=current_user["_id"],
            message=message_data.content,
            document_ids=message_data.document_ids,
            persona_id=str(chat.get("persona_id")) if chat.get("persona_id") else None,
            model_override=chat.get("model_override"),
            voice_mode=chat.get("voice_mode", False),
            enabled_tools=allowed_tools  # Use filtered tools
        )
        
        # Save assistant message
        assistant_msg_doc = {
            "chat_id": ObjectId(chat_id),
            "role": MessageRole.ASSISTANT,
            "content": response["content"],
            "thinking": response.get("thinking"),
            "actions": response.get("actions", []),
            "model_used": response.get("model_used"),
            "token_usage": response.get("token_usage"),
            "created_at": datetime.utcnow()
        }
        
        result = await database.messages.insert_one(assistant_msg_doc)
        
        return MessageResponse(
            id=str(result.inserted_id),
            chat_id=chat_id,
            role=MessageRole.ASSISTANT,
            content=assistant_msg_doc["content"],
            thinking=assistant_msg_doc.get("thinking"),
            actions=assistant_msg_doc.get("actions", []),
            document_ids=[],
            model_used=assistant_msg_doc.get("model_used"),
            token_usage=TokenUsage(**assistant_msg_doc["token_usage"]) if assistant_msg_doc.get("token_usage") else None,
            created_at=assistant_msg_doc["created_at"]
        )
