"""
Speech-to-Text Router
API endpoints for audio transcription using faster-whisper
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from typing import Optional
import logging

from app.auth import get_current_user
from app.services.stt_service import get_stt_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stt", tags=["Speech-to-Text"])


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: Optional[str] = Query(None, description="Language code (e.g., 'en', 'es') or None for auto-detect"),
    current_user: dict = Depends(get_current_user)
):
    """
    Transcribe audio file to text using faster-whisper.
    
    Accepts various audio formats: WAV, MP3, WebM, OGG, FLAC, M4A
    
    Returns:
        - text: The transcribed text
        - metadata: Information about the transcription (language, duration, etc.)
    """
    # Validate file type
    content_type = audio.content_type or ""
    valid_types = [
        "audio/webm", "audio/wav", "audio/wave", "audio/x-wav",
        "audio/mp3", "audio/mpeg", "audio/ogg", "audio/flac",
        "audio/mp4", "audio/m4a", "audio/x-m4a",
        "video/webm"  # WebM can contain audio-only
    ]
    
    if not any(t in content_type for t in valid_types) and not audio.filename.endswith(
        ('.webm', '.wav', '.mp3', '.ogg', '.flac', '.m4a')
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid audio format: {content_type}. Supported: WebM, WAV, MP3, OGG, FLAC, M4A"
        )
    
    # Read audio data
    try:
        audio_data = await audio.read()
    except Exception as e:
        logger.error(f"Failed to read audio file: {e}")
        raise HTTPException(status_code=400, detail="Failed to read audio file")
    
    # Check file size (max 25MB)
    max_size = 25 * 1024 * 1024
    if len(audio_data) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"Audio file too large. Maximum size: 25MB, got: {len(audio_data) / 1024 / 1024:.1f}MB"
        )
    
    # Transcribe
    try:
        stt_service = get_stt_service()
        text, metadata = await stt_service.transcribe(
            audio_data=audio_data,
            language=language
        )
        
        return {
            "text": text,
            "metadata": metadata
        }
        
    except RuntimeError as e:
        logger.error(f"STT service error: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@router.get("/status")
async def get_stt_status(
    current_user: dict = Depends(get_current_user)
):
    """
    Get the status of the STT service.
    
    Returns information about model loading, device, etc.
    """
    try:
        stt_service = get_stt_service()
        status = stt_service.get_status()
        return status
    except Exception as e:
        logger.error(f"Failed to get STT status: {e}")
        return {
            "initialized": False,
            "error": str(e)
        }


@router.post("/initialize")
async def initialize_stt(
    current_user: dict = Depends(get_current_user)
):
    """
    Manually initialize/reload the STT model.
    
    Useful if the model failed to load at startup.
    """
    try:
        stt_service = get_stt_service()
        success = await stt_service.initialize()
        
        if success:
            return {
                "status": "initialized",
                "model": stt_service.model_size,
                "device": stt_service.device
            }
        else:
            raise HTTPException(
                status_code=503,
                detail="Failed to initialize STT model"
            )
            
    except Exception as e:
        logger.error(f"STT initialization failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
