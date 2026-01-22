"""Voice Settings Router - Admin endpoints for TTS voice management"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from app.database import database
from app.auth import get_current_user
from app.models.user import UserRole

router = APIRouter(prefix="/admin/voices", tags=["admin", "voices"])

# Default enabled voices (Medium + High quality)
DEFAULT_ENABLED_VOICES = [
    "amy", "arctic", "lessac", "ryan",  # American Medium
    "libritts", "ljspeech",  # American High
    "alba", "jenny_dioco", "northern_english_male",  # British Medium
    "semaine", "southern_english_female", "southern_english_male", "vctk", "cori"  # British Medium
]

# All available voices with full metadata
ALL_VOICES = {
    # American - Medium quality
    "amy": {
        "id": "amy",
        "name": "Amy",
        "accent": "American",
        "quality": "Medium",
        "gender": "Female",
        "description": "Clear, neutral American female voice",
        "available": True
    },
    "arctic": {
        "id": "arctic",
        "name": "Arctic",
        "accent": "American",
        "quality": "Medium",
        "gender": "Female",
        "description": "Crisp American female voice",
        "available": True
    },
    "lessac": {
        "id": "lessac",
        "name": "Lessac",
        "accent": "American",
        "quality": "Medium",
        "gender": "Female",
        "description": "Warm American female voice",
        "available": True
    },
    "ryan": {
        "id": "ryan",
        "name": "Ryan",
        "accent": "American",
        "quality": "Medium",
        "gender": "Male",
        "description": "Professional American male voice",
        "available": True
    },
    # American - High quality
    "libritts": {
        "id": "libritts",
        "name": "LibriTTS",
        "accent": "American",
        "quality": "High",
        "gender": "Mixed",
        "description": "High-quality multi-speaker American voice",
        "available": True
    },
    "ljspeech": {
        "id": "ljspeech",
        "name": "LJ Speech",
        "accent": "American",
        "quality": "High",
        "gender": "Female",
        "description": "High-quality American female audiobook voice",
        "available": True
    },
    # American - Low quality (fast)
    "danny": {
        "id": "danny",
        "name": "Danny",
        "accent": "American",
        "quality": "Low",
        "gender": "Male",
        "description": "Fast American male voice (lower quality)",
        "available": True
    },
    "kathleen": {
        "id": "kathleen",
        "name": "Kathleen",
        "accent": "American",
        "quality": "Low",
        "gender": "Female",
        "description": "Fast American female voice (lower quality)",
        "available": True
    },
    # British - Medium quality
    "alba": {
        "id": "alba",
        "name": "Alba",
        "accent": "British",
        "quality": "Medium",
        "gender": "Female",
        "description": "Scottish-accented female voice",
        "available": True
    },
    "jenny_dioco": {
        "id": "jenny_dioco",
        "name": "Jenny",
        "accent": "British",
        "quality": "Medium",
        "gender": "Female",
        "description": "Clear British female voice",
        "available": True
    },
    "northern_english_male": {
        "id": "northern_english_male",
        "name": "Northern English Male",
        "accent": "British",
        "quality": "Medium",
        "gender": "Male",
        "description": "Northern English male accent",
        "available": True
    },
    "semaine": {
        "id": "semaine",
        "name": "Semaine",
        "accent": "British",
        "quality": "Medium",
        "gender": "Mixed",
        "description": "Expressive British voice set",
        "available": True
    },
    "southern_english_female": {
        "id": "southern_english_female",
        "name": "Southern English Female",
        "accent": "British",
        "quality": "Medium",
        "gender": "Female",
        "description": "Southern English RP female voice",
        "available": True
    },
    "southern_english_male": {
        "id": "southern_english_male",
        "name": "Southern English Male",
        "accent": "British",
        "quality": "Medium",
        "gender": "Male",
        "description": "Southern English RP male voice",
        "available": True
    },
    "vctk": {
        "id": "vctk",
        "name": "VCTK",
        "accent": "British",
        "quality": "Medium",
        "gender": "Mixed",
        "description": "Multi-speaker British voice set",
        "available": True
    },
    "cori": {
        "id": "cori",
        "name": "Cori",
        "accent": "British",
        "quality": "Medium",
        "gender": "Female",
        "description": "Welsh-accented female voice",
        "available": True
    },
    # Coming Soon - Placeholder voices
    "elevenlabs_rachel": {
        "id": "elevenlabs_rachel",
        "name": "Rachel (ElevenLabs)",
        "accent": "American",
        "quality": "Premium",
        "gender": "Female",
        "description": "Premium cloud-based voice",
        "available": False
    },
    "elevenlabs_josh": {
        "id": "elevenlabs_josh",
        "name": "Josh (ElevenLabs)",
        "accent": "American",
        "quality": "Premium",
        "gender": "Male",
        "description": "Premium cloud-based voice",
        "available": False
    },
    "openai_alloy": {
        "id": "openai_alloy",
        "name": "Alloy (OpenAI)",
        "accent": "American",
        "quality": "Premium",
        "gender": "Neutral",
        "description": "OpenAI TTS voice",
        "available": False
    },
    "openai_nova": {
        "id": "openai_nova",
        "name": "Nova (OpenAI)",
        "accent": "American",
        "quality": "Premium",
        "gender": "Female",
        "description": "OpenAI TTS voice",
        "available": False
    },
}


class VoiceSettingsUpdate(BaseModel):
    enabled_voice_ids: List[str]


def require_admin(current_user: dict = Depends(get_current_user)):
    """Dependency to require admin role"""
    if current_user.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("")
async def list_all_voices(current_user: dict = Depends(require_admin)):
    """List all available voices with their enabled status"""
    # Get current settings from database
    settings = await database.system_config.find_one({"key": "voice_settings"})
    enabled_ids = settings.get("enabled_voice_ids", DEFAULT_ENABLED_VOICES) if settings else DEFAULT_ENABLED_VOICES
    
    voices = []
    for voice_id, voice_data in ALL_VOICES.items():
        voices.append({
            **voice_data,
            "enabled": voice_id in enabled_ids
        })
    
    # Sort by: available first, then by quality (High > Medium > Low > Premium), then by accent, then by name
    quality_order = {"High": 0, "Medium": 1, "Low": 2, "Premium": 3}
    voices.sort(key=lambda v: (
        not v["available"],  # Available first
        quality_order.get(v["quality"], 99),
        v["accent"],
        v["name"]
    ))
    
    return {
        "voices": voices,
        "enabled_count": len([v for v in voices if v["enabled"]]),
        "total_count": len(voices),
        "available_count": len([v for v in voices if v["available"]])
    }


@router.get("/enabled")
async def list_enabled_voices(current_user: dict = Depends(get_current_user)):
    """List only enabled voices (for /converse page) - available to all users"""
    settings = await database.system_config.find_one({"key": "voice_settings"})
    enabled_ids = settings.get("enabled_voice_ids", DEFAULT_ENABLED_VOICES) if settings else DEFAULT_ENABLED_VOICES
    
    voices = []
    for voice_id in enabled_ids:
        if voice_id in ALL_VOICES and ALL_VOICES[voice_id]["available"]:
            voices.append(ALL_VOICES[voice_id])
    
    # Sort by accent then name
    voices.sort(key=lambda v: (v["accent"], v["name"]))
    
    return {"voices": voices}


@router.put("")
async def update_voice_settings(
    update: VoiceSettingsUpdate,
    current_user: dict = Depends(require_admin)
):
    """Update which voices are enabled for the /converse page"""
    # Validate that all voice IDs exist and are available
    invalid_ids = []
    unavailable_ids = []
    for voice_id in update.enabled_voice_ids:
        if voice_id not in ALL_VOICES:
            invalid_ids.append(voice_id)
        elif not ALL_VOICES[voice_id]["available"]:
            unavailable_ids.append(voice_id)
    
    if invalid_ids:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid voice IDs: {', '.join(invalid_ids)}"
        )
    
    if unavailable_ids:
        raise HTTPException(
            status_code=400,
            detail=f"These voices are not yet available: {', '.join(unavailable_ids)}"
        )
    
    # Update or create settings
    await database.system_config.update_one(
        {"key": "voice_settings"},
        {
            "$set": {
                "key": "voice_settings",
                "enabled_voice_ids": update.enabled_voice_ids,
                "updated_at": datetime.utcnow(),
                "updated_by": current_user["_id"]
            }
        },
        upsert=True
    )
    
    return {
        "success": True,
        "enabled_count": len(update.enabled_voice_ids),
        "enabled_voice_ids": update.enabled_voice_ids
    }


@router.post("/reset")
async def reset_voice_settings(current_user: dict = Depends(require_admin)):
    """Reset voice settings to defaults"""
    await database.system_config.update_one(
        {"key": "voice_settings"},
        {
            "$set": {
                "key": "voice_settings",
                "enabled_voice_ids": DEFAULT_ENABLED_VOICES,
                "updated_at": datetime.utcnow(),
                "updated_by": current_user["_id"]
            }
        },
        upsert=True
    )
    
    return {
        "success": True,
        "message": "Voice settings reset to defaults",
        "enabled_count": len(DEFAULT_ENABLED_VOICES)
    }
