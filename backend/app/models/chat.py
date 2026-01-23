"""Chat Models"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class ChatVisibility(str, Enum):
    PRIVATE = "private"
    SHARED = "shared"
    PUBLIC = "public"


class SharePermission(str, Enum):
    READ = "read"
    WRITE = "write"


class SharedUser(BaseModel):
    """User with share access"""
    user_id: str
    permission: SharePermission = SharePermission.READ
    shared_at: datetime = Field(default_factory=datetime.utcnow)


class ChatBase(BaseModel):
    """Base chat fields"""
    title: str = "New Chat"
    persona_id: Optional[str] = None
    model_override: Optional[str] = None
    tts_enabled: bool = False
    tts_voice_id: Optional[str] = None
    voice_mode: bool = False  # Enable conversational voice mode
    enabled_tools: Optional[List[str]] = None  # None = use defaults, [] = no tools


class ChatCreate(ChatBase):
    """Create chat request"""
    pass


class ChatUpdate(BaseModel):
    """Update chat request"""
    title: Optional[str] = None
    persona_id: Optional[str] = None
    model_override: Optional[str] = None
    tts_enabled: Optional[bool] = None
    tts_voice_id: Optional[str] = None
    voice_mode: Optional[bool] = None
    enabled_tools: Optional[List[str]] = None


class ShareRequest(BaseModel):
    """Share chat request"""
    user_ids: List[str]
    permission: SharePermission = SharePermission.READ
    include_history: bool = True  # True = share full history, False = fresh chat


class MakePublicRequest(BaseModel):
    """Make chat public request"""
    include_history: bool = True


class ChatInDB(ChatBase):
    """Chat as stored in database"""
    id: str = Field(..., alias="_id")
    user_id: str
    visibility: ChatVisibility = ChatVisibility.PRIVATE
    shared_with: List[SharedUser] = Field(default_factory=list)
    share_includes_history: bool = True
    created_at: datetime
    updated_at: datetime
    
    class Config:
        populate_by_name = True


class ChatResponse(BaseModel):
    """Chat response"""
    id: str
    user_id: str
    title: str
    persona_id: Optional[str]
    model_override: Optional[str]
    tts_enabled: bool = False
    tts_voice_id: Optional[str] = None
    voice_mode: bool = False
    enabled_tools: Optional[List[str]] = None
    visibility: ChatVisibility
    shared_with: List[SharedUser]
    share_includes_history: bool
    created_at: datetime
    updated_at: datetime
    
    # Computed fields for UI
    is_owner: bool = True
    can_write: bool = True


class ChatListResponse(BaseModel):
    """Chat list item response"""
    id: str
    title: str
    visibility: ChatVisibility
    persona_id: Optional[str]
    updated_at: datetime
    is_owner: bool
    message_count: int = 0
