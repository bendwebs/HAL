"""
MCP Server Model - Model Context Protocol Server Configuration
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class MCPServerStatus(str, Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"
    UNKNOWN = "unknown"


class MCPServerCreate(BaseModel):
    """Request model for creating an MCP server"""
    name: str = Field(..., min_length=1, max_length=100)
    url: str = Field(..., min_length=1)
    description: Optional[str] = None
    

class MCPServerUpdate(BaseModel):
    """Request model for updating an MCP server"""
    name: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    is_enabled: Optional[bool] = None


class MCPServerResponse(BaseModel):
    """Response model for MCP server"""
    id: str
    name: str
    url: str
    description: Optional[str] = None
    is_enabled: bool = True
    status: MCPServerStatus = MCPServerStatus.UNKNOWN
    last_connected: Optional[datetime] = None
    tools_count: int = 0
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class MCPToolInfo(BaseModel):
    """Information about a tool from an MCP server"""
    name: str
    description: str
    parameters: dict = {}


class MCPServerTestResult(BaseModel):
    """Result of testing an MCP server connection"""
    success: bool
    status: MCPServerStatus
    tools_count: int = 0
    tools: List[MCPToolInfo] = []
    error_message: Optional[str] = None
