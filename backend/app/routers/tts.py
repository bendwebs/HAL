"""TTS Router - Text-to-Speech API endpoints supporting multiple engines"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, Literal

from app.auth import get_current_user
from app.services.tts_service import get_tts_service

router = APIRouter(prefix="/tts", tags=["tts"])

# Default engine - use piper for speed, chatterbox for quality
DEFAULT_ENGINE = "piper"


class TTSGenerateRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None
    engine: Optional[Literal["chatterbox", "piper"]] = None  # None = use default
    exaggeration: Optional[float] = 0.5  # Chatterbox: emotion intensity
    cfg_weight: Optional[float] = 0.5    # Chatterbox: voice similarity
    use_cache: bool = True
    use_turbo: bool = True  # Chatterbox: use faster Turbo model


def get_engine_service(engine: str = None):
    """Get the appropriate TTS service based on engine preference"""
    engine = engine or DEFAULT_ENGINE
    
    if engine == "piper":
        try:
            from app.services.piper_tts_service import get_piper_tts_service
            service = get_piper_tts_service()
            if service.is_available:
                return service, "piper"
        except ImportError:
            pass
    
    # Fall back to chatterbox
    service = get_tts_service()
    return service, "chatterbox"


@router.get("/health")
async def tts_health():
    """Check TTS service status for all engines"""
    chatterbox = get_tts_service()
    
    status = {
        "chatterbox": chatterbox.get_status(),
        "default_engine": DEFAULT_ENGINE
    }
    
    try:
        from app.services.piper_tts_service import get_piper_tts_service
        piper = get_piper_tts_service()
        status["piper"] = piper.get_status()
    except ImportError:
        status["piper"] = {"status": "unavailable", "error": "piper-tts not installed"}
    
    return status


@router.get("/voices")
async def list_voices(
    engine: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List available voices for the specified engine"""
    service, engine_name = get_engine_service(engine)
    voices = service.get_voices()
    return {"engine": engine_name, "voices": voices}


@router.post("/generate")
async def generate_speech(
    request: TTSGenerateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Generate speech from text
    
    - engine='piper': Ultra-fast CPU synthesis (~0.5s), good quality
    - engine='chatterbox': High quality with voice cloning (~30s on CPU)
    """
    service, engine_name = get_engine_service(request.engine)
    
    if not service.is_available:
        raise HTTPException(status_code=503, detail=f"TTS service ({engine_name}) unavailable")
    
    try:
        # Build kwargs based on engine
        if engine_name == "chatterbox":
            audio_bytes = await service.generate(
                text=request.text,
                voice_id=request.voice_id,
                exaggeration=request.exaggeration,
                cfg_weight=request.cfg_weight,
                use_cache=request.use_cache,
                use_turbo=request.use_turbo
            )
        else:  # piper
            audio_bytes = await service.generate(
                text=request.text,
                voice_id=request.voice_id,
                use_cache=request.use_cache
            )
        
        return Response(
            content=audio_bytes,
            media_type="audio/wav",
            headers={
                "Content-Disposition": "attachment; filename=speech.wav",
                "Cache-Control": "public, max-age=86400",
                "X-TTS-Engine": engine_name
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/voices/upload")
async def upload_voice_sample(
    voice_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a voice sample for Chatterbox voice cloning (5-10 seconds recommended)"""
    service = get_tts_service()  # Only chatterbox supports voice cloning
    
    if not service.is_available:
        raise HTTPException(status_code=503, detail="Chatterbox TTS service unavailable")
    
    allowed_types = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/flac', 'audio/ogg']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}")
    
    try:
        audio_data = await file.read()
        ext_map = {'audio/wav': '.wav', 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/flac': '.flac', 'audio/ogg': '.ogg'}
        file_ext = ext_map.get(file.content_type, '.wav')
        file_path = service.add_voice_sample(voice_id, audio_data, file_ext)
        
        return {"success": True, "voice_id": voice_id, "path": file_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/voices/{voice_id}")
async def delete_voice_sample(voice_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a voice sample"""
    import os
    from app.services.tts_service import VOICE_SAMPLES_PATH
    
    for ext in ['.wav', '.mp3', '.flac', '.ogg']:
        path = os.path.join(VOICE_SAMPLES_PATH, f"{voice_id}{ext}")
        if os.path.exists(path):
            os.remove(path)
            return {"success": True, "message": f"Voice '{voice_id}' deleted"}
    
    raise HTTPException(status_code=404, detail=f"Voice '{voice_id}' not found")
