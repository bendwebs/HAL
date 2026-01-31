"""Admin Router - Administrative functions"""

from fastapi import APIRouter, HTTPException, status, Depends, Query
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)

from app.database import database
from app.auth import get_current_admin, hash_password
from app.models.user import UserRole, UserListResponse, AdminUserUpdate, UserSettings
from app.models.alert import AlertCreate, AlertResponse
from app.models.tool import ToolUpdate, ToolResponse, ToolPermissionLevel
from app.services.resource_monitor import get_resource_stats

router = APIRouter(prefix="/admin", tags=["Admin"])


# ============== User Management ==============

@router.get("/users", response_model=List[UserListResponse])
async def list_all_users(
    admin: Dict[str, Any] = Depends(get_current_admin),
    search: Optional[str] = None,
):
    """List all users"""
    query = {}
    if search:
        query["$or"] = [
            {"username": {"$regex": search, "$options": "i"}},
            {"display_name": {"$regex": search, "$options": "i"}}
        ]
    
    users = await database.users.find(query).sort("created_at", -1).to_list(200)
    
    return [
        UserListResponse(
            id=str(u["_id"]),
            username=u["username"],
            display_name=u.get("display_name", u["username"]),
            role=u.get("role", UserRole.USER),
            storage_used=u.get("storage_used", 0),
            created_at=u["created_at"]
        )
        for u in users
    ]


@router.put("/users/{user_id}")
async def admin_update_user(
    user_id: str,
    update: AdminUserUpdate,
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    """Update any user"""
    user = await database.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    updates = {"updated_at": datetime.utcnow()}
    
    if update.display_name is not None:
        updates["display_name"] = update.display_name
    if update.password is not None:
        updates["password_hash"] = hash_password(update.password)
    if update.role is not None:
        updates["role"] = update.role
    
    await database.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": updates}
    )
    
    return {"message": "User updated"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    """Delete user and all their data"""
    if str(admin["_id"]) == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    user = await database.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete user's data
    await database.chats.delete_many({"user_id": ObjectId(user_id)})
    await database.messages.delete_many({"chat_id": {"$in": await database.chats.distinct("_id", {"user_id": ObjectId(user_id)})}})
    await database.documents.delete_many({"user_id": ObjectId(user_id)})
    await database.document_chunks.delete_many({"user_id": ObjectId(user_id)})
    await database.memories.delete_many({"user_id": ObjectId(user_id)})
    await database.personas.delete_many({"creator_id": ObjectId(user_id)})
    await database.users.delete_one({"_id": ObjectId(user_id)})
    
    return {"message": "User deleted"}


# ============== Tool Management ==============

@router.get("/tools")
async def admin_list_tools(
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    """List all tools with full config (built-in + released custom tools)"""
    # Get built-in tools
    tools = await database.tools.find().sort("name", 1).to_list(100)
    
    result = [
        {
            "id": str(t["_id"]),
            "name": t["name"],
            "display_name": t["display_name"],
            "description": t.get("description", ""),
            "icon": t.get("icon", "🔧"),
            "schema": t.get("schema", {}),
            "permission_level": t.get("permission_level", ToolPermissionLevel.USER_TOGGLE),
            "default_enabled": t.get("default_enabled", True),
            "config": t.get("config", {}),
            "usage_count": t.get("usage_count", 0),
            "last_used": t.get("last_used"),
            "created_at": t.get("created_at"),
            "updated_at": t.get("updated_at"),
            "is_custom": t.get("is_custom", False),
            "mcp_server_id": str(t["mcp_server_id"]) if t.get("mcp_server_id") else None,
        }
        for t in tools
    ]
    
    # Get released custom tools
    custom_tools = await database.custom_tools.find({"status": "released"}).sort("name", 1).to_list(100)
    
    for ct in custom_tools:
        result.append({
            "id": str(ct["_id"]),
            "name": ct["name"],
            "display_name": ct["display_name"],
            "description": ct.get("description", ""),
            "icon": "🛠️",  # Custom tool icon
            "schema": {"parameters": ct.get("parameters", [])},
            "permission_level": ct.get("permission_level", ToolPermissionLevel.USER_TOGGLE),
            "default_enabled": ct.get("default_enabled", True),
            "config": {},
            "usage_count": ct.get("usage_count", 0),
            "last_used": ct.get("last_used"),
            "created_at": ct.get("created_at"),
            "updated_at": ct.get("updated_at"),
            "is_custom": True,
        })
    
    return result


@router.put("/tools/{tool_id}")
async def admin_update_tool(
    tool_id: str,
    update: ToolUpdate,
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    """Update tool configuration (works for both built-in and custom tools)"""
    # First try built-in tools
    tool = await database.tools.find_one({"_id": ObjectId(tool_id)})
    is_custom = False
    
    # If not found, try custom tools
    if not tool:
        tool = await database.custom_tools.find_one({"_id": ObjectId(tool_id)})
        is_custom = True
    
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    
    updates = {"updated_at": datetime.utcnow()}
    update_data = update.model_dump(exclude_unset=True)
    updates.update(update_data)
    
    collection = database.custom_tools if is_custom else database.tools
    
    logger.info(f"[ADMIN TOOL UPDATE] tool_id={tool_id}, tool_name={tool.get('name')}, is_custom={is_custom}, update_data={update_data}")
    
    result = await collection.update_one(
        {"_id": ObjectId(tool_id)},
        {"$set": updates}
    )
    
    logger.info(f"[ADMIN TOOL UPDATE] MongoDB result: matched={result.matched_count}, modified={result.modified_count}")
    
    return {"message": "Tool updated", "updates_applied": update_data}


# ============== Alert Management ==============

@router.post("/alerts", response_model=AlertResponse)
async def create_alert(
    alert_data: AlertCreate,
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    """Create a system alert"""
    now = datetime.utcnow()
    
    alert_doc = {
        "title": alert_data.title,
        "message": alert_data.message,
        "alert_type": alert_data.alert_type,
        "target_user_id": ObjectId(alert_data.target_user_id) if alert_data.target_user_id else None,
        "read_by": [],
        "created_at": now,
        "expires_at": alert_data.expires_at
    }
    
    result = await database.alerts.insert_one(alert_doc)
    
    return AlertResponse(
        id=str(result.inserted_id),
        title=alert_doc["title"],
        message=alert_doc["message"],
        alert_type=alert_doc["alert_type"],
        is_read=False,
        created_at=now,
        expires_at=alert_doc.get("expires_at")
    )


@router.delete("/alerts/{alert_id}")
async def delete_alert(
    alert_id: str,
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    """Delete an alert"""
    result = await database.alerts.delete_one({"_id": ObjectId(alert_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    return {"message": "Alert deleted"}


# ============== Resource Monitoring ==============

@router.get("/resources")
async def get_resources(
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    """Get system resource usage"""
    return await get_resource_stats()


# ============== System Config ==============

@router.get("/config")
async def get_system_config(
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    """Get system configuration"""
    configs = await database.system_config.find().to_list(100)
    
    return {c["key"]: c["value"] for c in configs}


@router.put("/config/{key}")
async def update_system_config(
    key: str,
    value: Any,
    admin: Dict[str, Any] = Depends(get_current_admin),
):
    """Update system configuration"""
    await database.system_config.update_one(
        {"key": key},
        {
            "$set": {
                "value": value,
                "updated_at": datetime.utcnow(),
                "updated_by": ObjectId(admin["_id"])
            }
        },
        upsert=True
    )
    
    return {"message": "Configuration updated"}
