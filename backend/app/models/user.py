"""User Models"""

from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"


class UserSettings(BaseModel):
    """User preference settings"""
    show_thinking: bool = True
    show_actions: bool = True
    show_subagents: bool = True
    theme: str = "dark"
    tool_overrides: Dict[str, bool] = Field(default_factory=dict)


class UserBase(BaseModel):
    """Base user fields"""
    username: str = Field(..., min_length=3, max_length=50)
    display_name: Optional[str] = None


class UserCreate(UserBase):
    """Create user request"""
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    """Login request"""
    username: str
    password: str


class UserUpdate(BaseModel):
    """Update user request"""
    display_name: Optional[str] = None
    password: Optional[str] = Field(None, min_length=6)
    settings: Optional[UserSettings] = None


class AdminUserUpdate(UserUpdate):
    """Admin update user request - includes role"""
    role: Optional[UserRole] = None


class UserInDB(UserBase):
    """User as stored in database"""
    id: str = Field(..., alias="_id")
    password_hash: str
    role: UserRole = UserRole.USER
    settings: UserSettings = Field(default_factory=UserSettings)
    storage_used: int = 0
    storage_quota: int = 1073741824  # 1GB default
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        populate_by_name = True


class UserResponse(BaseModel):
    """User response (excludes password)"""
    id: str
    username: str
    display_name: str
    role: UserRole
    settings: UserSettings
    storage_used: int
    storage_quota: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """User list item response"""
    id: str
    username: str
    display_name: str
    role: UserRole
    storage_used: int
    created_at: datetime


class TokenResponse(BaseModel):
    """Login/register response with token"""
    token: str
    token_type: str = "bearer"
    user: UserResponse
