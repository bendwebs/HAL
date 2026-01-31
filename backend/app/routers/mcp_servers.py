"""
MCP Server Router - Admin endpoints for managing MCP servers
"""

from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import List
import httpx
import logging

from app.database import database
from app.auth import get_current_user
from app.models.user import UserRole
from app.models.mcp_server import (
    MCPServerCreate, MCPServerUpdate, MCPServerResponse, 
    MCPServerStatus, MCPServerTestResult, MCPToolInfo
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/mcp-servers", tags=["MCP Servers"])


async def require_admin(current_user: dict = Depends(get_current_user)):
    """Require admin role"""
    if current_user.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("", response_model=List[MCPServerResponse])
async def list_mcp_servers(admin: dict = Depends(require_admin)):
    """List all MCP servers"""
    servers = await database.mcp_servers.find().sort("created_at", -1).to_list(100)
    
    return [
        MCPServerResponse(
            id=str(s["_id"]),
            name=s["name"],
            url=s["url"],
            description=s.get("description"),
            is_enabled=s.get("is_enabled", True),
            status=MCPServerStatus(s.get("status", "unknown")),
            last_connected=s.get("last_connected"),
            tools_count=s.get("tools_count", 0),
            error_message=s.get("error_message"),
            created_at=s["created_at"],
            updated_at=s.get("updated_at", s["created_at"]),
        )
        for s in servers
    ]


@router.post("", response_model=MCPServerResponse)
async def create_mcp_server(
    data: MCPServerCreate,
    admin: dict = Depends(require_admin)
):
    """Add a new MCP server"""
    # Check for duplicate name
    existing = await database.mcp_servers.find_one({"name": data.name})
    if existing:
        raise HTTPException(status_code=400, detail="Server with this name already exists")
    
    now = datetime.utcnow()
    doc = {
        "name": data.name,
        "url": data.url.rstrip("/"),
        "description": data.description,
        "is_enabled": True,
        "status": MCPServerStatus.UNKNOWN.value,
        "last_connected": None,
        "tools_count": 0,
        "error_message": None,
        "created_at": now,
        "updated_at": now,
    }
    
    result = await database.mcp_servers.insert_one(doc)
    doc["_id"] = result.inserted_id
    
    logger.info(f"Created MCP server: {data.name} at {data.url}")
    
    return MCPServerResponse(
        id=str(doc["_id"]),
        name=doc["name"],
        url=doc["url"],
        description=doc.get("description"),
        is_enabled=doc["is_enabled"],
        status=MCPServerStatus(doc["status"]),
        last_connected=doc["last_connected"],
        tools_count=doc["tools_count"],
        error_message=doc["error_message"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


@router.get("/{server_id}", response_model=MCPServerResponse)
async def get_mcp_server(
    server_id: str,
    admin: dict = Depends(require_admin)
):
    """Get a specific MCP server"""
    try:
        server = await database.mcp_servers.find_one({"_id": ObjectId(server_id)})
    except:
        raise HTTPException(status_code=404, detail="Server not found")
    
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    return MCPServerResponse(
        id=str(server["_id"]),
        name=server["name"],
        url=server["url"],
        description=server.get("description"),
        is_enabled=server.get("is_enabled", True),
        status=MCPServerStatus(server.get("status", "unknown")),
        last_connected=server.get("last_connected"),
        tools_count=server.get("tools_count", 0),
        error_message=server.get("error_message"),
        created_at=server["created_at"],
        updated_at=server.get("updated_at", server["created_at"]),
    )


@router.put("/{server_id}", response_model=MCPServerResponse)
async def update_mcp_server(
    server_id: str,
    data: MCPServerUpdate,
    admin: dict = Depends(require_admin)
):
    """Update an MCP server"""
    try:
        server = await database.mcp_servers.find_one({"_id": ObjectId(server_id)})
    except:
        raise HTTPException(status_code=404, detail="Server not found")
    
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    update_data = {"updated_at": datetime.utcnow()}
    
    if data.name is not None:
        update_data["name"] = data.name
    if data.url is not None:
        update_data["url"] = data.url.rstrip("/")
    if data.description is not None:
        update_data["description"] = data.description
    if data.is_enabled is not None:
        update_data["is_enabled"] = data.is_enabled
    
    await database.mcp_servers.update_one(
        {"_id": ObjectId(server_id)},
        {"$set": update_data}
    )
    
    # Get updated server
    server = await database.mcp_servers.find_one({"_id": ObjectId(server_id)})
    
    return MCPServerResponse(
        id=str(server["_id"]),
        name=server["name"],
        url=server["url"],
        description=server.get("description"),
        is_enabled=server.get("is_enabled", True),
        status=MCPServerStatus(server.get("status", "unknown")),
        last_connected=server.get("last_connected"),
        tools_count=server.get("tools_count", 0),
        error_message=server.get("error_message"),
        created_at=server["created_at"],
        updated_at=server.get("updated_at", server["created_at"]),
    )


@router.delete("/{server_id}")
async def delete_mcp_server(
    server_id: str,
    admin: dict = Depends(require_admin)
):
    """Delete an MCP server"""
    try:
        result = await database.mcp_servers.delete_one({"_id": ObjectId(server_id)})
    except:
        raise HTTPException(status_code=404, detail="Server not found")
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Server not found")
    
    # Also delete any tools that came from this server
    await database.tools.delete_many({"mcp_server_id": ObjectId(server_id)})
    
    logger.info(f"Deleted MCP server: {server_id}")
    
    return {"message": "Server deleted"}


@router.post("/{server_id}/test", response_model=MCPServerTestResult)
async def test_mcp_connection(
    server_id: str,
    admin: dict = Depends(require_admin)
):
    """Test connection to an MCP server and discover its tools"""
    try:
        server = await database.mcp_servers.find_one({"_id": ObjectId(server_id)})
    except:
        raise HTTPException(status_code=404, detail="Server not found")
    
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    url = server["url"]
    tools = []
    error_message = None
    status = MCPServerStatus.UNKNOWN
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Try to get tools list from MCP server
            # MCP servers typically expose tools at /tools or via JSON-RPC
            
            # Try standard MCP endpoint first
            try:
                response = await client.post(
                    f"{url}",
                    json={
                        "jsonrpc": "2.0",
                        "method": "tools/list",
                        "id": 1
                    }
                )
                if response.status_code == 200:
                    data = response.json()
                    if "result" in data and "tools" in data["result"]:
                        for tool in data["result"]["tools"]:
                            tools.append(MCPToolInfo(
                                name=tool.get("name", "unknown"),
                                description=tool.get("description", ""),
                                parameters=tool.get("inputSchema", {})
                            ))
                        status = MCPServerStatus.CONNECTED
            except Exception as e:
                logger.debug(f"JSON-RPC method failed: {e}")
            
            # If JSON-RPC didn't work, try REST endpoint
            if status != MCPServerStatus.CONNECTED:
                try:
                    response = await client.get(f"{url}/tools")
                    if response.status_code == 200:
                        data = response.json()
                        tool_list = data if isinstance(data, list) else data.get("tools", [])
                        for tool in tool_list:
                            tools.append(MCPToolInfo(
                                name=tool.get("name", "unknown"),
                                description=tool.get("description", ""),
                                parameters=tool.get("parameters", tool.get("inputSchema", {}))
                            ))
                        status = MCPServerStatus.CONNECTED
                except Exception as e:
                    logger.debug(f"REST endpoint failed: {e}")
            
            # Try a simple health check
            if status != MCPServerStatus.CONNECTED:
                try:
                    response = await client.get(f"{url}/health")
                    if response.status_code == 200:
                        status = MCPServerStatus.CONNECTED
                except:
                    pass
            
            # If still not connected, try just hitting the base URL
            if status != MCPServerStatus.CONNECTED:
                try:
                    response = await client.get(url)
                    if response.status_code in [200, 404]:  # Server is responding
                        status = MCPServerStatus.CONNECTED
                except:
                    pass
                    
    except httpx.TimeoutException:
        status = MCPServerStatus.ERROR
        error_message = "Connection timed out"
    except httpx.ConnectError:
        status = MCPServerStatus.ERROR
        error_message = "Could not connect to server"
    except Exception as e:
        status = MCPServerStatus.ERROR
        error_message = str(e)
        logger.error(f"MCP connection test failed: {e}")
    
    # Update server status in database
    update_data = {
        "status": status.value,
        "updated_at": datetime.utcnow(),
        "error_message": error_message,
    }
    
    if status == MCPServerStatus.CONNECTED:
        update_data["last_connected"] = datetime.utcnow()
        update_data["tools_count"] = len(tools)
        
        # Register discovered tools in the database
        if tools:
            await _register_mcp_tools(server_id, server["name"], tools)
    
    await database.mcp_servers.update_one(
        {"_id": ObjectId(server_id)},
        {"$set": update_data}
    )
    
    return MCPServerTestResult(
        success=status == MCPServerStatus.CONNECTED,
        status=status,
        tools_count=len(tools),
        tools=tools,
        error_message=error_message,
    )


async def _register_mcp_tools(server_id: str, server_name: str, tools: List[MCPToolInfo]):
    """Register tools from an MCP server in the database"""
    now = datetime.utcnow()
    
    for tool in tools:
        tool_name = f"mcp_{server_name.lower().replace(' ', '_')}_{tool.name}"
        
        # Check if tool already exists
        existing = await database.tools.find_one({"name": tool_name})
        
        if existing:
            # Update existing tool
            await database.tools.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "description": tool.description,
                    "schema": tool.parameters,
                    "updated_at": now,
                }}
            )
        else:
            # Create new tool
            await database.tools.insert_one({
                "name": tool_name,
                "display_name": f"{tool.name} ({server_name})",
                "description": tool.description,
                "icon": "🔌",
                "schema": tool.parameters,
                "permission_level": "opt_in",  # MCP tools start as opt-in
                "default_enabled": False,
                "config": {},
                "usage_count": 0,
                "last_used": None,
                "is_custom": True,
                "mcp_server_id": ObjectId(server_id),
                "created_at": now,
                "updated_at": now,
            })
    
    logger.info(f"Registered {len(tools)} tools from MCP server: {server_name}")
