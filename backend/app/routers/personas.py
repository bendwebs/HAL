"""Personas Router"""

from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, List
from pydantic import BaseModel
import ollama

from app.database import database
from app.auth import get_current_user
from app.models.persona import PersonaCreate, PersonaUpdate, PersonaResponse, PersonaListResponse
from app.models.user import UserRole
from app.config import settings

router = APIRouter(prefix="/personas", tags=["Personas"])


class AIAssistRequest(BaseModel):
    """Request for AI-assisted persona creation"""
    messages: List[Dict[str, str]]  # Conversation history
    persona_name: str = "New Persona"


class AIAssistResponse(BaseModel):
    """Response from AI assistant"""
    response: str
    generated_prompt: str | None = None


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
    
    # Sort: default first, then by usage count
    personas = await database.personas.find(query).sort([("is_default", -1), ("usage_count", -1)]).to_list(100)
    
    return [
        PersonaListResponse(
            id=str(p["_id"]),
            name=p["name"],
            description=p.get("description", ""),
            avatar_emoji=p.get("avatar_emoji", "🤖"),
            temperature=p.get("temperature", 0.7),
            model_override=p.get("model_override"),
            default_voice_id=p.get("default_voice_id"),
            is_public=p.get("is_public", False),
            is_system=p.get("is_system", False),
            is_default=p.get("is_default", False),
            is_owner=str(p.get("creator_id")) == user_id if p.get("creator_id") else False,
            usage_count=p.get("usage_count", 0),
            last_used=p.get("last_used")
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
        "default_voice_id": persona_data.default_voice_id,
        "tools_enabled": persona_data.tools_enabled,
        "is_public": persona_data.is_public,
        "is_system": False,
        "is_default": False,
        "usage_count": 0,
        "last_used": None,
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
        default_voice_id=persona_doc["default_voice_id"],
        tools_enabled=persona_doc["tools_enabled"],
        creator_id=current_user["_id"],
        is_public=persona_doc["is_public"],
        is_system=False,
        is_default=False,
        created_at=now,
        usage_count=0,
        last_used=None,
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
        default_voice_id=persona.get("default_voice_id"),
        tools_enabled=persona.get("tools_enabled", []),
        creator_id=str(persona["creator_id"]) if persona.get("creator_id") else None,
        is_public=persona.get("is_public", False),
        is_system=persona.get("is_system", False),
        is_default=persona.get("is_default", False),
        created_at=persona["created_at"],
        usage_count=persona.get("usage_count", 0),
        last_used=persona.get("last_used"),
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


@router.post("/ai-assist", response_model=AIAssistResponse)
async def ai_assist_persona(
    request: AIAssistRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """AI-assisted persona prompt generation using Ollama"""
    
    # System prompt for the AI assistant
    system_prompt = """You are an expert AI persona designer helping users create effective system prompts for AI assistants.

Your goal is to have a conversation with the user to understand:
1. The persona's main purpose/role
2. The personality traits and communication style
3. Any specific knowledge domains or expertise
4. Constraints or things the persona should avoid
5. Example interactions or behaviors

Ask questions one at a time to gather this information. Be friendly and helpful.

After gathering enough information (usually 3-5 exchanges), generate a comprehensive system prompt.

When you have enough information to generate a good system prompt, include it in your response in this exact format:
---GENERATED_PROMPT---
[The complete system prompt here]
---END_PROMPT---

The generated prompt should be:
- Clear and specific about the persona's role
- Include personality traits and communication style
- Define the scope of knowledge and expertise
- Set appropriate boundaries
- Be 150-400 words typically

Continue the conversation naturally until you have enough details to create a good prompt."""

    try:
        # Build messages for Ollama
        ollama_messages = [{"role": "system", "content": system_prompt}]
        
        for msg in request.messages:
            ollama_messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", "")
            })
        
        # Call Ollama
        client = ollama.Client(host=settings.ollama_base_url)
        response = client.chat(
            model=settings.default_chat_model,
            messages=ollama_messages,
        )
        
        ai_response = response['message']['content']
        
        # Check if there's a generated prompt in the response
        generated_prompt = None
        if "---GENERATED_PROMPT---" in ai_response and "---END_PROMPT---" in ai_response:
            start = ai_response.find("---GENERATED_PROMPT---") + len("---GENERATED_PROMPT---")
            end = ai_response.find("---END_PROMPT---")
            generated_prompt = ai_response[start:end].strip()
            # Remove the prompt markers from the response shown to user
            ai_response = ai_response[:ai_response.find("---GENERATED_PROMPT---")].strip()
            if not ai_response:
                ai_response = "I've generated a system prompt based on our conversation. Click 'Apply to System Prompt' to use it!"
        
        return AIAssistResponse(
            response=ai_response,
            generated_prompt=generated_prompt
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to get AI response: {str(e)}"
        )


class TestChatRequest(BaseModel):
    """Request for testing a persona"""
    system_prompt: str
    message: str
    temperature: float = 0.7
    model_override: str | None = None


class TestChatResponse(BaseModel):
    """Response from test chat"""
    response: str
    model_used: str


@router.post("/test-chat", response_model=TestChatResponse)
async def test_persona_chat(
    request: TestChatRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Test a persona with a sample message - for previewing before saving"""
    
    try:
        model = request.model_override or settings.default_chat_model
        
        client = ollama.Client(host=settings.ollama_base_url)
        response = client.chat(
            model=model,
            messages=[
                {"role": "system", "content": request.system_prompt},
                {"role": "user", "content": request.message}
            ],
            options={"temperature": request.temperature}
        )
        
        return TestChatResponse(
            response=response['message']['content'],
            model_used=model
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get response: {str(e)}"
        )


@router.post("/{persona_id}/use")
async def record_persona_usage(
    persona_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Record that a persona was used (call when starting a chat with this persona)"""
    
    try:
        result = await database.personas.update_one(
            {"_id": ObjectId(persona_id)},
            {
                "$inc": {"usage_count": 1},
                "$set": {"last_used": datetime.utcnow()}
            }
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Persona not found")
        
        return {"success": True}
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to record usage: {str(e)}"
        )
