"""Tool Models"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum


class ToolPermissionLevel(str, Enum):
    DISABLED = "disabled"
    ADMIN_ONLY = "admin_only"
    ALWAYS_ON = "always_on"
    USER_TOGGLE = "user_toggle"  # Default on, user can disable
    OPT_IN = "opt_in"  # Default off, user can enable


class ToolSchema(BaseModel):
    """JSON Schema for tool parameters"""
    type: str = "object"
    properties: Dict[str, Any] = Field(default_factory=dict)
    required: List[str] = Field(default_factory=list)


class ToolBase(BaseModel):
    """Base tool fields"""
    name: str = Field(..., min_length=1, max_length=50)
    display_name: str
    description: str
    icon: str = "🔧"
    schema_def: ToolSchema = Field(default_factory=ToolSchema, alias="schema")


class ToolCreate(ToolBase):
    """Create tool request (admin only)"""
    permission_level: ToolPermissionLevel = ToolPermissionLevel.USER_TOGGLE
    default_enabled: bool = True
    config: Dict[str, Any] = Field(default_factory=dict)


class ToolUpdate(BaseModel):
    """Update tool request"""
    display_name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    permission_level: Optional[ToolPermissionLevel] = None
    default_enabled: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None


class ToolInDB(ToolBase):
    """Tool as stored in database"""
    id: str = Field(..., alias="_id")
    permission_level: ToolPermissionLevel = ToolPermissionLevel.USER_TOGGLE
    default_enabled: bool = True
    config: Dict[str, Any] = Field(default_factory=dict)
    usage_count: int = 0
    last_used: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        populate_by_name = True


class ToolResponse(BaseModel):
    """Tool response"""
    id: str
    name: str
    display_name: str
    description: str
    icon: str
    schema_def: ToolSchema = Field(alias="schema")
    permission_level: ToolPermissionLevel
    default_enabled: bool
    config: Dict[str, Any]
    usage_count: int
    last_used: Optional[datetime]
    
    # Computed for current user
    is_enabled: bool = True
    can_toggle: bool = False
    
    class Config:
        populate_by_name = True


class ToolListResponse(BaseModel):
    """Tool list for users"""
    tools: List[ToolResponse]


class ToolToggleRequest(BaseModel):
    """Toggle tool enabled state"""
    enabled: bool
