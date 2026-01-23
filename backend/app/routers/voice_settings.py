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

# Default voice for TTS
DEFAULT_VOICE_ID = "amy"

# All available voices with full metadata
ALL_VOICES = {
    # American - Medium quality
    "amy": {
        "id": "amy",
        "name": "Amy",
        "accent": "American",
        "quality": "Medium",
        "gender": "Female",
        "description": "Clear, neutral tone",
        "available": True
    },
    "arctic": {
        "id": "arctic",
        "name": "Arctic",
        "accent": "American",
        "quality": "Medium",
        "gender": "Female",
        "description": "Crisp, clear tone",
        "available": True
    },
    "lessac": {
        "id": "lessac",
        "name": "Lessac",
        "accent": "American",
        "quality": "Medium",
        "gender": "Female",
        "description": "Warm, friendly tone",
        "available": True
    },
    "ryan": {
        "id": "ryan",
        "name": "Ryan",
        "accent": "American",
        "quality": "Medium",
        "gender": "Male",
        "description": "Professional tone",
        "available": True
    },
    # American - High quality
    "libritts": {
        "id": "libritts",
        "name": "LibriTTS",
        "accent": "American",
        "quality": "High",
        "gender": "Mixed",
        "description": "High-quality multi-speaker",
        "available": True
    },
    "ljspeech": {
        "id": "ljspeech",
        "name": "LJ Speech",
        "accent": "American",
        "quality": "High",
        "gender": "Female",
        "description": "High-quality audiobook style",
        "available": True
    },
    # American - Low quality (fast)
    "danny": {
        "id": "danny",
        "name": "Danny",
        "accent": "American",
        "quality": "Low",
        "gender": "Male",
        "description": "Fast generation, lower quality",
        "available": True
    },
    "kathleen": {
        "id": "kathleen",
        "name": "Kathleen",
        "accent": "American",
        "quality": "Low",
        "gender": "Female",
        "description": "Fast generation, lower quality",
        "available": True
    },
    # British - Medium quality
    "alba": {
        "id": "alba",
        "name": "Alba",
        "accent": "British",
        "quality": "Medium",
        "gender": "Female",
        "description": "Scottish accent",
        "available": True
    },
    "jenny_dioco": {
        "id": "jenny_dioco",
        "name": "Jenny",
        "accent": "British",
        "quality": "Medium",
        "gender": "Female",
        "description": "Clear British tone",
        "available": True
    },
    "northern_english_male": {
        "id": "northern_english_male",
        "name": "Northern English",
        "accent": "British",
        "quality": "Medium",
        "gender": "Male",
        "description": "Northern English accent",
        "available": True
    },
    "semaine": {
        "id": "semaine",
        "name": "Semaine",
        "accent": "British",
        "quality": "Medium",
        "gender": "Mixed",
        "description": "Expressive multi-speaker",
        "available": True
    },
    "southern_english_female": {
        "id": "southern_english_female",
        "name": "Southern English",
        "accent": "British",
        "quality": "Medium",
        "gender": "Female",
        "description": "Southern English RP accent",
        "available": True
    },
    "southern_english_male": {
        "id": "southern_english_male",
        "name": "Southern English",
        "accent": "British",
        "quality": "Medium",
        "gender": "Male",
        "description": "Southern English RP accent",
        "available": True
    },
    "vctk": {
        "id": "vctk",
        "name": "VCTK",
        "accent": "British",
        "quality": "Medium",
        "gender": "Mixed",
        "description": "Multi-speaker variety",
        "available": True
    },
    "cori": {
        "id": "cori",
        "name": "Cori",
        "accent": "British",
        "quality": "Medium",
        "gender": "Female",
        "description": "Welsh accent",
        "available": True
    },
}


class VoiceSettingsUpdate(BaseModel):
    enabled_voice_ids: List[str]
    default_voice_id: Optional[str] = None


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
    default_voice_id = settings.get("default_voice_id", DEFAULT_VOICE_ID) if settings else DEFAULT_VOICE_ID
    
    voices = []
    for voice_id, voice_data in ALL_VOICES.items():
        voices.append({
            **voice_data,
            "enabled": voice_id in enabled_ids,
            "is_default": voice_id == default_voice_id
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
        "available_count": len([v for v in voices if v["available"]]),
        "default_voice_id": default_voice_id
    }


@router.get("/enabled")
async def list_enabled_voices(current_user: dict = Depends(get_current_user)):
    """List only enabled voices (for /converse page) - available to all users"""
    settings = await database.system_config.find_one({"key": "voice_settings"})
    enabled_ids = settings.get("enabled_voice_ids", DEFAULT_ENABLED_VOICES) if settings else DEFAULT_ENABLED_VOICES
    default_voice_id = settings.get("default_voice_id", DEFAULT_VOICE_ID) if settings else DEFAULT_VOICE_ID
    
    voices = []
    for voice_id in enabled_ids:
        if voice_id in ALL_VOICES and ALL_VOICES[voice_id]["available"]:
            voices.append({
                **ALL_VOICES[voice_id],
                "is_default": voice_id == default_voice_id
            })
    
    # Sort by accent then name
    voices.sort(key=lambda v: (v["accent"], v["name"]))
    
    return {
        "voices": voices,
        "default_voice_id": default_voice_id
    }


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
    
    # Validate default voice if provided
    default_voice_id = update.default_voice_id
    if default_voice_id:
        if default_voice_id not in ALL_VOICES:
            raise HTTPException(status_code=400, detail=f"Invalid default voice ID: {default_voice_id}")
        if default_voice_id not in update.enabled_voice_ids:
            raise HTTPException(status_code=400, detail="Default voice must be in the enabled voices list")
    else:
        # If no default specified, keep existing or use first enabled
        settings = await database.system_config.find_one({"key": "voice_settings"})
        if settings and settings.get("default_voice_id") in update.enabled_voice_ids:
            default_voice_id = settings.get("default_voice_id")
        else:
            default_voice_id = update.enabled_voice_ids[0] if update.enabled_voice_ids else DEFAULT_VOICE_ID
    
    # Update or create settings
    await database.system_config.update_one(
        {"key": "voice_settings"},
        {
            "$set": {
                "key": "voice_settings",
                "enabled_voice_ids": update.enabled_voice_ids,
                "default_voice_id": default_voice_id,
                "updated_at": datetime.utcnow(),
                "updated_by": current_user["_id"]
            }
        },
        upsert=True
    )
    
    return {
        "success": True,
        "enabled_count": len(update.enabled_voice_ids),
        "enabled_voice_ids": update.enabled_voice_ids,
        "default_voice_id": default_voice_id
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
                "default_voice_id": DEFAULT_VOICE_ID,
                "updated_at": datetime.utcnow(),
                "updated_by": current_user["_id"]
            }
        },
        upsert=True
    )
    
    return {
        "success": True,
        "message": "Voice settings reset to defaults",
        "enabled_count": len(DEFAULT_ENABLED_VOICES),
        "default_voice_id": DEFAULT_VOICE_ID
    }
