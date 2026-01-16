"""Authentication Router"""

from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any

from app.database import database
from app.auth import hash_password, verify_password, create_access_token, get_current_user
from app.models.user import (
    UserCreate, UserLogin, UserUpdate, UserResponse, 
    TokenResponse, UserRole, UserSettings
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    """Register a new user"""
    # Check if username exists
    existing = await database.users.find_one({"username": user_data.username})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    # Create user document
    now = datetime.utcnow()
    user_doc = {
        "username": user_data.username,
        "password_hash": hash_password(user_data.password),
        "display_name": user_data.display_name or user_data.username,
        "role": UserRole.USER,
        "settings": UserSettings().model_dump(),
        "storage_used": 0,
        "storage_quota": 1073741824,  # 1GB
        "created_at": now,
        "updated_at": now,
    }
    
    result = await database.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    # Create token
    token = create_access_token(user_id, UserRole.USER)
    
    return TokenResponse(
        token=token,
        user=UserResponse(
            id=user_id,
            username=user_doc["username"],
            display_name=user_doc["display_name"],
            role=user_doc["role"],
            settings=UserSettings(**user_doc["settings"]),
            storage_used=user_doc["storage_used"],
            storage_quota=user_doc["storage_quota"],
            created_at=user_doc["created_at"],
        )
    )


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    """Login and get access token"""
    # Find user
    user = await database.users.find_one({"username": credentials.username})
    
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
    
    user_id = str(user["_id"])
    token = create_access_token(user_id, user["role"])
    
    return TokenResponse(
        token=token,
        user=UserResponse(
            id=user_id,
            username=user["username"],
            display_name=user["display_name"],
            role=user["role"],
            settings=UserSettings(**user.get("settings", {})),
            storage_used=user.get("storage_used", 0),
            storage_quota=user.get("storage_quota", 1073741824),
            created_at=user["created_at"],
        )
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Get current user info"""
    return UserResponse(
        id=current_user["_id"],
        username=current_user["username"],
        display_name=current_user["display_name"],
        role=current_user["role"],
        settings=UserSettings(**current_user.get("settings", {})),
        storage_used=current_user.get("storage_used", 0),
        storage_quota=current_user.get("storage_quota", 1073741824),
        created_at=current_user["created_at"],
    )


@router.put("/me", response_model=UserResponse)
async def update_me(
    update: UserUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Update current user"""
    updates = {"updated_at": datetime.utcnow()}
    
    if update.display_name is not None:
        updates["display_name"] = update.display_name
    
    if update.password is not None:
        updates["password_hash"] = hash_password(update.password)
    
    if update.settings is not None:
        updates["settings"] = update.settings.model_dump()
    
    await database.users.update_one(
        {"_id": ObjectId(current_user["_id"])},
        {"$set": updates}
    )
    
    # Return updated user
    updated_user = await database.users.find_one({"_id": ObjectId(current_user["_id"])})
    
    return UserResponse(
        id=str(updated_user["_id"]),
        username=updated_user["username"],
        display_name=updated_user["display_name"],
        role=updated_user["role"],
        settings=UserSettings(**updated_user.get("settings", {})),
        storage_used=updated_user.get("storage_used", 0),
        storage_quota=updated_user.get("storage_quota", 1073741824),
        created_at=updated_user["created_at"],
    )
