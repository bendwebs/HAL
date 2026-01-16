"""Memory Models (Mem0-style)"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class MemoryType(str, Enum):
    """Types of memories"""
    FACT = "fact"           # Factual information: "User works at Acme Corp"
    PREFERENCE = "preference"  # Likes/dislikes: "User prefers dark mode"
    GOAL = "goal"           # Goals/aspirations: "User wants to learn Python"
    CONTEXT = "context"     # Situational: "User is planning a trip to Japan"
    RELATIONSHIP = "relationship"  # People/connections: "User's manager is Sarah"
    GENERAL = "general"     # Uncategorized


class MemoryBase(BaseModel):
    """Base memory fields"""
    content: str = Field(..., min_length=1, max_length=2000)
    category: str = "general"
    memory_type: MemoryType = MemoryType.GENERAL
    importance: float = Field(0.5, ge=0.0, le=1.0)


class MemoryCreate(MemoryBase):
    """Create memory request"""
    pass


class MemoryUpdate(BaseModel):
    """Update memory request"""
    content: Optional[str] = Field(None, min_length=1, max_length=2000)
    category: Optional[str] = None
    memory_type: Optional[MemoryType] = None
    importance: Optional[float] = Field(None, ge=0.0, le=1.0)


class MemoryInDB(MemoryBase):
    """Memory as stored in database"""
    id: str = Field(..., alias="_id")
    user_id: str
    embedding: List[float] = Field(default_factory=list)
    source_chat_id: Optional[str] = None
    access_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_accessed: Optional[datetime] = None
    superseded_by: Optional[str] = None  # If consolidated into another memory
    
    class Config:
        populate_by_name = True


class MemoryResponse(BaseModel):
    """Memory response"""
    id: str
    content: str
    category: str
    memory_type: MemoryType = MemoryType.GENERAL
    importance: float
    source_chat_id: Optional[str]
    access_count: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_accessed: Optional[datetime] = None


class MemorySearchResult(BaseModel):
    """Memory search result with relevance score"""
    id: str
    content: str
    category: str
    memory_type: MemoryType
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


class MemoryTypeCount(BaseModel):
    """Memory type with count"""
    memory_type: MemoryType
    count: int


class MemoryUsage(BaseModel):
    """Memory usage info for chat responses"""
    id: str
    content: str
    memory_type: MemoryType
    relevance_score: float
