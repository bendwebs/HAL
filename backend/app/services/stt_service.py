"""
Speech-to-Text Service using faster-whisper
Provides local, GPU-accelerated speech transcription
"""

import logging
import asyncio
import tempfile
import os
from typing import Optional, Tuple
from functools import lru_cache
import time

logger = logging.getLogger(__name__)

# Global model instance
_whisper_model = None
_model_lock = asyncio.Lock()


class STTService:
    """Speech-to-Text service using faster-whisper"""
    
    def __init__(
        self,
        model_size: str = "large-v3",
        device: str = "cuda",
        compute_type: str = "float16"
    ):
        """
        Initialize the STT service.
        
        Args:
            model_size: Whisper model size (tiny, base, small, medium, large-v2, large-v3)
            device: Device to run on (cuda, cpu)
            compute_type: Computation type (float16, int8, int8_float16)
        """
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.model = None
        self._initialized = False
    
    async def initialize(self) -> bool:
        """Load the Whisper model. Call this once at startup."""
        global _whisper_model
        
        if self._initialized and self.model is not None:
            return True
        
        async with _model_lock:
            # Double-check after acquiring lock
            if _whisper_model is not None:
                self.model = _whisper_model
                self._initialized = True
                return True
            
            try:
                logger.info(f"Loading faster-whisper model: {self.model_size} on {self.device}")
                start_time = time.time()
                
                # Import here to avoid loading at module import time
                from faster_whisper import WhisperModel
                
                # Load model in thread pool to not block event loop
                loop = asyncio.get_event_loop()
                self.model = await loop.run_in_executor(
                    None,
                    lambda: WhisperModel(
                        self.model_size,
                        device=self.device,
                        compute_type=self.compute_type
                    )
                )
                
                _whisper_model = self.model
                self._initialized = True
                
                load_time = time.time() - start_time
                logger.info(f"Whisper model loaded in {load_time:.2f}s")
                return True
                
            except Exception as e:
                logger.error(f"Failed to load Whisper model: {e}")
                # Try CPU fallback
                if self.device == "cuda":
                    logger.info("Attempting CPU fallback...")
                    try:
                        from faster_whisper import WhisperModel
                        loop = asyncio.get_event_loop()
                        self.model = await loop.run_in_executor(
                            None,
                            lambda: WhisperModel(
                                self.model_size,
                                device="cpu",
                                compute_type="int8"
                            )
                        )
                        _whisper_model = self.model
                        self._initialized = True
                        self.device = "cpu"
                        self.compute_type = "int8"
                        logger.info("Whisper model loaded on CPU (fallback)")
                        return True
                    except Exception as e2:
                        logger.error(f"CPU fallback also failed: {e2}")
                return False
    
    async def transcribe(
        self,
        audio_data: bytes,
        language: Optional[str] = None,
        task: str = "transcribe"
    ) -> Tuple[str, dict]:
        """
        Transcribe audio data to text.
        
        Args:
            audio_data: Raw audio bytes (WAV, MP3, WebM, etc.)
            language: Language code (e.g., 'en', 'es') or None for auto-detect
            task: 'transcribe' or 'translate' (translate to English)
        
        Returns:
            Tuple of (transcribed_text, metadata_dict)
        """
        if not self._initialized:
            await self.initialize()
        
        if self.model is None:
            raise RuntimeError("STT model not initialized")
        
        # Write audio to temp file (faster-whisper needs file path)
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
            f.write(audio_data)
            temp_path = f.name
        
        try:
            start_time = time.time()
            
            # Run transcription in thread pool
            # Optimized settings for lower latency:
            # - beam_size=1 for greedy decoding (faster)
            # - best_of=1 (no multiple samples)
            # - temperature=0 (deterministic)
            loop = asyncio.get_event_loop()
            segments, info = await loop.run_in_executor(
                None,
                lambda: self.model.transcribe(
                    temp_path,
                    language=language,
                    task=task,
                    beam_size=1,          # Reduced from 5 for speed
                    best_of=1,            # Reduced from 5 for speed
                    temperature=0.0,
                    condition_on_previous_text=False,  # Faster, less context
                    vad_filter=True,      # Filter out non-speech
                    vad_parameters=dict(
                        min_silence_duration_ms=300,  # Reduced from 500
                        speech_pad_ms=200,            # Reduced from 400
                    )
                )
            )
            
            # Collect all segments
            text_parts = []
            for segment in segments:
                text_parts.append(segment.text.strip())
            
            full_text = " ".join(text_parts)
            
            transcribe_time = time.time() - start_time
            
            metadata = {
                "language": info.language,
                "language_probability": info.language_probability,
                "duration": info.duration,
                "transcribe_time": transcribe_time,
                "device": self.device,
                "model": self.model_size
            }
            
            logger.info(
                f"Transcribed {info.duration:.1f}s audio in {transcribe_time:.2f}s "
                f"(lang: {info.language}, prob: {info.language_probability:.2f})"
            )
            
            return full_text, metadata
            
        finally:
            # Clean up temp file
            try:
                os.unlink(temp_path)
            except Exception:
                pass
    
    async def transcribe_streaming(
        self,
        audio_data: bytes,
        language: Optional[str] = None
    ):
        """
        Transcribe audio and yield segments as they're processed.
        Useful for real-time feedback.
        
        Yields:
            dict with 'text', 'start', 'end', 'is_final' keys
        """
        if not self._initialized:
            await self.initialize()
        
        if self.model is None:
            raise RuntimeError("STT model not initialized")
        
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
            f.write(audio_data)
            temp_path = f.name
        
        try:
            loop = asyncio.get_event_loop()
            
            # Get segments generator
            segments_gen, info = await loop.run_in_executor(
                None,
                lambda: self.model.transcribe(
                    temp_path,
                    language=language,
                    beam_size=5,
                    vad_filter=True
                )
            )
            
            # Yield each segment
            for segment in segments_gen:
                yield {
                    "text": segment.text.strip(),
                    "start": segment.start,
                    "end": segment.end,
                    "is_final": True
                }
                
        finally:
            try:
                os.unlink(temp_path)
            except Exception:
                pass
    
    def get_status(self) -> dict:
        """Get service status information"""
        return {
            "initialized": self._initialized,
            "model_size": self.model_size,
            "device": self.device,
            "compute_type": self.compute_type,
            "ready": self.model is not None
        }


# Singleton instance
_stt_service: Optional[STTService] = None


def get_stt_service() -> STTService:
    """Get or create the STT service singleton"""
    global _stt_service
    
    if _stt_service is None:
        from app.config import settings
        
        # Get settings with defaults
        model_size = getattr(settings, 'whisper_model_size', 'large-v3')
        device = getattr(settings, 'whisper_device', 'cuda')
        compute_type = getattr(settings, 'whisper_compute_type', 'float16')
        
        _stt_service = STTService(
            model_size=model_size,
            device=device,
            compute_type=compute_type
        )
    
    return _stt_service


async def initialize_stt_service() -> bool:
    """Initialize the STT service at startup"""
    service = get_stt_service()
    return await service.initialize()
