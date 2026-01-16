"""Personas Router"""

from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, List

from app.database import database
from app.auth import get_current_user
from app.models.persona import PersonaCreate, PersonaUpdate, PersonaResponse, PersonaListResponse
from app.models.user import UserRole

router = APIRouter(prefix="/personas", tags=["Personas"])


@router.get("", response_model=List[PersonaListResponse])
async def list_personas(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """List available personas (own + public + system)"""
    user_id = current_user["_id"]
    
    query = {
        "$or": [
            {"creator_id": ObjectId(user_id)},
            {"is_public": True},
            {"is_system": True}
        ]
    }
    
    personas = await database.personas.find(query).sort("name", 1).to_list(100)
    
    return [
        PersonaListResponse(
            id=str(p["_id"]),
            name=p["name"],
            description=p.get("description", ""),
            avatar_emoji=p.get("avatar_emoji", "🤖"),
            is_public=p.get("is_public", False),
            is_system=p.get("is_system", False),
            is_owner=str(p.get("creator_id")) == user_id if p.get("creator_id") else False
        )
        for p in personas
    ]


@router.post("", response_model=PersonaResponse, status_code=status.HTTP_201_CREATED)
async def create_persona(
    persona_data: PersonaCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Create a new persona"""
    now = datetime.utcnow()
    
    persona_doc = {
        "creator_id": ObjectId(current_user["_id"]),
        "name": persona_data.name,
        "description": persona_data.description,
        "system_prompt": persona_data.system_prompt,
        "avatar_emoji": persona_data.avatar_emoji,
        "temperature": persona_data.temperature,
        "model_override": persona_data.model_override,
        "tools_enabled": persona_data.tools_enabled,
        "is_public": persona_data.is_public,
        "is_system": False,
        "created_at": now,
        "updated_at": now
    }
    
    result = await database.personas.insert_one(persona_doc)
    
    return PersonaResponse(
        id=str(result.inserted_id),
        name=persona_doc["name"],
        description=persona_doc["description"],
        system_prompt=persona_doc["system_prompt"],
        avatar_emoji=persona_doc["avatar_emoji"],
        temperature=persona_doc["temperature"],
        model_override=persona_doc["model_override"],
        tools_enabled=persona_doc["tools_enabled"],
        creator_id=current_user["_id"],
        is_public=persona_doc["is_public"],
        is_system=False,
        created_at=now,
        is_owner=True
    )


@router.get("/{persona_id}", response_model=PersonaResponse)
async def get_persona(
    persona_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Get persona details"""
    persona = await database.personas.find_one({"_id": ObjectId(persona_id)})
    
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    
    user_id = current_user["_id"]
    is_owner = str(persona.get("creator_id")) == user_id if persona.get("creator_id") else False
    
    # Check access
    if not is_owner and not persona.get("is_public") and not persona.get("is_system"):
        raise HTTPException(status_code=403, detail="Access denied")
    
    return PersonaResponse(
        id=str(persona["_id"]),
        name=persona["name"],
        description=persona.get("description", ""),
        system_prompt=persona["system_prompt"],
        avatar_emoji=persona.get("avatar_emoji", "🤖"),
        temperature=persona.get("temperature", 0.7),
        model_override=persona.get("model_override"),
        tools_enabled=persona.get("tools_enabled", []),
        creator_id=str(persona["creator_id"]) if persona.get("creator_id") else None,
        is_public=persona.get("is_public", False),
        is_system=persona.get("is_system", False),
        created_at=persona["created_at"],
        is_owner=is_owner
    )


@router.put("/{persona_id}", response_model=PersonaResponse)
async def update_persona(
    persona_id: str,
    update: PersonaUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Update persona (owner only)"""
    persona = await database.personas.find_one({"_id": ObjectId(persona_id)})
    
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    
    user_id = current_user["_id"]
    is_owner = str(persona.get("creator_id")) == user_id if persona.get("creator_id") else False
    is_admin = current_user.get("role") == UserRole.ADMIN
    
    if not is_owner and not is_admin:
        raise HTTPException(status_code=403, detail="Only owner can update persona")
    
    updates = {"updated_at": datetime.utcnow()}
    update_data = update.model_dump(exclude_unset=True)
    updates.update(update_data)
    
    await database.personas.update_one(
        {"_id": ObjectId(persona_id)},
        {"$set": updates}
    )
    
    return await get_persona(persona_id, current_user)


@router.delete("/{persona_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_persona(
    persona_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Delete persona (owner only)"""
    persona = await database.personas.find_one({"_id": ObjectId(persona_id)})
    
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    
    user_id = current_user["_id"]
    is_owner = str(persona.get("creator_id")) == user_id if persona.get("creator_id") else False
    is_admin = current_user.get("role") == UserRole.ADMIN
    
    if not is_owner and not is_admin:
        raise HTTPException(status_code=403, detail="Only owner can delete persona")
    
    if persona.get("is_system"):
        raise HTTPException(status_code=403, detail="Cannot delete system persona")
    
    await database.personas.delete_one({"_id": ObjectId(persona_id)})
