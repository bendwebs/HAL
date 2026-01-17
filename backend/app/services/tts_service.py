"""
IndexTTS Service - Text-to-Speech integration for HAL
Runs as a separate service due to heavy GPU requirements
"""

import os
import sys
import json
import asyncio
import tempfile
import hashlib
from pathlib import Path
from typing import Optional
from datetime import datetime

# Configuration
# Default path is inside HAL folder (E:\Coding\Hal\index-tts)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HAL_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(SCRIPT_DIR)))
INDEXTTS_PATH = os.environ.get("INDEXTTS_PATH", os.path.join(HAL_ROOT, "index-tts"))
CHECKPOINTS_PATH = os.path.join(INDEXTTS_PATH, "checkpoints")
VOICE_SAMPLES_PATH = os.environ.get("HAL_VOICE_SAMPLES", os.path.join(HAL_ROOT, "backend", "data", "voices"))
TTS_CACHE_PATH = os.environ.get("HAL_TTS_CACHE", os.path.join(HAL_ROOT, "backend", "data", "tts_cache"))

# Ensure directories exist
os.makedirs(VOICE_SAMPLES_PATH, exist_ok=True)
os.makedirs(TTS_CACHE_PATH, exist_ok=True)


class IndexTTSService:
    """Wrapper for IndexTTS model"""
    
    def __init__(self):
        self.tts = None
        self.is_available = False
        self._init_error = None
        self.default_voice = None
        
    def initialize(self, use_fp16: bool = True, use_cuda_kernel: bool = False):
        """Initialize the IndexTTS model"""
        try:
            # Add IndexTTS to path
            if INDEXTTS_PATH not in sys.path:
                sys.path.insert(0, INDEXTTS_PATH)
            
            from indextts.infer_v2 import IndexTTS2
            
            config_path = os.path.join(CHECKPOINTS_PATH, "config.yaml")
            
            if not os.path.exists(config_path):
                raise FileNotFoundError(f"IndexTTS config not found at {config_path}")
            
            print(f"[TTS] Initializing IndexTTS2 from {CHECKPOINTS_PATH}...")
            self.tts = IndexTTS2(
                cfg_path=config_path,
                model_dir=CHECKPOINTS_PATH,
                use_fp16=use_fp16,
                use_cuda_kernel=use_cuda_kernel,
                use_deepspeed=False
            )
            
            # Find default voice
            self._find_default_voice()
            
            self.is_available = True
            print(f"[TTS] IndexTTS2 initialized successfully")
            print(f"[TTS] Default voice: {self.default_voice}")
            
        except Exception as e:
            self._init_error = str(e)
            print(f"[TTS] Failed to initialize: {e}")
            import traceback
            traceback.print_exc()
    
    def _find_default_voice(self):
        """Find a default voice sample"""
        # Check user voices first
        if os.path.exists(VOICE_SAMPLES_PATH):
            for f in os.listdir(VOICE_SAMPLES_PATH):
                if f.endswith(('.wav', '.mp3', '.flac')):
                    voice_file = os.path.join(VOICE_SAMPLES_PATH, f)
                    # Skip small files (likely LFS stubs)
                    if os.path.getsize(voice_file) > 1000:
                        self.default_voice = voice_file
                        return
        
        # Fall back to IndexTTS examples
        examples_path = os.path.join(INDEXTTS_PATH, "examples")
        if os.path.exists(examples_path):
            for f in os.listdir(examples_path):
                if f.startswith("voice_") and f.endswith(".wav"):
                    voice_file = os.path.join(examples_path, f)
                    # Skip small files (likely LFS stubs)
                    if os.path.getsize(voice_file) > 1000:
                        self.default_voice = voice_file
                        return
    
    def get_cache_path(self, text: str, voice_id: str) -> str:
        """Generate a cache path for the given text and voice"""
        cache_key = hashlib.md5(f"{text}:{voice_id}".encode()).hexdigest()
        return os.path.join(TTS_CACHE_PATH, f"{cache_key}.wav")
    
    def generate(
        self,
        text: str,
        voice_path: Optional[str] = None,
        output_path: Optional[str] = None,
        use_cache: bool = True
    ) -> Optional[str]:
        """
        Generate speech from text
        
        Args:
            text: Text to synthesize
            voice_path: Path to voice sample for cloning (uses default if None)
            output_path: Where to save the output (auto-generated if None)
            use_cache: Whether to use cached audio if available
            
        Returns:
            Path to generated audio file, or None if failed
        """
        if not self.is_available:
            print(f"[TTS] Service not available: {self._init_error}")
            return None
        
        # Use default voice if not specified
        if not voice_path:
            voice_path = self.default_voice
        
        if not voice_path or not os.path.exists(voice_path):
            print(f"[TTS] No valid voice sample found")
            return None
        
        # Check cache
        voice_id = os.path.basename(voice_path)
        cache_path = self.get_cache_path(text, voice_id)
        
        if use_cache and os.path.exists(cache_path):
            print(f"[TTS] Using cached audio: {cache_path}")
            return cache_path
        
        # Generate output path if not specified
        if not output_path:
            output_path = cache_path
        
        try:
            print(f"[TTS] Generating speech for: {text[:50]}...")
            self.tts.infer(
                spk_audio_prompt=voice_path,
                text=text,
                output_path=output_path,
                verbose=False
            )
            print(f"[TTS] Generated: {output_path}")
            return output_path
            
        except Exception as e:
            print(f"[TTS] Generation failed: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def list_voices(self) -> list:
        """List available voice samples"""
        voices = []
        
        # User voices
        if os.path.exists(VOICE_SAMPLES_PATH):
            for f in os.listdir(VOICE_SAMPLES_PATH):
                if f.endswith(('.wav', '.mp3', '.flac')):
                    voices.append({
                        "id": f,
                        "name": os.path.splitext(f)[0],
                        "path": os.path.join(VOICE_SAMPLES_PATH, f),
                        "source": "user"
                    })
        
        # Built-in IndexTTS examples
        examples_path = os.path.join(INDEXTTS_PATH, "examples")
        if os.path.exists(examples_path):
            for f in os.listdir(examples_path):
                if f.startswith("voice_") and f.endswith(".wav"):
                    voices.append({
                        "id": f,
                        "name": f"IndexTTS {os.path.splitext(f)[0]}",
                        "path": os.path.join(examples_path, f),
                        "source": "builtin"
                    })
        
        return voices


# FastAPI service for TTS
if __name__ == "__main__":
    from fastapi import FastAPI, HTTPException, BackgroundTasks
    from fastapi.responses import FileResponse
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn
    
    app = FastAPI(title="HAL TTS Service", version="1.0.0")
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Initialize TTS service
    tts_service = IndexTTSService()
    
    class TTSRequest(BaseModel):
        text: str
        voice_id: Optional[str] = None
        use_cache: bool = True
    
    @app.on_event("startup")
    async def startup():
        print("[TTS Server] Starting up...")
        tts_service.initialize(use_fp16=True)
    
    @app.get("/health")
    async def health():
        return {
            "status": "healthy" if tts_service.is_available else "unavailable",
            "error": tts_service._init_error,
            "default_voice": tts_service.default_voice
        }
    
    @app.get("/voices")
    async def list_voices():
        return {"voices": tts_service.list_voices()}
    
    @app.post("/generate")
    async def generate_speech(request: TTSRequest):
        if not tts_service.is_available:
            raise HTTPException(status_code=503, detail=f"TTS service unavailable: {tts_service._init_error}")
        
        # Find voice path
        voice_path = None
        if request.voice_id:
            voices = tts_service.list_voices()
            for v in voices:
                if v["id"] == request.voice_id:
                    voice_path = v["path"]
                    break
        
        # Generate audio
        output_path = tts_service.generate(
            text=request.text,
            voice_path=voice_path,
            use_cache=request.use_cache
        )
        
        if not output_path:
            raise HTTPException(status_code=500, detail="Failed to generate speech")
        
        return FileResponse(
            output_path,
            media_type="audio/wav",
            filename="speech.wav"
        )
    
    # Run server
    uvicorn.run(app, host="0.0.0.0", port=8001)
