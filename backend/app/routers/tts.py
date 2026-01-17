"""TTS Router - Text-to-Speech API endpoints"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import httpx
import os

from app.auth import get_current_user

router = APIRouter(prefix="/tts", tags=["tts"])

# TTS Service URL (separate service due to GPU requirements)
TTS_SERVICE_URL = os.environ.get("TTS_SERVICE_URL", "http://localhost:8001")


class TTSGenerateRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None
    use_cache: bool = True


@router.get("/health")
async def tts_health():
    """Check if TTS service is available"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{TTS_SERVICE_URL}/health")
            return response.json()
    except Exception as e:
        return {
            "status": "unavailable",
            "error": str(e),
            "service_url": TTS_SERVICE_URL
        }


@router.get("/voices")
async def list_voices(current_user: dict = Depends(get_current_user)):
    """List available voice samples"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{TTS_SERVICE_URL}/voices")
            if response.status_code == 200:
                return response.json()
            raise HTTPException(status_code=response.status_code, detail="Failed to get voices")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"TTS service unavailable: {str(e)}")


@router.post("/generate")
async def generate_speech(
    request: TTSGenerateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Generate speech from text"""
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{TTS_SERVICE_URL}/generate",
                json={
                    "text": request.text,
                    "voice_id": request.voice_id,
                    "use_cache": request.use_cache
                }
            )
            
            if response.status_code == 200:
                # Stream the audio back
                return StreamingResponse(
                    iter([response.content]),
                    media_type="audio/wav",
                    headers={
                        "Content-Disposition": "inline; filename=speech.wav"
                    }
                )
            else:
                error_detail = response.json().get("detail", "Unknown error")
                raise HTTPException(status_code=response.status_code, detail=error_detail)
                
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"TTS service unavailable: {str(e)}")
