"""
Edge-TTS Service - Text-to-Speech using Microsoft Edge TTS
No API key required, runs in-process
"""

import os
import hashlib
import asyncio
from typing import Optional, List, Dict
from pathlib import Path

# TTS Cache directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HAL_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(SCRIPT_DIR)))
TTS_CACHE_PATH = os.environ.get("HAL_TTS_CACHE", os.path.join(HAL_ROOT, "backend", "data", "tts_cache"))

# Ensure cache directory exists
os.makedirs(TTS_CACHE_PATH, exist_ok=True)

# Available voices (subset of edge-tts voices)
VOICES = {
    "en-US-GuyNeural": {"name": "Guy (US)", "gender": "male", "locale": "en-US"},
    "en-US-JennyNeural": {"name": "Jenny (US)", "gender": "female", "locale": "en-US"},
    "en-US-AriaNeural": {"name": "Aria (US)", "gender": "female", "locale": "en-US"},
    "en-US-DavisNeural": {"name": "Davis (US)", "gender": "male", "locale": "en-US"},
    "en-GB-SoniaNeural": {"name": "Sonia (UK)", "gender": "female", "locale": "en-GB"},
    "en-GB-RyanNeural": {"name": "Ryan (UK)", "gender": "male", "locale": "en-GB"},
    "en-AU-NatashaNeural": {"name": "Natasha (AU)", "gender": "female", "locale": "en-AU"},
    "en-AU-WilliamNeural": {"name": "William (AU)", "gender": "male", "locale": "en-AU"},
}

DEFAULT_VOICE = "en-US-GuyNeural"


class EdgeTTSService:
    """Edge-TTS wrapper for text-to-speech"""
    
    def __init__(self):
        self.is_available = False
        self._init_error = None
        self._initialize()
    
    def _initialize(self):
        """Initialize edge-tts"""
        try:
            import edge_tts
            self.edge_tts = edge_tts
            self.is_available = True
            print("[TTS] Edge-TTS initialized successfully")
        except ImportError as e:
            self._init_error = "edge-tts not installed. Run: pip install edge-tts"
            print(f"[TTS] Failed to initialize: {self._init_error}")
        except Exception as e:
            self._init_error = str(e)
            print(f"[TTS] Failed to initialize: {e}")
    
    def get_cache_path(self, text: str, voice_id: str) -> str:
        """Generate a cache path for the given text and voice"""
        cache_key = hashlib.md5(f"{text}:{voice_id}".encode()).hexdigest()
        return os.path.join(TTS_CACHE_PATH, f"{cache_key}.mp3")
    
    async def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
        use_cache: bool = True
    ) -> Optional[str]:
        """
        Generate speech from text using edge-tts
        
        Args:
            text: Text to convert to speech
            voice_id: Voice ID (e.g., "en-US-GuyNeural")
            use_cache: Whether to use cached audio if available
            
        Returns:
            Path to generated audio file, or None if failed
        """
        if not self.is_available:
            raise Exception(f"TTS not available: {self._init_error}")
        
        voice = voice_id or DEFAULT_VOICE
        if voice not in VOICES:
            voice = DEFAULT_VOICE
        
        # Check cache
        cache_path = self.get_cache_path(text, voice)
        if use_cache and os.path.exists(cache_path):
            print(f"[TTS] Using cached audio: {cache_path}")
            return cache_path
        
        try:
            print(f"[TTS] Generating speech for: {text[:50]}...")
            
            # Generate with edge-tts
            communicate = self.edge_tts.Communicate(text, voice)
            await communicate.save(cache_path)
            
            print(f"[TTS] Generated audio: {cache_path}")
            return cache_path
            
        except Exception as e:
            print(f"[TTS] Generation failed: {e}")
            # Clean up partial file
            if os.path.exists(cache_path):
                os.remove(cache_path)
            raise
    
    def get_voices(self) -> List[Dict]:
        """Get available voices"""
        return [
            {
                "id": voice_id,
                "name": info["name"],
                "gender": info["gender"],
                "locale": info["locale"]
            }
            for voice_id, info in VOICES.items()
        ]
    
    def get_status(self) -> Dict:
        """Get service status"""
        return {
            "status": "healthy" if self.is_available else "unavailable",
            "error": self._init_error,
            "default_voice": DEFAULT_VOICE if self.is_available else None
        }


# Global instance
_tts_service: Optional[EdgeTTSService] = None


def get_tts_service() -> EdgeTTSService:
    """Get or create the TTS service instance"""
    global _tts_service
    if _tts_service is None:
        _tts_service = EdgeTTSService()
    return _tts_service
