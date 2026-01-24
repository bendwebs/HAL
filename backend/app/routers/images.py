"""Image Generation Router - Serves generated images and provides SD status"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from pathlib import Path
from typing import Dict, Any, Optional, List

from app.auth import get_current_user
from app.services.stable_diffusion_service import get_stable_diffusion_service
from app.services.sd_process_manager import get_sd_process_manager
from app.config import settings

router = APIRouter(prefix="/images", tags=["Images"])


class GenerateImageRequest(BaseModel):
    """Request model for image generation"""
    prompt: str = Field(..., description="The image generation prompt")
    negative_prompt: str = Field(default="", description="Things to avoid in the image")
    width: int = Field(default=512, ge=256, le=2048, description="Image width")
    height: int = Field(default=512, ge=256, le=2048, description="Image height")
    steps: int = Field(default=20, ge=1, le=150, description="Number of sampling steps")
    cfg_scale: float = Field(default=7.0, ge=1.0, le=30.0, description="CFG scale")
    sampler_name: str = Field(default="DPM++ 2M Karras", description="Sampler to use")
    seed: int = Field(default=-1, description="Random seed (-1 for random)")
    batch_size: int = Field(default=1, ge=1, le=4, description="Number of images to generate")


class GenerateImageResponse(BaseModel):
    """Response model for image generation"""
    success: bool
    images: Optional[List[Dict[str, Any]]] = None
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    seed: Optional[int] = None
    steps: Optional[int] = None
    cfg_scale: Optional[float] = None
    sampler: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    generation_time_ms: Optional[int] = None
    error: Optional[str] = None


@router.post("/generate", response_model=GenerateImageResponse)
async def generate_image(
    request: GenerateImageRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Generate an image using Stable Diffusion"""
    user_id = str(current_user["_id"])
    sd = get_stable_diffusion_service()
    
    result = await sd.generate_image(
        user_id=user_id,
        prompt=request.prompt,
        negative_prompt=request.negative_prompt,
        width=request.width,
        height=request.height,
        steps=request.steps,
        cfg_scale=request.cfg_scale,
        sampler_name=request.sampler_name,
        seed=request.seed,
        batch_size=request.batch_size
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Image generation failed"))
    
    # Remove base64 from response to keep it smaller (images accessible via URL)
    if result.get("images"):
        for img in result["images"]:
            img.pop("base64", None)
            img.pop("filepath", None)
    
    return result


@router.get("/generated/{user_id}/{filename}")
async def get_generated_image(
    user_id: str,
    filename: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Serve a generated image file (user can only access their own images)"""
    # Validate user can only access their own images
    if str(current_user["_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Access denied - you can only view your own generated images")
    
    # Validate filename to prevent path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    base_dir = Path(getattr(settings, 'data_dir', './data')) / 'generated_images'
    filepath = base_dir / user_id / filename
    
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    
    return FileResponse(
        filepath,
        media_type="image/png",
        filename=filename
    )


@router.get("/my-images")
async def list_my_images(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """List all generated images for the current user"""
    user_id = str(current_user["_id"])
    base_dir = Path(getattr(settings, 'data_dir', './data')) / 'generated_images' / user_id
    
    if not base_dir.exists():
        return {"images": []}
    
    images = []
    for filepath in sorted(base_dir.glob("*.png"), key=lambda p: p.stat().st_mtime, reverse=True):
        images.append({
            "filename": filepath.name,
            "url": f"/api/images/generated/{user_id}/{filepath.name}",
            "created_at": filepath.stat().st_mtime
        })
    
    return {"images": images}


@router.delete("/generated/{filename}")
async def delete_generated_image(
    filename: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Delete a generated image (user can only delete their own)"""
    user_id = str(current_user["_id"])
    
    # Validate filename
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    base_dir = Path(getattr(settings, 'data_dir', './data')) / 'generated_images'
    filepath = base_dir / user_id / filename
    
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    
    filepath.unlink()
    return {"message": "Image deleted", "filename": filename}


@router.get("/sd/status")
async def stable_diffusion_status(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Check Stable Diffusion API and process status"""
    sd = get_stable_diffusion_service()
    manager = get_sd_process_manager()
    
    available = await sd.check_availability()
    process_status = await manager.get_status()
    
    result = {
        "available": available,
        "api_url": sd.api_url,
        "message": "Stable Diffusion API is ready" if available else "Stable Diffusion API is not available",
        "auto_start_configured": process_status["configured"],
        "sd_path": process_status["sd_path"],
        "subprocess_running": process_status["subprocess_running"],
        "starting": process_status["starting"]
    }
    
    if available:
        models_result = await sd.get_models()
        if models_result.get("success"):
            result["models"] = models_result["models"]
        
        samplers_result = await sd.get_samplers()
        if samplers_result.get("success"):
            result["samplers"] = samplers_result["samplers"]
    
    return result


@router.post("/sd/start")
async def start_stable_diffusion(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Start Stable Diffusion server (if path configured)"""
    manager = get_sd_process_manager()
    return await manager.start()


@router.post("/sd/stop")
async def stop_stable_diffusion(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Stop Stable Diffusion server subprocess"""
    manager = get_sd_process_manager()
    return await manager.stop()


@router.get("/sd/models")
async def list_sd_models(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """List available Stable Diffusion models"""
    sd = get_stable_diffusion_service()
    return await sd.get_models()


@router.get("/sd/samplers")
async def list_sd_samplers(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """List available samplers"""
    sd = get_stable_diffusion_service()
    return await sd.get_samplers()
