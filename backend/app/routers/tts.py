"""TTS Router - Text-to-Speech API endpoints using Edge-TTS"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from app.auth import get_current_user
from app.services.tts_service import get_tts_service

router = APIRouter(prefix="/tts", tags=["tts"])


class TTSGenerateRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None
    use_cache: bool = True


@router.get("/health")
async def tts_health():
    """Check if TTS service is available"""
    service = get_tts_service()
    return service.get_status()


@router.get("/voices")
async def list_voices(current_user: dict = Depends(get_current_user)):
    """List available voices"""
    service = get_tts_service()
    return {"voices": service.get_voices()}


@router.post("/generate")
async def generate_speech(
    request: TTSGenerateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Generate speech from text"""
    service = get_tts_service()
    
    if not service.is_available:
        raise HTTPException(status_code=503, detail="TTS service unavailable")
    
    try:
        audio_path = await service.generate(
            text=request.text,
            voice_id=request.voice_id,
            use_cache=request.use_cache
        )
        
        if not audio_path:
            raise HTTPException(status_code=500, detail="Failed to generate speech")
        
        return FileResponse(
            audio_path,
            media_type="audio/mpeg",
            filename="speech.mp3"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
