"""Chats Router"""

from fastapi import APIRouter, HTTPException, status, Depends, Query
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, List, Optional

from app.database import database
from app.auth import get_current_user
from app.models.chat import (
    ChatCreate, ChatUpdate, ChatResponse, ChatListResponse,
    ChatVisibility, ShareRequest, MakePublicRequest, SharedUser, SharePermission
)

router = APIRouter(prefix="/chats", tags=["Chats"])


async def get_chat_with_permission(
    chat_id: str,
    user: Dict[str, Any],
    require_write: bool = False
) -> Dict[str, Any]:
    """Get chat and verify user has permission"""
    try:
        chat = await database.chats.find_one({"_id": ObjectId(chat_id)})
    except:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    user_id = user["_id"]
    is_owner = str(chat["user_id"]) == user_id
    
    # Check permissions
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


@router.get("", response_model=List[ChatListResponse])
async def list_chats(
    current_user: Dict[str, Any] = Depends(get_current_user),
    include_shared: bool = Query(True),
    include_public: bool = Query(False),
):
    """List user's chats"""
    user_id = current_user["_id"]
    
    # Build query
    query_conditions = [{"user_id": ObjectId(user_id)}]
    
    if include_shared:
        query_conditions.append({
            "shared_with.user_id": user_id,
            "visibility": ChatVisibility.SHARED
        })
    
    if include_public:
        query_conditions.append({"visibility": ChatVisibility.PUBLIC})
    
    query = {"$or": query_conditions} if len(query_conditions) > 1 else query_conditions[0]
    
    # Get chats with message count
    pipeline = [
        {"$match": query},
        {"$sort": {"updated_at": -1}},
        {"$lookup": {
            "from": "messages",
            "localField": "_id",
            "foreignField": "chat_id",
            "as": "messages"
        }},
        {"$addFields": {"message_count": {"$size": "$messages"}}},
        {"$project": {"messages": 0}}
    ]
    
    chats = await database.chats.aggregate(pipeline).to_list(100)
    
    return [
        ChatListResponse(
            id=str(chat["_id"]),
            title=chat["title"],
            visibility=chat["visibility"],
            persona_id=str(chat["persona_id"]) if chat.get("persona_id") else None,
            updated_at=chat["updated_at"],
            is_owner=str(chat["user_id"]) == user_id,
            message_count=chat.get("message_count", 0)
        )
        for chat in chats
    ]


