"""Stable Diffusion Service - Generate images using local Stable Diffusion API"""

from typing import Dict, Any, Optional
import logging
import httpx
import base64
import os
from datetime import datetime
from pathlib import Path
import uuid

from app.config import settings

logger = logging.getLogger(__name__)


class StableDiffusionService:
    """Service for generating images using local Stable Diffusion (Automatic1111 API)"""
    
    def __init__(self):
        self.api_url = getattr(settings, 'sd_api_url', 'http://127.0.0.1:7860')
        self.output_dir = Path(getattr(settings, 'data_dir', './data')) / 'generated_images'
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._available = None
    
    @property
    def is_available(self) -> bool:
        """Check if Stable Diffusion API is available (cached)"""
        return self._available if self._available is not None else False
    
    async def check_availability(self) -> bool:
        """Check if Stable Diffusion API is reachable"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.api_url}/sdapi/v1/options")
                self._available = response.status_code == 200
                if self._available:
                    logger.info(f"Stable Diffusion API available at {self.api_url}")
                return self._available
        except Exception as e:
            logger.warning(f"Stable Diffusion API not available: {e}")
            self._available = False
            return False
    
    async def get_models(self) -> Dict[str, Any]:
        """Get list of available SD models/checkpoints"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.api_url}/sdapi/v1/sd-models")
                response.raise_for_status()
                models = response.json()
                return {
                    "success": True,
                    "models": [m.get("title", m.get("model_name", "unknown")) for m in models]
                }
        except Exception as e:
            logger.error(f"Failed to get SD models: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_samplers(self) -> Dict[str, Any]:
        """Get list of available samplers"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.api_url}/sdapi/v1/samplers")
                response.raise_for_status()
                samplers = response.json()
                return {
                    "success": True,
                    "samplers": [s.get("name", "unknown") for s in samplers]
                }
        except Exception as e:
            logger.error(f"Failed to get samplers: {e}")
            return {"success": False, "error": str(e)}
    
    async def generate_image(
        self,
        prompt: str,
        negative_prompt: str = "",
        width: int = 512,
        height: int = 512,
        steps: int = 20,
        cfg_scale: float = 7.0,
        sampler_name: str = "DPM++ 2M Karras",
        seed: int = -1,
        batch_size: int = 1
    ) -> Dict[str, Any]:
        """
        Generate an image using Stable Diffusion.
        
        Args:
            prompt: The image generation prompt
            negative_prompt: Things to avoid in the image
            width: Image width (default 512)
            height: Image height (default 512)
            steps: Number of sampling steps (default 20)
            cfg_scale: Classifier-free guidance scale (default 7.0)
            sampler_name: Sampler to use (default "DPM++ 2M Karras")
            seed: Random seed (-1 for random)
            batch_size: Number of images to generate (default 1)
            
        Returns:
            Dict with success status, image data, and metadata
        """
        # Check availability first
        if not await self.check_availability():
            return {
                "success": False,
                "error": "Stable Diffusion API is not available. Make sure Automatic1111 is running with --api flag."
            }
        
        payload = {
            "prompt": prompt,
            "negative_prompt": negative_prompt or "blurry, bad quality, distorted, ugly, deformed",
            "width": width,
            "height": height,
            "steps": steps,
            "cfg_scale": cfg_scale,
            "sampler_name": sampler_name,
            "seed": seed,
            "batch_size": batch_size
        }
        
        logger.info(f"Generating image with prompt: {prompt[:100]}...")
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.api_url}/sdapi/v1/txt2img",
                    json=payload
                )
                response.raise_for_status()
                result = response.json()
                
                images = result.get("images", [])
                if not images:
                    return {
                        "success": False,
                        "error": "No images generated"
                    }
                
                # Save images and prepare response
                saved_images = []
                for i, img_base64 in enumerate(images):
                    # Generate unique filename
                    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                    unique_id = str(uuid.uuid4())[:8]
                    filename = f"sd_{timestamp}_{unique_id}.png"
                    filepath = self.output_dir / filename
                    
                    # Decode and save
                    img_data = base64.b64decode(img_base64)
                    with open(filepath, "wb") as f:
                        f.write(img_data)
                    
                    saved_images.append({
                        "filename": filename,
                        "filepath": str(filepath),
                        "base64": img_base64,
                        "url": f"/api/images/generated/{filename}"
                    })
                    
                    logger.info(f"Saved generated image: {filename}")
                
                # Get generation info
                info = result.get("info", "{}")
                if isinstance(info, str):
                    import json
                    try:
                        info = json.loads(info)
                    except:
                        info = {}
                
                return {
                    "success": True,
                    "type": "generated_image",
                    "images": saved_images,
                    "prompt": prompt,
                    "negative_prompt": negative_prompt,
                    "seed": info.get("seed", seed),
                    "steps": steps,
                    "cfg_scale": cfg_scale,
                    "sampler": sampler_name,
                    "width": width,
                    "height": height,
                    "generation_time_ms": int(info.get("generation_time", 0) * 1000) if info.get("generation_time") else None
                }
                
        except httpx.TimeoutException:
            logger.error("Image generation timed out")
            return {
                "success": False,
                "error": "Image generation timed out. Try reducing steps or image size."
            }
        except Exception as e:
            logger.error(f"Image generation failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def img2img(
        self,
        prompt: str,
        init_image_base64: str,
        negative_prompt: str = "",
        denoising_strength: float = 0.75,
        width: int = 512,
        height: int = 512,
        steps: int = 20,
        cfg_scale: float = 7.0,
        sampler_name: str = "DPM++ 2M Karras",
        seed: int = -1
    ) -> Dict[str, Any]:
        """
        Generate an image based on an input image (img2img).
        
        Args:
            prompt: The image generation prompt
            init_image_base64: Base64 encoded input image
            negative_prompt: Things to avoid
            denoising_strength: How much to change the original (0.0-1.0)
            ... other params same as txt2img
            
        Returns:
            Dict with success status, image data, and metadata
        """
        if not await self.check_availability():
            return {
                "success": False,
                "error": "Stable Diffusion API is not available."
            }
        
        payload = {
            "prompt": prompt,
            "negative_prompt": negative_prompt or "blurry, bad quality, distorted",
            "init_images": [init_image_base64],
            "denoising_strength": denoising_strength,
            "width": width,
            "height": height,
            "steps": steps,
            "cfg_scale": cfg_scale,
            "sampler_name": sampler_name,
            "seed": seed
        }
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.api_url}/sdapi/v1/img2img",
                    json=payload
                )
                response.raise_for_status()
                result = response.json()
                
                images = result.get("images", [])
                if not images:
                    return {"success": False, "error": "No images generated"}
                
                # Save the first generated image
                img_base64 = images[0]
                timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                unique_id = str(uuid.uuid4())[:8]
                filename = f"sd_i2i_{timestamp}_{unique_id}.png"
                filepath = self.output_dir / filename
                
                img_data = base64.b64decode(img_base64)
                with open(filepath, "wb") as f:
                    f.write(img_data)
                
                return {
                    "success": True,
                    "type": "generated_image",
                    "images": [{
                        "filename": filename,
                        "filepath": str(filepath),
                        "base64": img_base64,
                        "url": f"/api/images/generated/{filename}"
                    }],
                    "prompt": prompt,
                    "denoising_strength": denoising_strength
                }
                
        except Exception as e:
            logger.error(f"img2img generation failed: {e}")
            return {"success": False, "error": str(e)}


# Singleton
_service: Optional[StableDiffusionService] = None


def get_stable_diffusion_service() -> StableDiffusionService:
    """Get singleton StableDiffusionService instance"""
    global _service
    if _service is None:
        _service = StableDiffusionService()
    return _service
