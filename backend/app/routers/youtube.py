"""YouTube & Video Processing Router - Handles YouTube video processing pipeline"""

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import json
import asyncio

from app.auth import get_current_user
from app.services.youtube_service import get_youtube_service
from app.services.video_processor import get_video_processor
from app.database import database

router = APIRouter(prefix="/youtube", tags=["YouTube"])


# ============== Video Selection (existing) ==============

class VideoSelectionRequest(BaseModel):
    """Request to record a user's video selection"""
    search_id: str
    video_id: str


class VideoSelectionResponse(BaseModel):
    """Response after recording selection"""
    success: bool
    message: str


@router.post("/select", response_model=VideoSelectionResponse)
async def record_video_selection(
    request: VideoSelectionRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Record which video the user selected from search results."""
    youtube = get_youtube_service()
    
    result = await youtube.record_user_selection(
        search_id=request.search_id,
        selected_video_id=request.video_id,
        user_id=current_user["_id"]
    )
    
    if result.get("success"):
        return VideoSelectionResponse(
            success=True,
            message="Selection recorded for training"
        )
    else:
        raise HTTPException(
            status_code=400,
            detail=result.get("error", "Failed to record selection")
        )


@router.get("/training-data")
async def get_training_data(
    limit: int = 100,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get YouTube search/selection training data."""
    youtube = get_youtube_service()
    data = await youtube.get_training_data(limit=limit)
    
    total = len(data)
    matched = sum(1 for d in data if d.get("selection_matched", False))
    
    return {
        "total_selections": total,
        "auto_select_accuracy": matched / total if total > 0 else 0,
        "data": data
    }


@router.get("/status")
async def youtube_status():
    """Check if YouTube API is configured and available"""
    youtube = get_youtube_service()
    return {
        "available": youtube.is_available,
        "message": "YouTube API is configured" if youtube.is_available else "YouTube API key not configured"
    }


# ============== Video Processing ==============

class VideoInfoRequest(BaseModel):
    """Request for video info"""
    url: str


class ProcessVideoRequest(BaseModel):
    """Request to process a video"""
    url: str
    summarize: bool = True
    language: Optional[str] = None
    model: Optional[str] = None
    delete_video: bool = True


@router.post("/info")
async def get_video_info(
    request: VideoInfoRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get video metadata without downloading"""
    processor = get_video_processor()
    result = await processor.get_video_info(request.url)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to get video info"))
    
    return result


@router.post("/process")
async def process_video_stream(
    request: ProcessVideoRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Process a YouTube video - download, extract audio, transcribe, and summarize.
    Returns Server-Sent Events with progress updates.
    """
    processor = get_video_processor()
    
    async def generate_events():
        try:
            async for event in processor.process_video(
                url=request.url,
                user_id=current_user["_id"],
                options={
                    "summarize": request.summarize,
                    "language": request.language,
                    "model": request.model,
                    "delete_video": request.delete_video,
                }
            ):
                yield f"data: {json.dumps(event)}\n\n"
                await asyncio.sleep(0.01)  # Small delay to ensure proper streaming
        except Exception as e:
            yield f"data: {json.dumps({'stage': 'error', 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/jobs")
async def list_video_jobs(
    limit: int = Query(default=20, le=100),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """List processed videos for the current user"""
    processor = get_video_processor()
    jobs = await processor.list_jobs(current_user["_id"], limit=limit)
    return {"jobs": jobs, "total": len(jobs)}


@router.get("/jobs/{job_id}")
async def get_video_job(
    job_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get a specific video processing job"""
    processor = get_video_processor()
    job = await processor.get_job(job_id, current_user["_id"])
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return job


@router.delete("/jobs/{job_id}")
async def delete_video_job(
    job_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Delete a video processing job and its files"""
    processor = get_video_processor()
    success = await processor.delete_job(job_id, current_user["_id"])
    
    if not success:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return {"success": True, "message": "Job deleted"}


# ============== Regenerate Summary ==============

class RegenerateSummaryRequest(BaseModel):
    """Request to regenerate a video summary"""
    model: Optional[str] = None


@router.post("/jobs/{job_id}/regenerate-summary")
async def regenerate_summary(
    job_id: str,
    request: RegenerateSummaryRequest = RegenerateSummaryRequest(),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Regenerate the summary for an existing video job using its stored transcript."""
    processor = get_video_processor()
    job = await processor.get_job(job_id, current_user["_id"])

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    transcript = job.get("transcript", "")
    if not transcript or not transcript.strip():
        raise HTTPException(
            status_code=400,
            detail="Transcript is empty for this job. Try re-processing the video to generate a new transcript."
        )

    result = await processor.summarize_transcript(
        transcript=transcript,
        title=job.get("title", ""),
        model=request.model,
    )

    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to generate summary"))

    # Update the job in the database
    from bson import ObjectId
    await database.video_jobs.update_one(
        {"_id": ObjectId(job_id), "user_id": ObjectId(current_user["_id"])},
        {"$set": {"summary": result["summary"]}}
    )

    return {
        "success": True,
        "summary": result["summary"],
        "model_used": result.get("model_used"),
    }


class ReprocessRequest(BaseModel):
    """Request to reprocess parts of a video job"""
    mode: str = "auto"  # "auto" | "retranscribe" | "full"
    disable_vad: bool = False


@router.post("/jobs/{job_id}/reprocess")
async def reprocess_job(
    job_id: str,
    request: ReprocessRequest = ReprocessRequest(),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Smart reprocess: only re-run the stages that are needed.

    Modes:
      - auto: detect what's missing/broken and fix it
      - retranscribe: re-transcribe from existing audio (+ resummarize)
      - full: re-download everything from scratch
    """
    from bson import ObjectId
    from pathlib import Path

    processor = get_video_processor()
    job = await processor.get_job(job_id, current_user["_id"])

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    url = job.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="No URL stored for this job")

    audio_path = job.get("audio_path")
    has_audio = audio_path and Path(audio_path).exists()
    has_transcript = bool(job.get("transcript", "").strip())

    # Determine effective mode
    mode = request.mode
    if mode == "auto":
        if has_audio and not has_transcript:
            mode = "retranscribe"
        elif has_audio and has_transcript and not job.get("summary"):
            mode = "resummarize"
        else:
            mode = "full"

    if mode == "resummarize":
        # Just regenerate summary — no streaming needed, redirect to the other endpoint
        result = await processor.summarize_transcript(
            transcript=job["transcript"],
            title=job.get("title", ""),
        )
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Summarization failed"))
        await database.video_jobs.update_one(
            {"_id": ObjectId(job_id), "user_id": ObjectId(current_user["_id"])},
            {"$set": {"summary": result["summary"]}}
        )
        # Return as a single SSE complete event for the frontend to consume
        async def single_event():
            updated_job = await processor.get_job(job_id, current_user["_id"])
            yield f"data: {json.dumps({'stage': 'complete', 'status': 'Summary regenerated', 'result': {'id': job_id, 'job_id': job.get('job_id', ''), 'title': job.get('title'), 'duration': job.get('duration'), 'thumbnail': job.get('thumbnail'), 'transcript': job.get('transcript'), 'transcript_language': job.get('transcript_language'), 'summary': result['summary']}})}\n\n"
        return StreamingResponse(single_event(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})

    if mode == "retranscribe":
        async def retranscribe_events():
            try:
                yield f"data: {json.dumps({'stage': 'info', 'status': 'Using existing audio file', 'percent': '100%', 'data': {'title': job.get('title'), 'channel': job.get('channel'), 'duration': job.get('duration'), 'thumbnail': job.get('thumbnail')}})}\n\n"
                await asyncio.sleep(0.05)

                yield f"data: {json.dumps({'stage': 'transcribing', 'status': 'Re-transcribing audio' + (' (VAD disabled)' if request.disable_vad else '') + '...', 'percent': '0%'})}\n\n"
                await asyncio.sleep(0.05)

                transcribe_result = await processor.transcribe_audio(
                    audio_path, language=job.get("transcript_language"),
                    vad_filter=not request.disable_vad
                )
                if not transcribe_result.get("success"):
                    yield f"data: {json.dumps({'stage': 'error', 'error': transcribe_result.get('error', 'Transcription failed')})}\n\n"
                    return

                transcript = transcribe_result.get("transcript", "")
                yield f"data: {json.dumps({'stage': 'transcribing', 'status': 'Transcription complete', 'percent': '100%'})}\n\n"
                await asyncio.sleep(0.05)

                # Summarize
                summary = None
                if transcript and transcript.strip():
                    yield f"data: {json.dumps({'stage': 'summarizing', 'status': 'Generating summary...', 'percent': '0%'})}\n\n"
                    summary_result = await processor.summarize_transcript(
                        transcript, title=job.get("title", "")
                    )
                    if summary_result.get("success"):
                        summary = summary_result.get("summary", "")
                        yield f"data: {json.dumps({'stage': 'summarizing', 'status': 'Summary complete', 'percent': '100%'})}\n\n"
                    else:
                        yield f"data: {json.dumps({'stage': 'summarizing', 'status': 'Summary failed', 'percent': '100%'})}\n\n"
                else:
                    yield f"data: {json.dumps({'stage': 'summarizing', 'status': 'Transcript empty — skipped summary', 'percent': '100%'})}\n\n"

                # Update existing job in place
                await database.video_jobs.update_one(
                    {"_id": ObjectId(job_id), "user_id": ObjectId(current_user["_id"])},
                    {"$set": {
                        "transcript": transcript,
                        "transcript_language": transcribe_result.get("language"),
                        "summary": summary,
                    }}
                )

                yield f"data: {json.dumps({'stage': 'complete', 'status': 'Reprocess complete!', 'result': {'id': job_id, 'job_id': job.get('job_id', ''), 'title': job.get('title'), 'duration': job.get('duration'), 'thumbnail': job.get('thumbnail'), 'transcript': transcript, 'transcript_language': transcribe_result.get('language'), 'summary': summary}})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'stage': 'error', 'error': str(e)})}\n\n"

        return StreamingResponse(retranscribe_events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})

    # mode == "full": re-download everything
    async def full_reprocess_events():
        try:
            async for event in processor.process_video(
                url=url,
                user_id=current_user["_id"],
                options={"summarize": True, "delete_video": True}
            ):
                if event.get("stage") == "complete" and event.get("result"):
                    new_id = event["result"].get("id")
                    if new_id and new_id != job_id:
                        try:
                            await database.video_jobs.delete_one({
                                "_id": ObjectId(job_id),
                                "user_id": ObjectId(current_user["_id"])
                            })
                        except Exception:
                            pass
                yield f"data: {json.dumps(event)}\n\n"
                await asyncio.sleep(0.01)
        except Exception as e:
            yield f"data: {json.dumps({'stage': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(full_reprocess_events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})


# ============== Video Q&A ==============

class VideoQuestionRequest(BaseModel):
    """Request to ask a question about a video"""
    question: str
    transcript: str
    summary: str = ""
    title: str = ""


@router.post("/ask")
async def ask_video_question(
    request: VideoQuestionRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Ask a question about a processed video using its transcript and summary."""
    processor = get_video_processor()
    result = await processor.ask_question(
        question=request.question,
        transcript=request.transcript,
        summary=request.summary,
        title=request.title,
    )

    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to answer question"))

    return {"answer": result["answer"]}


# ============== Quick Summarize (no storage) ==============

class QuickSummarizeRequest(BaseModel):
    """Request for quick video summarization"""
    url: str
    language: Optional[str] = None
    model: Optional[str] = None


@router.post("/quick-summarize")
async def quick_summarize_video(
    request: QuickSummarizeRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Quick video summarization - streams progress but doesn't store permanently.
    Good for one-off summaries.
    """
    processor = get_video_processor()
    
    async def generate_events():
        try:
            async for event in processor.process_video(
                url=request.url,
                user_id=current_user["_id"],
                options={
                    "summarize": True,
                    "language": request.language,
                    "model": request.model,
                    "delete_video": True,
                }
            ):
                yield f"data: {json.dumps(event)}\n\n"
                await asyncio.sleep(0.01)
        except Exception as e:
            yield f"data: {json.dumps({'stage': 'error', 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
