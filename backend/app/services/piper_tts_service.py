"""
Piper TTS Service - Ultra-fast CPU-based Text-to-Speech
Piper is optimized for CPU and can generate speech in real-time
"""

import os
import hashlib
import asyncio
import io
import wave
from typing import Optional, List, Dict
from pathlib import Path
import threading
import time

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HAL_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(SCRIPT_DIR)))
TTS_CACHE_PATH = os.environ.get("HAL_TTS_CACHE", os.path.join(HAL_ROOT, "backend", "data", "tts_cache"))
PIPER_MODELS_PATH = os.environ.get("HAL_PIPER_MODELS", os.path.join(HAL_ROOT, "backend", "data", "piper_models"))

os.makedirs(TTS_CACHE_PATH, exist_ok=True)
os.makedirs(PIPER_MODELS_PATH, exist_ok=True)


class PiperTTSService:
    """Piper TTS - Ultra-fast CPU-based text-to-speech"""
    
    # Available voices (will be downloaded on first use)
    # Format: voice_id -> model_name
    # American voices
    VOICES = {
        # American - Medium quality
        "amy": "en_US-amy-medium",
        "arctic": "en_US-arctic-medium",
        "lessac": "en_US-lessac-medium",
        "ryan": "en_US-ryan-medium",
        # American - High quality
        "libritts": "en_US-libritts-high",
        "ljspeech": "en_US-ljspeech-high",
        # American - Low quality (fast)
        "danny": "en_US-danny-low",
        "kathleen": "en_US-kathleen-low",
        # British - Medium quality
        "alba": "en_GB-alba-medium",
        "jenny_dioco": "en_GB-jenny_dioco-medium",
        "northern_english_male": "en_GB-northern_english_male-medium",
        "semaine": "en_GB-semaine-medium",
        "southern_english_female": "en_GB-southern_english_female-medium",
        "southern_english_male": "en_GB-southern_english_male-medium",
        "vctk": "en_GB-vctk-medium",
        # British - Low quality (fast)
        "cori": "en_GB-cori-medium",
    }
    
    # Voice metadata for UI display
    VOICE_METADATA = {
        # American Medium
        "amy": {"accent": "American", "quality": "Medium", "gender": "Female"},
        "arctic": {"accent": "American", "quality": "Medium", "gender": "Female"},
        "lessac": {"accent": "American", "quality": "Medium", "gender": "Female"},
        "ryan": {"accent": "American", "quality": "Medium", "gender": "Male"},
        # American High
        "libritts": {"accent": "American", "quality": "High", "gender": "Mixed"},
        "ljspeech": {"accent": "American", "quality": "High", "gender": "Female"},
        # American Low (not shown by default)
        "danny": {"accent": "American", "quality": "Low", "gender": "Male"},
        "kathleen": {"accent": "American", "quality": "Low", "gender": "Female"},
        # British Medium
        "alba": {"accent": "British", "quality": "Medium", "gender": "Female"},
        "jenny_dioco": {"accent": "British", "quality": "Medium", "gender": "Female"},
        "northern_english_male": {"accent": "British", "quality": "Medium", "gender": "Male"},
        "semaine": {"accent": "British", "quality": "Medium", "gender": "Mixed"},
        "southern_english_female": {"accent": "British", "quality": "Medium", "gender": "Female"},
        "southern_english_male": {"accent": "British", "quality": "Medium", "gender": "Male"},
        "vctk": {"accent": "British", "quality": "Medium", "gender": "Mixed"},
        "cori": {"accent": "British", "quality": "Medium", "gender": "Female"},
    }
    DEFAULT_VOICE = "amy"
    
    def __init__(self):
        self.is_available = False
        self._init_error = None
        self._voice = None
        self._model_lock = threading.Lock()
        self._current_voice_id = None
        self._initialize()
    
    def _initialize(self):
        """Initialize Piper TTS"""
        try:
            from piper import PiperVoice
            self._piper_voice_class = PiperVoice
            self.is_available = True
            print("[Piper TTS] Service initialized (model will load on first use)")
        except ImportError as e:
            self._init_error = f"piper-tts not installed: {e}"
            print(f"[Piper TTS] Failed to initialize: {self._init_error}")
        except Exception as e:
            self._init_error = str(e)
            print(f"[Piper TTS] Failed to initialize: {e}")
    
    def _get_model_path(self, voice_id: str) -> tuple[str, str]:
        """Get paths to model and config files, downloading if needed"""
        voice_name = self.VOICES.get(voice_id, self.VOICES[self.DEFAULT_VOICE])
        model_file = os.path.join(PIPER_MODELS_PATH, f"{voice_name}.onnx")
        config_file = os.path.join(PIPER_MODELS_PATH, f"{voice_name}.onnx.json")
        
        # Download if not exists
        if not os.path.exists(model_file):
            self._download_voice(voice_name)
        
        return model_file, config_file
    
    def _download_voice(self, voice_name: str):
        """Download a Piper voice model"""
        import urllib.request
        
        # Determine locale (en_US or en_GB)
        if voice_name.startswith("en_GB"):
            locale = "en_GB"
            locale_path = "en/en_GB"
        else:
            locale = "en_US"
            locale_path = "en/en_US"
        
        # Extract speaker name and quality from voice_name
        # Format: en_XX-speaker-quality -> speaker/quality/en_XX-speaker-quality
        parts = voice_name.replace(f"{locale}-", "").rsplit("-", 1)
        speaker = parts[0]
        quality = parts[1] if len(parts) > 1 else "medium"
        
        base_url = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/{locale_path}/{speaker}/{quality}"
        
        model_url = f"{base_url}/{voice_name}.onnx"
        config_url = f"{base_url}/{voice_name}.onnx.json"
        
        model_file = os.path.join(PIPER_MODELS_PATH, f"{voice_name}.onnx")
        config_file = os.path.join(PIPER_MODELS_PATH, f"{voice_name}.onnx.json")
        
        print(f"[Piper TTS] Downloading voice model: {voice_name}...")
        
        try:
            urllib.request.urlretrieve(model_url, model_file)
            urllib.request.urlretrieve(config_url, config_file)
            print(f"[Piper TTS] Voice downloaded: {voice_name}")
        except Exception as e:
            print(f"[Piper TTS] Failed to download voice: {e}")
            raise
    
    def _load_voice(self, voice_id: str = None):
        """Load a Piper voice model"""
        # Map unknown voice IDs to default
        if voice_id and voice_id not in self.VOICES:
            print(f"[Piper TTS] Unknown voice '{voice_id}', using default")
            voice_id = self.DEFAULT_VOICE
        voice_id = voice_id or self.DEFAULT_VOICE
        
        with self._model_lock:
            if self._voice is not None and self._current_voice_id == voice_id:
                return self._voice
            
            model_path, config_path = self._get_model_path(voice_id)
            
            print(f"[Piper TTS] Loading voice: {voice_id}...")
            start = time.time()
            self._voice = self._piper_voice_class.load(model_path, config_path)
            self._current_voice_id = voice_id
            print(f"[Piper TTS] Voice loaded in {time.time() - start:.2f}s")
            
            return self._voice
    
    def get_cache_path(self, text: str, voice_id: str) -> str:
        """Generate cache path for the given text and voice"""
        cache_key = hashlib.md5(f"piper:{text}:{voice_id}".encode()).hexdigest()
        return os.path.join(TTS_CACHE_PATH, f"{cache_key}.wav")
    
    async def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
        use_cache: bool = True,
        **kwargs  # Accept extra args for compatibility
    ) -> bytes:
        """Generate speech from text using Piper TTS"""
        if not self.is_available:
            raise Exception(f"Piper TTS not available: {self._init_error}")
        
        voice_id = voice_id or self.DEFAULT_VOICE
        
        # Check cache
        cache_path = self.get_cache_path(text, voice_id)
        if use_cache and os.path.exists(cache_path):
            print(f"[Piper TTS] Using cached audio")
            with open(cache_path, 'rb') as f:
                return f.read()
        
        try:
            print(f"[Piper TTS] Generating: {text[:50]}...")
            start_time = time.time()
            
            # Run in thread pool
            loop = asyncio.get_event_loop()
            audio_bytes = await loop.run_in_executor(
                None,
                self._generate_sync,
                text,
                voice_id,
                cache_path if use_cache else None
            )
            
            elapsed = time.time() - start_time
            print(f"[Piper TTS] Generated in {elapsed:.2f}s")
            
            return audio_bytes
            
        except Exception as e:
            print(f"[Piper TTS] Generation failed: {e}")
            raise
    
    def _generate_sync(self, text: str, voice_id: str, cache_path: Optional[str]) -> bytes:
        """Synchronous generation"""
        voice = self._load_voice(voice_id)
        
        # Generate audio using synthesize_wav
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as wav_file:
            # Let Piper set the WAV format (channels, sample width, rate)
            voice.synthesize_wav(text, wav_file, set_wav_format=True)
        
        audio_data = buffer.getvalue()
        
        # Cache
        if cache_path:
            with open(cache_path, 'wb') as f:
                f.write(audio_data)
        
        return audio_data
    
    def get_voices(self) -> List[Dict]:
        """Get available voices"""
        voices = []
        for voice_id, voice_name in self.VOICES.items():
            model_path = os.path.join(PIPER_MODELS_PATH, f"{voice_name}.onnx")
            metadata = self.VOICE_METADATA.get(voice_id, {})
            voices.append({
                "id": voice_id,
                "name": voice_id.replace("_", " ").title(),
                "model": voice_name,
                "downloaded": os.path.exists(model_path),
                "source": "piper",
                "accent": metadata.get("accent", "American"),
                "quality": metadata.get("quality", "Medium"),
                "gender": metadata.get("gender", "Unknown"),
            })
        return voices
    
    def get_status(self) -> Dict:
        """Get service status"""
        return {
            "status": "healthy" if self.is_available else "unavailable",
            "error": self._init_error,
            "engine": "piper",
            "device": "cpu",
            "model_loaded": self._voice is not None,
            "current_voice": self._current_voice_id
        }


# Global instance
_piper_service: Optional[PiperTTSService] = None


def get_piper_tts_service() -> PiperTTSService:
    """Get or create the Piper TTS service"""
    global _piper_service
    if _piper_service is None:
        _piper_service = PiperTTSService()
    return _piper_service
