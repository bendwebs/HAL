"""Persona Models"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class PersonaBase(BaseModel):
    """Base persona fields"""
    name: str = Field(..., min_length=1, max_length=100)
    description: str = ""
    system_prompt: str
    avatar_emoji: str = "🤖"
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    model_override: Optional[str] = None
    tools_enabled: List[str] = Field(default_factory=list)
    default_voice_id: Optional[str] = None  # TTS voice for this persona


class PersonaCreate(PersonaBase):
    """Create persona request"""
    is_public: bool = False


class PersonaUpdate(BaseModel):
    """Update persona request"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    avatar_emoji: Optional[str] = None
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    model_override: Optional[str] = None
    tools_enabled: Optional[List[str]] = None
    is_public: Optional[bool] = None
    default_voice_id: Optional[str] = None


class PersonaInDB(PersonaBase):
    """Persona as stored in database"""
    id: str = Field(..., alias="_id")
    creator_id: Optional[str] = None  # None for system personas
    is_public: bool = False
    is_system: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        populate_by_name = True


class PersonaResponse(BaseModel):
    """Persona response"""
    id: str
    name: str
    description: str
    system_prompt: str
    avatar_emoji: str
    temperature: float
    model_override: Optional[str]
    tools_enabled: List[str]
    default_voice_id: Optional[str]
    creator_id: Optional[str]
    is_public: bool
    is_system: bool
    created_at: datetime
    usage_count: int = 0
    last_used: Optional[datetime] = None
    
    # Computed
    is_owner: bool = False


class PersonaListResponse(BaseModel):
    """Persona list item"""
    id: str
    name: str
    description: str
    avatar_emoji: str
    temperature: float = 0.7
    model_override: Optional[str] = None
    default_voice_id: Optional[str] = None
    is_public: bool
    is_system: bool
    is_owner: bool
    usage_count: int = 0
    last_used: Optional[datetime] = None
