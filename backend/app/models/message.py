"""Message Models"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class ActionType(str, Enum):
    TOOL_CALL = "tool_call"
    SUB_AGENT = "sub_agent"
    RAG_SEARCH = "rag_search"
    MEMORY_RECALL = "memory_recall"


class ActionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"


class MessageAction(BaseModel):
    """Action taken by AI during message generation"""
    id: str
    type: ActionType
    name: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    status: ActionStatus = ActionStatus.PENDING
    result: Optional[Any] = None
    error: Optional[str] = None
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    children: List["MessageAction"] = Field(default_factory=list)  # For sub-agents


class TokenUsage(BaseModel):
    """Token usage statistics"""
    prompt: int = 0
    completion: int = 0
    total: int = 0


class MessageCreate(BaseModel):
    """Create message request (user sending message)"""
    content: str
    document_ids: List[str] = Field(default_factory=list)


class MessageInDB(BaseModel):
    """Message as stored in database"""
    id: str = Field(..., alias="_id")
    chat_id: str
    role: MessageRole
    content: str
    thinking: Optional[str] = None
    actions: List[MessageAction] = Field(default_factory=list)
    document_ids: List[str] = Field(default_factory=list)
    model_used: Optional[str] = None
    token_usage: Optional[TokenUsage] = None
    created_at: datetime
    
    class Config:
        populate_by_name = True


class MessageResponse(BaseModel):
    """Message response"""
    id: str
    chat_id: str
    role: MessageRole
    content: str
    thinking: Optional[str]
    actions: List[MessageAction]
    document_ids: List[str]
    model_used: Optional[str]
    token_usage: Optional[TokenUsage]
    created_at: datetime


class StreamChunk(BaseModel):
    """Streaming response chunk"""
    type: str  # "thinking", "action_start", "action_update", "action_complete", "content", "done", "error"
    data: Dict[str, Any]


# For recursive type hint
MessageAction.model_rebuild()
