"""Messages Router - Handles chat messages and AI responses"""

from fastapi import APIRouter, HTTPException, status, Depends, Query
from fastapi.responses import StreamingResponse
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, List, Optional, AsyncGenerator
import json
import uuid

from app.database import database
from app.auth import get_current_user
from app.models.message import (
    MessageCreate, MessageResponse, MessageRole, 
    MessageAction, ActionType, ActionStatus, TokenUsage, StreamChunk
)
from app.models.chat import ChatVisibility, SharePermission

router = APIRouter(prefix="/chats/{chat_id}/messages", tags=["Messages"])


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
    
    # Build query
    query = {"chat_id": ObjectId(chat_id)}
    
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
                    model_override=chat.get("model_override")
                ):
                    # Update full response for saving
                    if chunk["type"] == "thinking":
                        full_response["thinking"] = chunk["data"].get("content", "")
                    elif chunk["type"] == "content":
                        full_response["content"] += chunk["data"].get("delta", "")
                    elif chunk["type"] == "action_complete":
                        full_response["actions"].append(chunk["data"])
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
                
                # Auto-extract memories using Mem0
                recent_messages = await database.messages.find(
                    {"chat_id": ObjectId(chat_id)}
                ).sort("created_at", -1).limit(6).to_list(6)
                
                if len(recent_messages) >= 2:
                    recent_messages.reverse()
                    from app.services.memory_system import get_memory_system
                    memory_system = get_memory_system()
                    
                    if memory_system.is_available:
                        # Format messages for Mem0
                        formatted_messages = [
                            {"role": m["role"], "content": m["content"]} 
                            for m in recent_messages
                        ]
                        
                        result = await memory_system.add_conversation(
                            user_id=current_user["_id"],
                            messages=formatted_messages,
                            metadata={"chat_id": chat_id}
                        )
                        
                        if result:
                            extracted = result.get("results", [])
                            if extracted:
                                yield f"data: {json.dumps({'type': 'memories_extracted', 'data': {'count': len(extracted), 'memories': [{'id': m.get('id', ''), 'content': m.get('memory', ''), 'event': m.get('event', 'ADD')} for m in extracted]}})}\n\n"
                
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
            model_override=chat.get("model_override")
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
