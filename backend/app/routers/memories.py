"""Memories Router - Mem0-powered memory management"""

from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.services.memory_system import get_memory_system

router = APIRouter(prefix="/memories", tags=["Memories"])


# Request/Response Models
class MemoryCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)
    metadata: Optional[Dict[str, Any]] = None


class MemoryUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class ConversationAdd(BaseModel):
    messages: List[Dict[str, str]]
    metadata: Optional[Dict[str, Any]] = None


class MemoryResponse(BaseModel):
    id: str
    content: str
    score: Optional[float] = None
    metadata: Dict[str, Any] = {}
    categories: List[str] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class MemoryListResponse(BaseModel):
    memories: List[MemoryResponse]
    total: int


class SearchRequest(BaseModel):
    query: str
    limit: int = Field(10, ge=1, le=50)


class ConfirmMemoriesRequest(BaseModel):
    """Request to confirm or reject pending memories"""
    memories: List[str] = Field(..., description="List of memory contents to save")
    metadata: Optional[Dict[str, Any]] = None


@router.get("", response_model=MemoryListResponse)
async def list_memories(
    current_user: Dict[str, Any] = Depends(get_current_user),
    limit: int = Query(100, ge=1, le=500),
):
    """List all memories for the current user"""
    memory_system = get_memory_system()
    
    if not memory_system.is_available:
        raise HTTPException(
            status_code=503, 
            detail="Memory system not available. Please install mem0ai."
        )
    
    memories = await memory_system.get_all_memories(
        user_id=current_user["_id"],
        limit=limit
    )
    
    return MemoryListResponse(
        memories=[
            MemoryResponse(
                id=m["id"],
                content=m["content"],
                metadata=m.get("metadata") or {},
                categories=m.get("categories") or [],
                created_at=m.get("created_at"),
                updated_at=m.get("updated_at")
            )
            for m in memories
        ],
        total=len(memories)
    )


@router.post("", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
async def create_memory(
    memory_data: MemoryCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Create a new memory"""
    memory_system = get_memory_system()
    
    if not memory_system.is_available:
        raise HTTPException(status_code=503, detail="Memory system not available")
    
    result = await memory_system.add_memory(
        user_id=current_user["_id"],
        content=memory_data.content,
        metadata=memory_data.metadata
    )
    
    if not result:
        raise HTTPException(status_code=500, detail="Failed to create memory")
    
    # Get the created memory details
    # Mem0 returns results with the memory info
    memories = result.get("results", [])
    if memories:
        mem = memories[0]
        return MemoryResponse(
            id=mem.get("id", ""),
            content=mem.get("memory", memory_data.content),
            metadata=mem.get("metadata") or {},
            categories=mem.get("categories") or [],
            created_at=mem.get("created_at")
        )
    
    return MemoryResponse(
        id="",
        content=memory_data.content,
        metadata=memory_data.metadata or {}
    )


@router.post("/conversation", status_code=status.HTTP_201_CREATED)
async def add_conversation_memories(
    data: ConversationAdd,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Extract and store memories from a conversation
    
    Mem0 automatically extracts relevant facts from the conversation.
    """
    memory_system = get_memory_system()
    
    if not memory_system.is_available:
        raise HTTPException(status_code=503, detail="Memory system not available")
    
    result = await memory_system.add_conversation(
        user_id=current_user["_id"],
        messages=data.messages,
        metadata=data.metadata
    )
    
    if not result:
        return {"extracted": 0, "memories": []}
    
    memories = result.get("results", [])
    return {
        "extracted": len(memories),
        "memories": [
            {
                "id": m.get("id", ""),
                "content": m.get("memory", ""),
                "event": m.get("event", "ADD")
            }
            for m in memories
        ]
    }


@router.post("/search")
async def search_memories(
    search: SearchRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Search memories semantically"""
    memory_system = get_memory_system()
    
    if not memory_system.is_available:
        raise HTTPException(status_code=503, detail="Memory system not available")
    
    results = await memory_system.search_memories(
        user_id=current_user["_id"],
        query=search.query,
        limit=search.limit
    )
    
    return {
        "query": search.query,
        "results": results
    }


@router.get("/{memory_id}", response_model=MemoryResponse)
async def get_memory(
    memory_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get a specific memory"""
    memory_system = get_memory_system()
    
    if not memory_system.is_available:
        raise HTTPException(status_code=503, detail="Memory system not available")
    
    memory = await memory_system.get_memory(memory_id)
    
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    
    return MemoryResponse(
        id=memory["id"],
        content=memory["content"],
        metadata=memory.get("metadata") or {},
        categories=memory.get("categories") or [],
        created_at=memory.get("created_at"),
        updated_at=memory.get("updated_at")
    )


@router.put("/{memory_id}", response_model=MemoryResponse)
async def update_memory(
    memory_id: str,
    update: MemoryUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Update a memory"""
    memory_system = get_memory_system()
    
    if not memory_system.is_available:
        raise HTTPException(status_code=503, detail="Memory system not available")
    
    result = await memory_system.update_memory(memory_id, update.content)
    
    if not result:
        raise HTTPException(status_code=404, detail="Memory not found or update failed")
    
    # Fetch updated memory
    memory = await memory_system.get_memory(memory_id)
    if memory:
        return MemoryResponse(
            id=memory["id"],
            content=memory["content"],
            metadata=memory.get("metadata") or {},
            categories=memory.get("categories") or [],
            created_at=memory.get("created_at"),
            updated_at=memory.get("updated_at")
        )
    
    return MemoryResponse(id=memory_id, content=update.content)


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory(
    memory_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Delete a memory"""
    memory_system = get_memory_system()
    
    if not memory_system.is_available:
        raise HTTPException(status_code=503, detail="Memory system not available")
    
    success = await memory_system.delete_memory(memory_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Memory not found or delete failed")


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_memories(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Delete all memories for the current user"""
    memory_system = get_memory_system()
    
    if not memory_system.is_available:
        raise HTTPException(status_code=503, detail="Memory system not available")
    
    await memory_system.delete_all_memories(user_id=current_user["_id"])


@router.get("/{memory_id}/history")
async def get_memory_history(
    memory_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get history of a memory (previous versions)"""
    memory_system = get_memory_system()
    
    if not memory_system.is_available:
        raise HTTPException(status_code=503, detail="Memory system not available")
    
    history = memory_system.get_history(memory_id)
    return {"memory_id": memory_id, "history": history}


@router.post("/confirm", status_code=status.HTTP_201_CREATED)
async def confirm_memories(
    data: ConfirmMemoriesRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Confirm and save user-approved memories
    
    This endpoint saves memories that the user has explicitly approved.
    """
    memory_system = get_memory_system()
    
    if not memory_system.is_available:
        raise HTTPException(status_code=503, detail="Memory system not available")
    
    print(f"[DEBUG] Confirming {len(data.memories)} memories for user {current_user['_id']}")
    
    saved_memories = []
    for content in data.memories:
        if content.strip():
            print(f"[DEBUG] Saving memory: {content[:50]}...")
            result = await memory_system.add_memory(
                user_id=current_user["_id"],
                content=content.strip(),
                metadata=data.metadata
            )
            print(f"[DEBUG] Add memory result: {result}")
            if result:
                memories = result.get("results", [])
                for m in memories:
                    saved_memories.append({
                        "id": m.get("id", ""),
                        "content": m.get("memory", content),
                        "event": m.get("event", "ADD")
                    })
    
    print(f"[DEBUG] Saved {len(saved_memories)} memories")
    return {
        "saved": len(saved_memories),
        "memories": saved_memories
    }
