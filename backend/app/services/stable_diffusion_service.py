"""Stable Diffusion Service - Generate images using local Stable Diffusion API"""

from typing import Dict, Any, Optional
import logging
import subprocess
import json
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
        self.base_output_dir = Path(getattr(settings, 'data_dir', './data')) / 'generated_images'
        self.base_output_dir.mkdir(parents=True, exist_ok=True)
        self._available = None
    
    def _get_user_output_dir(self, user_id: str) -> Path:
        """Get user-specific output directory"""
        user_dir = self.base_output_dir / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir
    
    @property
    def is_available(self) -> bool:
        """Check if Stable Diffusion API is available (cached)"""
        return self._available if self._available is not None else False
    
    def _curl_get(self, url: str, timeout: int = 10) -> Optional[dict]:
        """Make a GET request using curl subprocess"""
        try:
            result = subprocess.run(
                ['curl', '-s', '-X', 'GET', url, '--max-time', str(timeout)],
                capture_output=True,
                timeout=timeout + 5
            )
            if result.returncode == 0 and result.stdout:
                return json.loads(result.stdout.decode('utf-8'))
            return None
        except Exception:
            return None
    
    async def check_availability(self) -> bool:
        """Check if Stable Diffusion API is reachable"""
        try:
            result = self._curl_get(f"{self.api_url}/sdapi/v1/options")
            self._available = result is not None
            if self._available:
                logger.debug(f"Stable Diffusion API available at {self.api_url}")
            return self._available
        except Exception as e:
            logger.warning(f"Stable Diffusion API not available: {e}")
            self._available = False
            return False
    
    async def get_progress(self) -> Dict[str, Any]:
        """Check current generation progress"""
        try:
            result = self._curl_get(f"{self.api_url}/sdapi/v1/progress", timeout=5)
            if result:
                return result
            return {"state": {"job_count": 0}}
        except Exception as e:
            logger.warning(f"Failed to get progress: {e}")
            return {"state": {"job_count": 0}}
    
    async def ensure_running(self) -> Dict[str, Any]:
        """Ensure SD is running, starting it if necessary"""
        if await self.check_availability():
            return {"success": True, "message": "Stable Diffusion is ready"}
        
        from app.services.sd_process_manager import get_sd_process_manager
        manager = get_sd_process_manager()
        
        if not manager.is_configured:
            return {
                "success": False,
                "error": "Stable Diffusion path not configured. Set SD_WEBUI_PATH in .env to enable auto-start."
            }
        
        logger.info("Starting Stable Diffusion automatically...")
        result = await manager.start()
        
        if result.get("success"):
            self._available = True
        
        return result
    
    async def get_models(self) -> Dict[str, Any]:
        """Get list of available SD models/checkpoints"""
        try:
            result = self._curl_get(f"{self.api_url}/sdapi/v1/sd-models")
            if result:
                return {
                    "success": True,
                    "models": [m.get("title", m.get("model_name", "unknown")) for m in result]
                }
            return {"success": False, "error": "Failed to get models"}
        except Exception as e:
            logger.error(f"Failed to get SD models: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_samplers(self) -> Dict[str, Any]:
        """Get list of available samplers"""
        try:
            result = self._curl_get(f"{self.api_url}/sdapi/v1/samplers")
            if result:
                return {
                    "success": True,
                    "samplers": [s.get("name", "unknown") for s in result]
                }
            return {"success": False, "error": "Failed to get samplers"}
        except Exception as e:
            logger.error(f"Failed to get samplers: {e}")
            return {"success": False, "error": str(e)}
    
    async def generate_image(
        self,
        user_id: str,
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
            user_id: The user's ID (for organizing images)
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
        # Ensure SD is running (will auto-start if configured)
        ensure_result = await self.ensure_running()
        if not ensure_result.get("success"):
            return ensure_result
        
        # Get user-specific output directory
        output_dir = self._get_user_output_dir(user_id)
        
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
        
        logger.info(f"Generating image for user {user_id} with prompt: {prompt[:100]}...")
        
        try:
            import tempfile
            import os as os_module
            import asyncio
            from concurrent.futures import ThreadPoolExecutor
            
            # Write payload to temp file to avoid command line escaping issues
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                json.dump(payload, f)
                payload_file = f.name
            
            def run_curl():
                """Run curl in a separate thread to avoid blocking async loop"""
                try:
                    result_proc = subprocess.run(
                        [
                            'curl', '-s', '-X', 'POST',
                            f'{self.api_url}/sdapi/v1/txt2img',
                            '-H', 'Content-Type: application/json',
                            '-d', f'@{payload_file}',
                            '--max-time', '300'
                        ],
                        capture_output=True,
                        timeout=310
                    )
                    return result_proc
                finally:
                    # Clean up temp file
                    try:
                        os_module.unlink(payload_file)
                    except:
                        pass
            
            logger.info(f"Sending txt2img request via curl to {self.api_url}/sdapi/v1/txt2img...")
            
            # Run curl in thread pool to not block the async event loop
            loop = asyncio.get_event_loop()
            with ThreadPoolExecutor(max_workers=1) as executor:
                result_proc = await loop.run_in_executor(executor, run_curl)
            
            if result_proc.returncode != 0:
                error_msg = result_proc.stderr.decode('utf-8', errors='replace') if result_proc.stderr else f"curl failed with code {result_proc.returncode}"
                logger.error(f"curl failed: {error_msg}")
                return {"success": False, "error": error_msg}
            
            if not result_proc.stdout:
                logger.error("curl returned empty response")
                return {"success": False, "error": "Empty response from SD"}
            
            result = json.loads(result_proc.stdout.decode('utf-8'))
            logger.info(f"txt2img response received successfully")
            
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
                filepath = output_dir / filename
                
                # Decode and save
                img_data = base64.b64decode(img_base64)
                with open(filepath, "wb") as f:
                    f.write(img_data)
                
                saved_images.append({
                    "filename": filename,
                    "filepath": str(filepath),
                    "base64": img_base64,
                    "url": f"/api/images/generated/{user_id}/{filename}"
                })
                
                logger.info(f"Saved generated image: {user_id}/{filename}")
            
            # Get generation info
            info = result.get("info", "{}")
            if isinstance(info, str):
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
                
        except subprocess.TimeoutExpired:
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
        user_id: str,
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
            user_id: The user's ID (for organizing images)
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
        
        # Get user-specific output directory
        output_dir = self._get_user_output_dir(user_id)
        
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
                filepath = output_dir / filename
                
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
                        "url": f"/api/images/generated/{user_id}/{filename}"
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
