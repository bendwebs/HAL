"""Memories Router - Mem0-style memory management"""

from fastapi import APIRouter, HTTPException, status, Depends, Query
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, List, Optional

from app.database import database
from app.auth import get_current_user
from app.models.memory import (
    MemoryCreate, MemoryUpdate, MemoryResponse, 
    MemoryListResponse, BulkDeleteRequest, MemoryCategory
)

router = APIRouter(prefix="/memories", tags=["Memories"])


@router.get("", response_model=MemoryListResponse)
async def list_memories(
    current_user: Dict[str, Any] = Depends(get_current_user),
    category: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = Query("created_at", regex="^(created_at|importance|access_count)$"),
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List user's memories with filtering and sorting"""
    query = {"user_id": ObjectId(current_user["_id"])}
    
    if category:
        query["category"] = category
    
    if search:
        query["$text"] = {"$search": search}
    
    # Sort direction
    sort_dir = -1 if sort_order == "desc" else 1
    
    # Get total count
    total = await database.memories.count_documents(query)
    
    # Get memories
    cursor = database.memories.find(query)
    cursor = cursor.sort(sort_by, sort_dir)
    cursor = cursor.skip(offset).limit(limit)
    
    memories = await cursor.to_list(limit)
    
    return MemoryListResponse(
        memories=[
            MemoryResponse(
                id=str(m["_id"]),
                content=m["content"],
                category=m.get("category", "general"),
                importance=m.get("importance", 0.5),
                source_chat_id=str(m["source_chat_id"]) if m.get("source_chat_id") else None,
                access_count=m.get("access_count", 0),
                created_at=m["created_at"],
                last_accessed=m.get("last_accessed")
            )
            for m in memories
        ],
        total=total
    )


@router.get("/categories", response_model=List[MemoryCategory])
async def get_categories(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get memory categories with counts"""
    pipeline = [
        {"$match": {"user_id": ObjectId(current_user["_id"])}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    
    results = await database.memories.aggregate(pipeline).to_list(100)
    
    return [
        MemoryCategory(name=r["_id"] or "general", count=r["count"])
        for r in results
    ]


@router.post("", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
async def create_memory(
    memory_data: MemoryCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Create a new memory"""
    from app.services.memory_system import get_memory_system
    
    now = datetime.utcnow()
    
    # Generate embedding
    memory_system = get_memory_system()
    embedding = []
    if memory_system:
        embedding = await memory_system.generate_embedding(memory_data.content)
    
    memory_doc = {
        "user_id": ObjectId(current_user["_id"]),
        "content": memory_data.content,
        "category": memory_data.category,
        "importance": memory_data.importance,
        "embedding": embedding,
        "source_chat_id": None,
        "access_count": 0,
        "created_at": now,
        "last_accessed": None
    }
    
    result = await database.memories.insert_one(memory_doc)
    
    return MemoryResponse(
        id=str(result.inserted_id),
        content=memory_doc["content"],
        category=memory_doc["category"],
        importance=memory_doc["importance"],
        source_chat_id=None,
        access_count=0,
        created_at=now,
        last_accessed=None
    )


@router.get("/{memory_id}", response_model=MemoryResponse)
async def get_memory(
    memory_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get memory details"""
    memory = await database.memories.find_one({
        "_id": ObjectId(memory_id),
        "user_id": ObjectId(current_user["_id"])
    })
    
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    
    return MemoryResponse(
        id=str(memory["_id"]),
        content=memory["content"],
        category=memory.get("category", "general"),
        importance=memory.get("importance", 0.5),
        source_chat_id=str(memory["source_chat_id"]) if memory.get("source_chat_id") else None,
        access_count=memory.get("access_count", 0),
        created_at=memory["created_at"],
        last_accessed=memory.get("last_accessed")
    )


@router.put("/{memory_id}", response_model=MemoryResponse)
async def update_memory(
    memory_id: str,
    update: MemoryUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Update memory"""
    memory = await database.memories.find_one({
        "_id": ObjectId(memory_id),
        "user_id": ObjectId(current_user["_id"])
    })
    
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    
    updates = {}
    update_data = update.model_dump(exclude_unset=True)
    
    # Re-generate embedding if content changed
    if "content" in update_data:
        from app.services.memory_system import get_memory_system
        memory_system = get_memory_system()
        if memory_system:
            updates["embedding"] = await memory_system.generate_embedding(update_data["content"])
    
    updates.update(update_data)
    
    await database.memories.update_one(
        {"_id": ObjectId(memory_id)},
        {"$set": updates}
    )
    
    return await get_memory(memory_id, current_user)


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory(
    memory_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Delete memory"""
    result = await database.memories.delete_one({
        "_id": ObjectId(memory_id),
        "user_id": ObjectId(current_user["_id"])
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Memory not found")


@router.post("/bulk-delete", status_code=status.HTTP_204_NO_CONTENT)
async def bulk_delete_memories(
    request: BulkDeleteRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Delete multiple memories"""
    await database.memories.delete_many({
        "_id": {"$in": [ObjectId(id) for id in request.memory_ids]},
        "user_id": ObjectId(current_user["_id"])
    })


@router.get("/search/semantic")
async def search_memories(
    query: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    limit: int = Query(10, ge=1, le=50),
):
    """Search memories semantically"""
    from app.services.memory_system import get_memory_system
    
    memory_system = get_memory_system()
    if not memory_system:
        raise HTTPException(status_code=503, detail="Memory system not available")
    
    results = await memory_system.search_memories(
        user_id=current_user["_id"],
        query=query,
        limit=limit
    )
    
    return results
