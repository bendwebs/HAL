"""
Video Processor Service - Download, extract audio, transcribe, and summarize YouTube videos
"""

import logging
import asyncio
import tempfile
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, AsyncGenerator
from bson import ObjectId

from app.database import database
from app.config import settings

logger = logging.getLogger(__name__)

# Directory for storing processed videos
UPLOAD_DIR = Path(settings.upload_dir if hasattr(settings, 'upload_dir') else "uploads")
VIDEO_DIR = UPLOAD_DIR / "videos"
VIDEO_DIR.mkdir(parents=True, exist_ok=True)


class VideoProcessor:
    """Service for processing YouTube videos - download, transcribe, summarize"""
    
    def __init__(self):
        self._initialized = False
    
    def _extract_video_id(self, url: str) -> Optional[str]:
        """Extract video ID from various YouTube URL formats"""
        patterns = [
            r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})',
            r'youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})',
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        return None
    
    async def get_video_info(self, url: str) -> Dict[str, Any]:
        """Get video metadata without downloading"""
        try:
            import yt_dlp
            
            video_id = self._extract_video_id(url)
            if not video_id:
                return {"success": False, "error": "Invalid YouTube URL"}
            
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
            }
            
            loop = asyncio.get_event_loop()
            
            def extract_info():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    return ydl.extract_info(url, download=False)
            
            info = await loop.run_in_executor(None, extract_info)
            
            return {
                "success": True,
                "video_id": video_id,
                "title": info.get('title', ''),
                "description": info.get('description', ''),
                "duration": info.get('duration', 0),
                "duration_string": info.get('duration_string', ''),
                "channel": info.get('channel', ''),
                "channel_id": info.get('channel_id', ''),
                "view_count": info.get('view_count', 0),
                "upload_date": info.get('upload_date', ''),
                "thumbnail": info.get('thumbnail', ''),
                "url": url,
            }
        except Exception as e:
            logger.error(f"Error getting video info: {e}")
            return {"success": False, "error": str(e)}
    
    async def download_video(
        self,
        url: str,
        user_id: str,
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Any]:
        """Download video from YouTube"""
        try:
            import yt_dlp
            
            video_id = self._extract_video_id(url)
            if not video_id:
                return {"success": False, "error": "Invalid YouTube URL"}
            
            # Create unique filename
            job_id = str(uuid.uuid4())[:8]
            output_dir = VIDEO_DIR / user_id
            output_dir.mkdir(parents=True, exist_ok=True)
            
            video_path = output_dir / f"{video_id}_{job_id}.mp4"
            
            def progress_hook(d):
                if progress_callback and d['status'] == 'downloading':
                    try:
                        percent = d.get('_percent_str', '0%').strip()
                        speed = d.get('_speed_str', 'N/A')
                        asyncio.get_event_loop().call_soon_threadsafe(
                            lambda: asyncio.create_task(progress_callback({
                                'stage': 'downloading',
                                'percent': percent,
                                'speed': speed
                            }))
                        )
                    except Exception:
                        pass
            
            ydl_opts = {
                'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                'outtmpl': str(video_path),
                'quiet': True,
                'no_warnings': True,
                'progress_hooks': [progress_hook] if progress_callback else [],
            }
            
            loop = asyncio.get_event_loop()
            
            def download():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                    return info
            
            info = await loop.run_in_executor(None, download)
            
            # Find the actual downloaded file (extension might vary)
            actual_path = None
            for ext in ['.mp4', '.webm', '.mkv']:
                test_path = video_path.with_suffix(ext)
                if test_path.exists():
                    actual_path = test_path
                    break
            
            if not actual_path:
                # Check if file exists with original extension
                for f in output_dir.glob(f"{video_id}_{job_id}.*"):
                    actual_path = f
                    break
            
            if not actual_path or not actual_path.exists():
                return {"success": False, "error": "Download completed but file not found"}
            
            return {
                "success": True,
                "video_id": video_id,
                "job_id": job_id,
                "video_path": str(actual_path),
                "title": info.get('title', ''),
                "duration": info.get('duration', 0),
            }
            
        except Exception as e:
            logger.error(f"Error downloading video: {e}")
            return {"success": False, "error": str(e)}
    
    async def extract_audio(
        self,
        video_path: str,
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Any]:
        """Extract audio from video file using ffmpeg"""
        try:
            import subprocess
            
            video_path = Path(video_path)
            if not video_path.exists():
                return {"success": False, "error": f"Video file not found: {video_path}"}
            
            audio_path = video_path.with_suffix('.wav')
            
            if progress_callback:
                await progress_callback({'stage': 'extracting_audio', 'percent': '0%'})
            
            # Use ffmpeg to extract audio - run in thread pool for Windows compatibility
            cmd = [
                'ffmpeg', '-y',  # Overwrite output
                '-i', str(video_path),
                '-vn',  # No video
                '-acodec', 'pcm_s16le',  # PCM format for whisper
                '-ar', '16000',  # 16kHz sample rate
                '-ac', '1',  # Mono
                str(audio_path)
            ]
            
            logger.info(f"Running ffmpeg command: {' '.join(cmd)}")
            
            loop = asyncio.get_event_loop()
            
            def run_ffmpeg():
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    shell=False
                )
                return result
            
            result = await loop.run_in_executor(None, run_ffmpeg)
            
            if result.returncode != 0:
                logger.error(f"FFmpeg error: {result.stderr}")
                return {"success": False, "error": f"Audio extraction failed: {result.stderr[:200]}"}
            
            if not audio_path.exists():
                return {"success": False, "error": "Audio extraction completed but file not found"}
            
            if progress_callback:
                await progress_callback({'stage': 'extracting_audio', 'percent': '100%'})
            
            return {
                "success": True,
                "audio_path": str(audio_path),
                "size_bytes": audio_path.stat().st_size
            }
            
        except Exception as e:
            logger.error(f"Error extracting audio: {e}")
            return {"success": False, "error": str(e)}
    
    async def transcribe_audio(
        self,
        audio_path: str,
        language: Optional[str] = None,
        vad_filter: bool = True,
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Any]:
        """Transcribe audio using faster-whisper"""
        try:
            from app.services.stt_service import get_stt_service
            
            audio_path = Path(audio_path)
            if not audio_path.exists():
                return {"success": False, "error": "Audio file not found"}
            
            if progress_callback:
                await progress_callback({'stage': 'transcribing', 'percent': '0%'})
            
            stt_service = get_stt_service()
            
            # Ensure service is initialized
            if not stt_service._initialized:
                await stt_service.initialize()
            
            # Read audio file
            with open(audio_path, 'rb') as f:
                audio_data = f.read()
            
            if progress_callback:
                await progress_callback({'stage': 'transcribing', 'percent': '10%'})
            
            # Transcribe
            text, metadata = await stt_service.transcribe(
                audio_data, language=language, vad_filter=vad_filter
            )
            
            if progress_callback:
                await progress_callback({'stage': 'transcribing', 'percent': '100%'})
            
            return {
                "success": True,
                "transcript": text,
                "language": metadata.get('language', 'unknown'),
                "language_probability": metadata.get('language_probability', 0),
                "duration": metadata.get('duration', 0),
                "transcribe_time": metadata.get('transcribe_time', 0),
            }
            
        except Exception as e:
            logger.error(f"Error transcribing audio: {e}")
            return {"success": False, "error": str(e)}
    
    async def summarize_transcript(
        self,
        transcript: str,
        title: str = "",
        model: Optional[str] = None,
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Any]:
        """Summarize transcript using Ollama LLM"""
        try:
            if not transcript or not transcript.strip():
                return {"success": False, "error": "Transcript is empty — nothing to summarize"}

            from app.services.ollama_client import get_ollama_client
            
            if progress_callback:
                await progress_callback({'stage': 'summarizing', 'percent': '0%'})
            
            client = get_ollama_client()
            
            # Use configured model or default
            model = model or getattr(settings, 'default_chat_model', 'llama3.2')
            
            system_prompt = """You summarize videos the way a sharp friend would explain one to you over coffee.

Write in plain, natural prose. No markdown, no bullet points, no headers, no bold/italic, no formatting of any kind. Just clean sentences and paragraphs.

Lead with what the video is actually about in a sentence or two. Then walk through the key ideas in a natural flow, adding detail only where it helps understanding. If there are specific numbers, names, or examples that matter, include them, but don't catalog every detail.

Keep it conversational but intelligent. Someone reading this should walk away feeling like they got the substance of the video without having watched it.

Skip filler, intros, outros, sponsor segments, and repetition from the original. Get to what matters."""

            user_prompt = f"""Here's a video transcript to summarize.

Title: {title}

Transcript:
{transcript[:15000]}"""

            if progress_callback:
                await progress_callback({'stage': 'summarizing', 'percent': '20%'})
            
            result = await client.chat(
                model=model,
                messages=[{"role": "user", "content": user_prompt}],
                system=system_prompt,
                temperature=0.3,
            )
            
            if progress_callback:
                await progress_callback({'stage': 'summarizing', 'percent': '100%'})
            
            summary = result.get('message', {}).get('content', '')
            
            return {
                "success": True,
                "summary": summary,
                "model_used": model,
                "transcript_length": len(transcript),
            }
            
        except Exception as e:
            logger.error(f"Error summarizing transcript: {e}")
            return {"success": False, "error": str(e)}
    
    async def process_video(
        self,
        url: str,
        user_id: str,
        options: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Full video processing pipeline with streaming progress updates.
        
        Yields progress events:
        - {"stage": "info", "data": {...}}
        - {"stage": "downloading", "percent": "50%", ...}
        - {"stage": "extracting_audio", "percent": "100%"}
        - {"stage": "transcribing", "percent": "80%"}
        - {"stage": "summarizing", "percent": "100%"}
        - {"stage": "complete", "result": {...}}
        - {"stage": "error", "error": "..."}
        """
        options = options or {}
        job_id = str(uuid.uuid4())
        
        try:
            # 1. Get video info
            yield {"stage": "info", "status": "Getting video information..."}
            info_result = await self.get_video_info(url)
            if not info_result.get("success"):
                yield {"stage": "error", "error": info_result.get("error", "Failed to get video info")}
                return
            
            yield {"stage": "info", "data": info_result, "status": f"Found: {info_result.get('title', 'Unknown')}"}
            
            # 2. Download video
            yield {"stage": "downloading", "percent": "0%", "status": "Starting download..."}
            
            async def download_progress(p):
                pass  # We'll handle progress differently
            
            download_result = await self.download_video(url, user_id)
            if not download_result.get("success"):
                yield {"stage": "error", "error": download_result.get("error", "Download failed")}
                return
            
            yield {"stage": "downloading", "percent": "100%", "status": "Download complete"}
            
            video_path = download_result.get("video_path")
            
            # 3. Extract audio
            yield {"stage": "extracting_audio", "percent": "0%", "status": "Extracting audio..."}
            
            audio_result = await self.extract_audio(video_path)
            if not audio_result.get("success"):
                yield {"stage": "error", "error": audio_result.get("error", "Audio extraction failed")}
                return
            
            yield {"stage": "extracting_audio", "percent": "100%", "status": "Audio extracted"}
            
            audio_path = audio_result.get("audio_path")
            
            # 4. Transcribe
            yield {"stage": "transcribing", "percent": "0%", "status": "Transcribing audio..."}
            
            transcribe_result = await self.transcribe_audio(
                audio_path,
                language=options.get("language")
            )
            if not transcribe_result.get("success"):
                yield {"stage": "error", "error": transcribe_result.get("error", "Transcription failed")}
                return
            
            transcript = transcribe_result.get("transcript", "")
            
            # If VAD filtered everything out, retry without VAD
            if not transcript.strip():
                logger.info("VAD filtered all audio — retrying without VAD filter")
                yield {"stage": "transcribing", "percent": "50%", "status": "Retrying without voice filter..."}
                transcribe_result = await self.transcribe_audio(
                    audio_path,
                    language=options.get("language"),
                    vad_filter=False
                )
                if transcribe_result.get("success"):
                    transcript = transcribe_result.get("transcript", "")
            
            yield {"stage": "transcribing", "percent": "100%", "status": "Transcription complete"}
            
            # 5. Summarize (if requested and transcript is not empty)
            summary = None
            if options.get("summarize", True):
                if transcript and transcript.strip():
                    yield {"stage": "summarizing", "percent": "0%", "status": "Generating summary..."}
                    
                    summary_result = await self.summarize_transcript(
                        transcript,
                        title=info_result.get("title", ""),
                        model=options.get("model")
                    )
                    
                    if summary_result.get("success"):
                        summary = summary_result.get("summary", "")
                        yield {"stage": "summarizing", "percent": "100%", "status": "Summary complete"}
                    else:
                        yield {"stage": "summarizing", "percent": "100%", "status": "Summary failed (transcript still available)"}
                else:
                    yield {"stage": "summarizing", "percent": "100%", "status": "Transcript empty — skipped summary"}
            
            # 6. Save to database
            doc = {
                "user_id": ObjectId(user_id),
                "job_id": job_id,
                "url": url,
                "video_id": info_result.get("video_id"),
                "title": info_result.get("title"),
                "channel": info_result.get("channel"),
                "duration": info_result.get("duration"),
                "thumbnail": info_result.get("thumbnail"),
                "video_path": video_path,
                "audio_path": audio_path,
                "transcript": transcript,
                "transcript_language": transcribe_result.get("language"),
                "summary": summary,
                "created_at": datetime.utcnow(),
                "status": "complete"
            }
            
            result = await database.video_jobs.insert_one(doc)
            doc["_id"] = str(result.inserted_id)
            
            # Clean up video file (keep audio for potential re-processing)
            if options.get("delete_video", True):
                try:
                    os.unlink(video_path)
                except Exception:
                    pass
            
            # 7. Return complete result
            yield {
                "stage": "complete",
                "status": "Processing complete!",
                "result": {
                    "id": doc["_id"],
                    "job_id": job_id,
                    "title": info_result.get("title"),
                    "duration": info_result.get("duration"),
                    "thumbnail": info_result.get("thumbnail"),
                    "transcript": transcript,
                    "transcript_language": transcribe_result.get("language"),
                    "summary": summary,
                }
            }
            
        except Exception as e:
            logger.error(f"Video processing error: {e}")
            yield {"stage": "error", "error": str(e)}
    
    async def get_job(self, job_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """Get a video processing job by ID"""
        doc = await database.video_jobs.find_one({
            "_id": ObjectId(job_id),
            "user_id": ObjectId(user_id)
        })
        if doc:
            doc["_id"] = str(doc["_id"])
            doc["user_id"] = str(doc["user_id"])
        return doc
    
    async def list_jobs(self, user_id: str, limit: int = 20) -> list:
        """List video processing jobs for a user"""
        cursor = database.video_jobs.find(
            {"user_id": ObjectId(user_id)}
        ).sort("created_at", -1).limit(limit)
        
        jobs = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            doc["user_id"] = str(doc["user_id"])
            jobs.append(doc)
        return jobs
    
    async def delete_job(self, job_id: str, user_id: str) -> bool:
        """Delete a video processing job"""
        doc = await database.video_jobs.find_one({
            "_id": ObjectId(job_id),
            "user_id": ObjectId(user_id)
        })
        
        if not doc:
            return False
        
        # Delete files
        for path_key in ["video_path", "audio_path"]:
            if doc.get(path_key):
                try:
                    os.unlink(doc[path_key])
                except Exception:
                    pass
        
        # Delete from database
        await database.video_jobs.delete_one({"_id": ObjectId(job_id)})
        return True

    async def ask_question(
        self,
        question: str,
        transcript: str,
        summary: str = "",
        title: str = "",
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Answer a question about a video based on its transcript and summary."""
        try:
            from app.services.ollama_client import get_ollama_client

            client = get_ollama_client()
            use_model = model or getattr(settings, 'default_chat_model', 'llama3.2')

            context_parts = []
            if title:
                context_parts.append(f"Video Title: {title}")
            if summary:
                context_parts.append(f"Summary:\n{summary}")
            if transcript:
                max_transcript = 12000
                t = transcript if len(transcript) <= max_transcript else transcript[:max_transcript] + "\n... [transcript truncated]"
                context_parts.append(f"Full Transcript:\n{t}")

            context = "\n\n".join(context_parts)

            system_prompt = """Answer questions about the video using only the provided content. If the answer isn't in there, say so.

Be direct and conversational. No markdown, no bullet points, no headers, no bold/italic, no formatting. Just plain sentences and paragraphs. Add detail where it helps, skip it where it doesn't."""

            user_prompt = f"""{context}

Question: {question}"""

            result = await client.chat(
                model=use_model,
                messages=[{"role": "user", "content": user_prompt}],
                system=system_prompt,
                temperature=0.3,
            )

            answer = result.get("message", {}).get("content", "").strip()
            if not answer:
                return {"success": False, "error": "No answer generated"}

            return {"success": True, "answer": answer}

        except Exception as e:
            logger.error(f"Error answering question: {e}")
            return {"success": False, "error": str(e)}


# Singleton
_processor: Optional[VideoProcessor] = None


def get_video_processor() -> VideoProcessor:
    """Get singleton VideoProcessor instance"""
    global _processor
    if _processor is None:
        _processor = VideoProcessor()
    return _processor
