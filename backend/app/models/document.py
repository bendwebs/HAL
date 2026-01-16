"""Document Models"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class DocumentBase(BaseModel):
    """Base document fields"""
    filename: str
    content_type: str


class DocumentCreate(BaseModel):
    """Document metadata for upload"""
    pass  # File comes via form data


class DocumentInDB(DocumentBase):
    """Document as stored in database"""
    id: str = Field(..., alias="_id")
    user_id: str
    original_filename: str
    file_path: str
    file_size: int
    chunk_count: int = 0
    vector_ids: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    
    class Config:
        populate_by_name = True


class DocumentResponse(BaseModel):
    """Document response"""
    id: str
    filename: str
    original_filename: str
    content_type: str
    file_size: int
    chunk_count: int
    created_at: datetime


class DocumentListResponse(BaseModel):
    """Document list response"""
    documents: List[DocumentResponse]
    total: int
    total_size: int


class DocumentChunkInDB(BaseModel):
    """Document chunk as stored in database"""
    id: str = Field(..., alias="_id")
    document_id: str
    user_id: str
    content: str
    embedding: List[float] = Field(default_factory=list)
    chunk_index: int
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    
    class Config:
        populate_by_name = True


class SearchResult(BaseModel):
    """RAG search result"""
    document_id: str
    document_name: str
    chunk_index: int
    content: str
    score: float
    metadata: Dict[str, Any]
