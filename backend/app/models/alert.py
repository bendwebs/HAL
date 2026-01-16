"""Alert Models"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class AlertType(str, Enum):
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"


class AlertBase(BaseModel):
    """Base alert fields"""
    title: str = Field(..., min_length=1, max_length=200)
    message: str
    alert_type: AlertType = AlertType.INFO


class AlertCreate(AlertBase):
    """Create alert request (admin only)"""
    target_user_id: Optional[str] = None  # None = broadcast to all
    expires_at: Optional[datetime] = None


class AlertInDB(AlertBase):
    """Alert as stored in database"""
    id: str = Field(..., alias="_id")
    target_user_id: Optional[str] = None
    read_by: List[str] = Field(default_factory=list)
    created_at: datetime
    expires_at: Optional[datetime] = None
    
    class Config:
        populate_by_name = True


class AlertResponse(BaseModel):
    """Alert response"""
    id: str
    title: str
    message: str
    alert_type: AlertType
    is_read: bool
    created_at: datetime
    expires_at: Optional[datetime]


class AlertListResponse(BaseModel):
    """Alert list response"""
    alerts: List[AlertResponse]
    unread_count: int
