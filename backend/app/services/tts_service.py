"""
Chatterbox TTS Service - Local Text-to-Speech using Chatterbox
Runs entirely locally on GPU - no external API calls
"""

import os
import hashlib
import asyncio
import io
from typing import Optional, List, Dict
from pathlib import Path
import threading
import time

# TTS Cache directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HAL_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(SCRIPT_DIR)))
TTS_CACHE_PATH = os.environ.get("HAL_TTS_CACHE", os.path.join(HAL_ROOT, "backend", "data", "tts_cache"))
VOICE_SAMPLES_PATH = os.environ.get("HAL_VOICE_SAMPLES", os.path.join(HAL_ROOT, "backend", "data", "voice_samples"))

# Ensure directories exist
os.makedirs(TTS_CACHE_PATH, exist_ok=True)
os.makedirs(VOICE_SAMPLES_PATH, exist_ok=True)

# Default voice settings
DEFAULT_EXAGGERATION = 0.5  # Emotion intensity (0.0 = monotone, 1.0 = very expressive)
DEFAULT_CFG_WEIGHT = 0.5    # How closely to follow reference voice


class ChatterboxTTSService:
    """Chatterbox TTS wrapper for local text-to-speech"""
    
    def __init__(self):
        self.is_available = False
        self._init_error = None
        self.model = None
        self.model_turbo = None
        self._model_lock = threading.Lock()
        self._device = "cuda"  # Default to GPU
        self._initialize()
    
    def _initialize(self):
        """Initialize Chatterbox TTS"""
        try:
            import torch
            
            # Check CUDA availability and architecture compatibility
            self._device = "cpu"  # Default to CPU
            if torch.cuda.is_available():
                gpu_name = torch.cuda.get_device_name(0)
                
                # Check if GPU architecture is supported by this PyTorch build
                # RTX 50 series (Blackwell) = sm_120, needs CUDA 12.8+
                # Get supported architectures
                supported_archs = torch.cuda.get_arch_list()
                
                # Get GPU compute capability
                major, minor = torch.cuda.get_device_capability(0)
                device_arch = f"sm_{major}{minor}"
                
                # Check if any supported arch can run on this GPU
                # PyTorch lists exact archs it was built for, but kernels are forward-compatible within generations
                max_supported = max([int(a.split('_')[1]) for a in supported_archs if a.startswith('sm_')])
                device_cc = major * 10 + minor
                
                if device_cc <= max_supported or device_arch in supported_archs:
                    self._device = "cuda"
                    print(f"[TTS] CUDA available: {gpu_name} ({device_arch})")
                else:
                    print(f"[TTS] WARNING: {gpu_name} ({device_arch}) not supported by PyTorch")
                    print(f"[TTS] Supported architectures: {supported_archs}")
                    print(f"[TTS] Falling back to CPU (TTS will be slower but functional)")
                    self._device = "cpu"
            else:
                print("[TTS] CUDA not available, using CPU (will be slower)")
            
            # Try to import chatterbox
            try:
                from chatterbox.tts import ChatterboxTTS
                self._chatterbox_tts_class = ChatterboxTTS
                print("[TTS] Chatterbox TTS module loaded")
            except ImportError:
                self._chatterbox_tts_class = None
                print("[TTS] ChatterboxTTS not available")
            
            # Try Turbo model (faster, recommended)
            try:
                from chatterbox.tts_turbo import ChatterboxTurboTTS
                self._chatterbox_turbo_class = ChatterboxTurboTTS
                print("[TTS] Chatterbox Turbo TTS module loaded")
            except ImportError:
                self._chatterbox_turbo_class = None
                print("[TTS] ChatterboxTurboTTS not available")
            
            if self._chatterbox_turbo_class is None and self._chatterbox_tts_class is None:
                raise ImportError("Neither ChatterboxTTS nor ChatterboxTurboTTS available")
            
            self.is_available = True
            print("[TTS] Chatterbox TTS service initialized (model will load on first use)")
            
        except ImportError as e:
            self._init_error = f"chatterbox-tts not installed. Run: pip install chatterbox-tts"
            print(f"[TTS] Failed to initialize: {self._init_error}")
        except Exception as e:
            self._init_error = str(e)
            print(f"[TTS] Failed to initialize: {e}")
    
    def _load_model(self, use_turbo: bool = True):
        """Load the TTS model (lazy loading on first use)"""
        with self._model_lock:
            if use_turbo and self._chatterbox_turbo_class:
                if self.model_turbo is None:
                    print(f"[TTS] Loading Chatterbox Turbo model on {self._device}...")
                    start = time.time()
                    self.model_turbo = self._chatterbox_turbo_class.from_pretrained(device=self._device)
                    print(f"[TTS] Turbo model loaded in {time.time() - start:.1f}s")
                return self.model_turbo
            elif self._chatterbox_tts_class:
                if self.model is None:
                    print(f"[TTS] Loading Chatterbox model on {self._device}...")
                    start = time.time()
                    self.model = self._chatterbox_tts_class.from_pretrained(device=self._device)
                    print(f"[TTS] Model loaded in {time.time() - start:.1f}s")
                return self.model
            else:
                raise Exception("No Chatterbox model available")
    
    def get_cache_path(self, text: str, voice_id: str, exaggeration: float, cfg_weight: float) -> str:
        """Generate a cache path for the given text and settings"""
        cache_key = hashlib.md5(f"{text}:{voice_id}:{exaggeration}:{cfg_weight}".encode()).hexdigest()
        return os.path.join(TTS_CACHE_PATH, f"{cache_key}.wav")
    
    def _get_voice_sample_path(self, voice_id: str) -> Optional[str]:
        """Get the path to a voice sample file"""
        # Check for voice sample in voice_samples directory
        for ext in ['.wav', '.mp3', '.flac', '.ogg']:
            path = os.path.join(VOICE_SAMPLES_PATH, f"{voice_id}{ext}")
            if os.path.exists(path):
                return path
        
        # Check if voice_id is already a path
        if os.path.exists(voice_id):
            return voice_id
        
        return None
    
    async def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
        exaggeration: float = DEFAULT_EXAGGERATION,
        cfg_weight: float = DEFAULT_CFG_WEIGHT,
        use_cache: bool = True,
        use_turbo: bool = True
    ) -> bytes:
        """
        Generate speech from text using Chatterbox TTS
        
        Args:
            text: Text to convert to speech
            voice_id: Voice sample ID or path (optional for voice cloning)
            exaggeration: Emotion intensity (0.0-1.0, default 0.5)
            cfg_weight: How closely to follow reference voice (0.0-1.0)
            use_cache: Whether to use cached audio if available
            use_turbo: Use Turbo model for faster generation
            
        Returns:
            Audio data as bytes (WAV format)
        """
        if not self.is_available:
            raise Exception(f"TTS not available: {self._init_error}")
        
        # Get voice sample path if provided
        voice_sample_path = None
        if voice_id:
            voice_sample_path = self._get_voice_sample_path(voice_id)
        
        # Check cache
        cache_key_voice = voice_id or "default"
        cache_path = self.get_cache_path(text, cache_key_voice, exaggeration, cfg_weight)
        
        if use_cache and os.path.exists(cache_path):
            print(f"[TTS] Using cached audio: {cache_path}")
            with open(cache_path, 'rb') as f:
                return f.read()
        
        try:
            print(f"[TTS] Generating speech for: {text[:50]}...")
            start_time = time.time()
            
            # Run generation in thread pool to not block async
            loop = asyncio.get_event_loop()
            audio_bytes = await loop.run_in_executor(
                None,
                self._generate_sync,
                text,
                voice_sample_path,
                exaggeration,
                cfg_weight,
                use_turbo,
                cache_path if use_cache else None
            )
            
            elapsed = time.time() - start_time
            print(f"[TTS] Generated audio in {elapsed:.2f}s")
            
            return audio_bytes
            
        except Exception as e:
            print(f"[TTS] Generation failed: {e}")
            raise
    
    def _generate_sync(
        self,
        text: str,
        voice_sample_path: Optional[str],
        exaggeration: float,
        cfg_weight: float,
        use_turbo: bool,
        cache_path: Optional[str]
    ) -> bytes:
        """Synchronous generation (runs in thread pool)"""
        import torch
        import numpy as np
        
        # Load model
        model = self._load_model(use_turbo=use_turbo)
        
        # Generate audio
        with torch.inference_mode():
            if voice_sample_path:
                wav = model.generate(
                    text,
                    audio_prompt_path=voice_sample_path,
                    exaggeration=exaggeration,
                    cfg_weight=cfg_weight
                )
            else:
                # Generate without voice cloning (uses default voice)
                wav = model.generate(
                    text,
                    exaggeration=exaggeration,
                    cfg_weight=cfg_weight
                )
        
        # Convert to bytes using scipy (more compatible than torchaudio with nightly PyTorch)
        buffer = io.BytesIO()
        try:
            # Try scipy first (more reliable)
            from scipy.io import wavfile
            # Convert tensor to numpy, handle shape
            audio_np = wav.squeeze().cpu().numpy()
            # Normalize to int16 range
            audio_int16 = (audio_np * 32767).astype(np.int16)
            wavfile.write(buffer, model.sr, audio_int16)
        except ImportError:
            # Fall back to torchaudio
            import torchaudio as ta
            ta.save(buffer, wav, model.sr, format="wav")
        
        audio_bytes = buffer.getvalue()
        
        # Cache if requested
        if cache_path:
            with open(cache_path, 'wb') as f:
                f.write(audio_bytes)
            print(f"[TTS] Cached audio: {cache_path}")
        
        return audio_bytes
        
        return audio_bytes
    
    def get_voices(self) -> List[Dict]:
        """Get available voice samples"""
        voices = []
        
        # List voice samples in directory
        if os.path.exists(VOICE_SAMPLES_PATH):
            for file in os.listdir(VOICE_SAMPLES_PATH):
                if file.endswith(('.wav', '.mp3', '.flac', '.ogg')):
                    voice_id = os.path.splitext(file)[0]
                    voices.append({
                        "id": voice_id,
                        "name": voice_id.replace('_', ' ').title(),
                        "path": os.path.join(VOICE_SAMPLES_PATH, file),
                        "source": "local"
                    })
        
        # Add default voice option
        voices.insert(0, {
            "id": "default",
            "name": "Default Voice",
            "path": None,
            "source": "builtin"
        })
        
        return voices
    
    def add_voice_sample(self, voice_id: str, audio_data: bytes, file_ext: str = ".wav") -> str:
        """Add a new voice sample for cloning"""
        file_path = os.path.join(VOICE_SAMPLES_PATH, f"{voice_id}{file_ext}")
        with open(file_path, 'wb') as f:
            f.write(audio_data)
        print(f"[TTS] Added voice sample: {file_path}")
        return file_path
    
    def get_status(self) -> Dict:
        """Get service status"""
        import torch
        
        status = {
            "status": "healthy" if self.is_available else "unavailable",
            "error": self._init_error,
            "device": self._device,
            "model_loaded": self.model is not None or self.model_turbo is not None,
            "turbo_available": self._chatterbox_turbo_class is not None if self.is_available else False,
        }
        
        if self.is_available and torch.cuda.is_available():
            status["gpu"] = torch.cuda.get_device_name(0)
            status["vram_allocated"] = f"{torch.cuda.memory_allocated() / 1024**3:.1f} GB"
            status["vram_total"] = f"{torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB"
        
        return status


# Global instance
_tts_service: Optional[ChatterboxTTSService] = None


def get_tts_service() -> ChatterboxTTSService:
    """Get or create the TTS service instance"""
    global _tts_service
    if _tts_service is None:
        _tts_service = ChatterboxTTSService()
    return _tts_service