@router.post("", response_model=ChatResponse, status_code=status.HTTP_201_CREATED)
async def create_chat(
    chat_data: ChatCreate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Create a new chat"""
    now = datetime.utcnow()
    
    chat_doc = {
        "user_id": ObjectId(current_user["_id"]),
        "title": chat_data.title,
        "persona_id": ObjectId(chat_data.persona_id) if chat_data.persona_id else None,
        "model_override": chat_data.model_override,
        "visibility": ChatVisibility.PRIVATE,
        "shared_with": [],
        "share_includes_history": True,
        "created_at": now,
        "updated_at": now,
    }
    
    result = await database.chats.insert_one(chat_doc)
    chat_id = str(result.inserted_id)
    
    return ChatResponse(
        id=chat_id,
        user_id=current_user["_id"],
        title=chat_doc["title"],
        persona_id=str(chat_doc["persona_id"]) if chat_doc["persona_id"] else None,
        model_override=chat_doc["model_override"],
        visibility=chat_doc["visibility"],
        shared_with=[],
        share_includes_history=True,
        created_at=now,
        updated_at=now,
        is_owner=True,
        can_write=True
    )


@router.get("/{chat_id}", response_model=ChatResponse)
async def get_chat(
    chat_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get chat details"""
    chat = await get_chat_with_permission(chat_id, current_user)
    user_id = current_user["_id"]
    is_owner = str(chat["user_id"]) == user_id
    
    # Determine write permission
    can_write = is_owner
    if not is_owner:
        for share in chat.get("shared_with", []):
            if share["user_id"] == user_id and share["permission"] == SharePermission.WRITE:
                can_write = True
                break
    
    return ChatResponse(
        id=str(chat["_id"]),
        user_id=str(chat["user_id"]),
        title=chat["title"],
        persona_id=str(chat["persona_id"]) if chat.get("persona_id") else None,
        model_override=chat.get("model_override"),
        visibility=chat["visibility"],
        shared_with=[
            SharedUser(**s) for s in chat.get("shared_with", [])
        ],
        share_includes_history=chat.get("share_includes_history", True),
        created_at=chat["created_at"],
        updated_at=chat["updated_at"],
        is_owner=is_owner,
        can_write=can_write
    )


@router.put("/{chat_id}", response_model=ChatResponse)
async def update_chat(
    chat_id: str,
    update: ChatUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Update chat"""
    chat = await get_chat_with_permission(chat_id, current_user, require_write=True)
    
    updates = {"updated_at": datetime.utcnow()}
    
    if update.title is not None:
        updates["title"] = update.title
    if update.persona_id is not None:
        updates["persona_id"] = ObjectId(update.persona_id) if update.persona_id else None
    if update.model_override is not None:
        updates["model_override"] = update.model_override
    
    await database.chats.update_one(
        {"_id": ObjectId(chat_id)},
        {"$set": updates}
    )
    
    return await get_chat(chat_id, current_user)


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(
    chat_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Delete chat (owner only)"""
    chat = await get_chat_with_permission(chat_id, current_user)
    
    if str(chat["user_id"]) != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only owner can delete chat")
    
    # Delete messages
    await database.messages.delete_many({"chat_id": ObjectId(chat_id)})
    
    # Delete chat
    await database.chats.delete_one({"_id": ObjectId(chat_id)})


@router.post("/{chat_id}/share", response_model=ChatResponse)
async def share_chat(
    chat_id: str,
    share_request: ShareRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Share chat with specific users"""
    chat = await get_chat_with_permission(chat_id, current_user)
    
    if str(chat["user_id"]) != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only owner can share chat")
    
    now = datetime.utcnow()
    new_shares = []
    
    for user_id in share_request.user_ids:
        # Verify user exists
        user = await database.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            continue
        
        # Don't share with self
        if user_id == current_user["_id"]:
            continue
        
        new_shares.append({
            "user_id": user_id,
            "permission": share_request.permission,
            "shared_at": now
        })
    
    if not new_shares:
        raise HTTPException(status_code=400, detail="No valid users to share with")
    
    # Update chat
    await database.chats.update_one(
        {"_id": ObjectId(chat_id)},
        {
            "$set": {
                "visibility": ChatVisibility.SHARED,
                "share_includes_history": share_request.include_history,
                "updated_at": now
            },
            "$addToSet": {"shared_with": {"$each": new_shares}}
        }
    )
    
    return await get_chat(chat_id, current_user)


@router.delete("/{chat_id}/share/{user_id}", response_model=ChatResponse)
async def unshare_chat(
    chat_id: str,
    user_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Remove user from chat share list"""
    chat = await get_chat_with_permission(chat_id, current_user)
    
    if str(chat["user_id"]) != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only owner can modify sharing")
    
    await database.chats.update_one(
        {"_id": ObjectId(chat_id)},
        {
            "$pull": {"shared_with": {"user_id": user_id}},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    
    # Check if any shares remain
    updated_chat = await database.chats.find_one({"_id": ObjectId(chat_id)})
    if not updated_chat.get("shared_with"):
        await database.chats.update_one(
            {"_id": ObjectId(chat_id)},
            {"$set": {"visibility": ChatVisibility.PRIVATE}}
        )
    
    return await get_chat(chat_id, current_user)


@router.post("/{chat_id}/make-public", response_model=ChatResponse)
async def make_chat_public(
    chat_id: str,
    request: MakePublicRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Make chat public"""
    chat = await get_chat_with_permission(chat_id, current_user)
    
    if str(chat["user_id"]) != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only owner can make chat public")
    
    await database.chats.update_one(
        {"_id": ObjectId(chat_id)},
        {
            "$set": {
                "visibility": ChatVisibility.PUBLIC,
                "share_includes_history": request.include_history,
                "shared_with": [],
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    return await get_chat(chat_id, current_user)


@router.post("/{chat_id}/make-private", response_model=ChatResponse)
async def make_chat_private(
    chat_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Make chat private"""
    chat = await get_chat_with_permission(chat_id, current_user)
    
    if str(chat["user_id"]) != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only owner can change visibility")
    
    await database.chats.update_one(
        {"_id": ObjectId(chat_id)},
        {
            "$set": {
                "visibility": ChatVisibility.PRIVATE,
                "shared_with": [],
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    return await get_chat(chat_id, current_user)
