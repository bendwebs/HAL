"""YouTube Router - Handles YouTube video selection and training data"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

from app.auth import get_current_user
from app.services.youtube_service import get_youtube_service

router = APIRouter(prefix="/youtube", tags=["YouTube"])


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
    """
    Record which video the user selected from search results.
    This data is used to improve confidence scoring over time.
    """
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
    """
    Get YouTube search/selection training data.
    Shows searches where users made selections, for analysis.
    """
    youtube = get_youtube_service()
    data = await youtube.get_training_data(limit=limit)
    
    # Calculate some stats
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
