"""Custom Tools Models - For admin-created tools"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class ToolStatus(str, Enum):
    DRAFT = "draft"
    TESTING = "testing"
    RELEASED = "released"
    DISABLED = "disabled"


class ToolParameterType(str, Enum):
    STRING = "string"
    INTEGER = "integer"
    NUMBER = "number"
    BOOLEAN = "boolean"
    ARRAY = "array"
    OBJECT = "object"


class ToolParameter(BaseModel):
    """Definition of a tool parameter"""
    name: str
    type: ToolParameterType = ToolParameterType.STRING
    description: str
    required: bool = True
    default: Optional[Any] = None
    enum: Optional[List[str]] = None  # For string enums


class TestRun(BaseModel):
    """Record of a tool test execution"""
    id: str
    timestamp: datetime
    input_params: Dict[str, Any]
    output: Optional[Any] = None
    error: Optional[str] = None
    duration_ms: int
    success: bool


class CustomToolCreate(BaseModel):
    """Create a new custom tool"""
    name: str = Field(..., pattern=r'^[a-z][a-z0-9_]*$', description="Internal name (lowercase, underscores)")
    display_name: str
    description: str
    parameters: List[ToolParameter] = Field(default_factory=list)
    code: str = Field(default="async def execute(**kwargs):\n    # Your tool code here\n    return {\"result\": \"success\"}")


class CustomToolUpdate(BaseModel):
    """Update an existing custom tool"""
    display_name: Optional[str] = None
    description: Optional[str] = None
    parameters: Optional[List[ToolParameter]] = None
    code: Optional[str] = None
    status: Optional[ToolStatus] = None


class CustomToolResponse(BaseModel):
    """Custom tool response"""
    id: str
    name: str
    display_name: str
    description: str
    parameters: List[ToolParameter]
    code: str
    status: ToolStatus
    created_by: str
    created_at: datetime
    updated_at: datetime
    version: int
    test_results: List[TestRun] = Field(default_factory=list)


class CustomToolListResponse(BaseModel):
    """List of custom tools"""
    tools: List[CustomToolResponse]
    total: int


class ToolTestRequest(BaseModel):
    """Request to test a tool"""
    parameters: Dict[str, Any] = Field(default_factory=dict)


class ToolTestResponse(BaseModel):
    """Response from tool test"""
    success: bool
    output: Optional[Any] = None
    error: Optional[str] = None
    duration_ms: int
    logs: List[str] = Field(default_factory=list)


class AIToolGenerateRequest(BaseModel):
    """Request AI to generate a tool"""
    prompt: str = Field(..., description="Describe what the tool should do")


class AIToolGenerateResponse(BaseModel):
    """AI-generated tool definition"""
    name: str
    display_name: str
    description: str
    parameters: List[ToolParameter]
    code: str
    explanation: str
