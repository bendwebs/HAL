"""Memory Models (Mem0-style)"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class MemoryBase(BaseModel):
    """Base memory fields"""
    content: str = Field(..., min_length=1, max_length=2000)
    category: str = "general"
    importance: float = Field(0.5, ge=0.0, le=1.0)


class MemoryCreate(MemoryBase):
    """Create memory request"""
    pass


class MemoryUpdate(BaseModel):
    """Update memory request"""
    content: Optional[str] = Field(None, min_length=1, max_length=2000)
    category: Optional[str] = None
    importance: Optional[float] = Field(None, ge=0.0, le=1.0)


class MemoryInDB(MemoryBase):
    """Memory as stored in database"""
    id: str = Field(..., alias="_id")
    user_id: str
    embedding: List[float] = Field(default_factory=list)
    source_chat_id: Optional[str] = None
    access_count: int = 0
    created_at: datetime
    last_accessed: Optional[datetime] = None
    
    class Config:
        populate_by_name = True


class MemoryResponse(BaseModel):
    """Memory response"""
    id: str
    content: str
    category: str
    importance: float
    source_chat_id: Optional[str]
    access_count: int
    created_at: datetime
    last_accessed: Optional[datetime]


class MemorySearchResult(BaseModel):
    """Memory search result with relevance score"""
    id: str
    content: str
    category: str
    importance: float
    relevance_score: float
    created_at: datetime


class MemoryListResponse(BaseModel):
    """Memory list response"""
    memories: List[MemoryResponse]
    total: int


class BulkDeleteRequest(BaseModel):
    """Bulk delete memories request"""
    memory_ids: List[str]


class MemoryCategory(BaseModel):
    """Memory category with count"""
    name: str
    count: int
