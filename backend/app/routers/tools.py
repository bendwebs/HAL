"""Tools Router - Tool permissions and user toggles"""

from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)

from app.database import database
from app.auth import get_current_user
from app.models.tool import ToolResponse, ToolListResponse, ToolToggleRequest, ToolPermissionLevel
from app.models.user import UserRole

router = APIRouter(prefix="/tools", tags=["Tools"])


@router.get("", response_model=List[ToolResponse])
async def list_tools(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """List tools available for use in chats.
    
    DISABLED tools are hidden from everyone (including admins) - they cannot be used.
    ADMIN_ONLY tools are only shown to admins.
    Includes both built-in tools and released custom tools.
    """
    user_id = current_user["_id"]
    is_admin = current_user.get("role") == UserRole.ADMIN
    user_overrides = current_user.get("settings", {}).get("tool_overrides", {})
    
    # Get built-in tools
    tools = await database.tools.find().sort("display_name", 1).to_list(100)
    
    result = []
    for tool in tools:
        perm = tool.get("permission_level", ToolPermissionLevel.USER_TOGGLE)
        
        # DISABLED tools are hidden from EVERYONE - they cannot be used at all
        if perm == ToolPermissionLevel.DISABLED:
            logger.debug(f"[TOOLS] Hiding DISABLED tool '{tool['name']}' - not available to anyone")
            continue
        
        # ADMIN_ONLY tools are only shown to admins
        if perm == ToolPermissionLevel.ADMIN_ONLY and not is_admin:
            logger.debug(f"[TOOLS] Hiding ADMIN_ONLY tool '{tool['name']}' from non-admin user")
            continue
        
        # Determine if tool is enabled for this user
        if perm == ToolPermissionLevel.ADMIN_ONLY:
            # Only admins reach here - enabled for admin
            is_enabled = True
            can_toggle = False
        elif perm == ToolPermissionLevel.ALWAYS_ON:
            is_enabled = True
            can_toggle = False
        elif perm == ToolPermissionLevel.USER_TOGGLE:
            # Default on, user can disable
            is_enabled = user_overrides.get(tool["name"], True)
            can_toggle = True
        elif perm == ToolPermissionLevel.OPT_IN:
            # Default off, user can enable
            is_enabled = user_overrides.get(tool["name"], False)
            can_toggle = True
        else:
            is_enabled = tool.get("default_enabled", True)
            can_toggle = False
        
        result.append(ToolResponse(
            id=str(tool["_id"]),
            name=tool["name"],
            display_name=tool["display_name"],
            description=tool.get("description", ""),
            icon=tool.get("icon", "🔧"),
            schema=tool.get("schema", {}),
            permission_level=perm,
            default_enabled=tool.get("default_enabled", True),
            config=tool.get("config", {}),
            usage_count=tool.get("usage_count", 0),
            last_used=tool.get("last_used"),
            is_enabled=is_enabled,
            can_toggle=can_toggle
        ))
    
    # Get released custom tools
    custom_tools = await database.custom_tools.find({
        "status": "released"
    }).sort("display_name", 1).to_list(100)
    
    for tool in custom_tools:
        perm = tool.get("permission_level", ToolPermissionLevel.USER_TOGGLE)
        
        # DISABLED tools are hidden
        if perm == ToolPermissionLevel.DISABLED:
            continue
        
        # ADMIN_ONLY tools are only shown to admins
        if perm == ToolPermissionLevel.ADMIN_ONLY and not is_admin:
            continue
        
        # Determine if tool is enabled for this user
        if perm == ToolPermissionLevel.ADMIN_ONLY:
            is_enabled = True
            can_toggle = False
        elif perm == ToolPermissionLevel.ALWAYS_ON:
            is_enabled = True
            can_toggle = False
        elif perm == ToolPermissionLevel.USER_TOGGLE:
            is_enabled = user_overrides.get(tool["name"], True)
            can_toggle = True
        elif perm == ToolPermissionLevel.OPT_IN:
            is_enabled = user_overrides.get(tool["name"], False)
            can_toggle = True
        else:
            is_enabled = tool.get("default_enabled", True)
            can_toggle = False
        
        # Build schema from parameters
        schema = {
            "type": "object",
            "properties": {},
            "required": []
        }
        for param in tool.get("parameters", []):
            schema["properties"][param["name"]] = {
                "type": param.get("type", "string"),
                "description": param.get("description", "")
            }
            if param.get("required"):
                schema["required"].append(param["name"])
        
        result.append(ToolResponse(
            id=str(tool["_id"]),
            name=tool["name"],
            display_name=tool["display_name"],
            description=tool.get("description", ""),
            icon="🛠️",  # Custom tool icon
            schema=schema,
            permission_level=perm,
            default_enabled=tool.get("default_enabled", True),
            config={},
            usage_count=tool.get("usage_count", 0),
            last_used=tool.get("last_used"),
            is_enabled=is_enabled,
            can_toggle=can_toggle
        ))
    
    logger.info(f"[TOOLS] Returning {len(result)} tools to user (is_admin={is_admin}, custom={len(custom_tools)})")
    return result


@router.put("/{tool_id}/toggle")
async def toggle_tool(
    tool_id: str,
    request: ToolToggleRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Toggle tool enabled state for current user (works for both built-in and custom tools)"""
    # Try built-in tools first
    tool = await database.tools.find_one({"_id": ObjectId(tool_id)})
    
    # If not found, try custom tools
    if not tool:
        tool = await database.custom_tools.find_one({"_id": ObjectId(tool_id)})
    
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    
    perm = tool.get("permission_level", ToolPermissionLevel.USER_TOGGLE)
    
    # Check if tool can be toggled
    if perm not in [ToolPermissionLevel.USER_TOGGLE, ToolPermissionLevel.OPT_IN]:
        raise HTTPException(status_code=403, detail="This tool cannot be toggled")
    
    # Update user's tool override
    await database.users.update_one(
        {"_id": ObjectId(current_user["_id"])},
        {"$set": {f"settings.tool_overrides.{tool['name']}": request.enabled}}
    )
    
    return {"message": "Tool preference updated", "enabled": request.enabled}


@router.post("/refresh")
async def refresh_tools(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Refresh tool definitions from code (adds new tools, updates existing)"""
    from app.services.tool_executor import get_tool_executor
    
    tool_executor = get_tool_executor()
    await tool_executor.initialize_tools_in_db()
    
    return {"message": "Tools refreshed successfully"}
