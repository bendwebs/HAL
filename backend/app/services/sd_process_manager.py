"""Stable Diffusion Process Manager - Start/stop SD server as subprocess"""

import subprocess
import asyncio
import logging
import os
import sys
from typing import Optional, Dict, Any
from pathlib import Path
import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class SDProcessManager:
    """Manages Stable Diffusion server as a subprocess"""
    
    def __init__(self):
        self.process: Optional[subprocess.Popen] = None
        self.sd_path = getattr(settings, 'sd_webui_path', None)
        self.api_url = getattr(settings, 'sd_api_url', 'http://127.0.0.1:7860')
        self.startup_timeout = getattr(settings, 'sd_startup_timeout', 120)  # seconds
        self._starting = False
        self._lock = asyncio.Lock()
    
    @property
    def is_configured(self) -> bool:
        """Check if SD path is configured"""
        return bool(self.sd_path) and Path(self.sd_path).exists()
    
    @property
    def is_running(self) -> bool:
        """Check if subprocess is running"""
        return self.process is not None and self.process.poll() is None
    
    async def check_api_ready(self) -> bool:
        """Check if the SD API is responding"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.api_url}/sdapi/v1/options")
                return response.status_code == 200
        except:
            return False
    
    async def start(self) -> Dict[str, Any]:
        """
        Start the Stable Diffusion server.
        
        Returns status dict with success/error info.
        """
        async with self._lock:
            # Check if already running
            if await self.check_api_ready():
                logger.info("SD API already running")
                return {
                    "success": True,
                    "message": "Stable Diffusion is already running",
                    "already_running": True
                }
            
            if self._starting:
                return {
                    "success": False,
                    "error": "Stable Diffusion is already starting up"
                }
            
            if not self.is_configured:
                return {
                    "success": False,
                    "error": f"Stable Diffusion path not configured. Set SD_WEBUI_PATH in .env"
                }
            
            self._starting = True
            
            try:
                sd_path = Path(self.sd_path)
                
                # Determine launch script based on OS
                if sys.platform == 'win32':
                    # Windows - look for webui-user.bat or webui.bat
                    launch_script = sd_path / 'webui-user.bat'
                    if not launch_script.exists():
                        launch_script = sd_path / 'webui.bat'
                    
                    if not launch_script.exists():
                        return {
                            "success": False,
                            "error": f"Cannot find webui-user.bat or webui.bat in {sd_path}"
                        }
                    
                    # Start with --api --nowebui for headless mode
                    cmd = [str(launch_script), '--api', '--nowebui']
                    
                    # Use CREATE_NEW_CONSOLE on Windows to avoid blocking
                    self.process = subprocess.Popen(
                        cmd,
                        cwd=str(sd_path),
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == 'win32' else 0
                    )
                else:
                    # Linux/Mac
                    launch_script = sd_path / 'webui.sh'
                    if not launch_script.exists():
                        return {
                            "success": False,
                            "error": f"Cannot find webui.sh in {sd_path}"
                        }
                    
                    cmd = ['bash', str(launch_script), '--api', '--nowebui']
                    
                    self.process = subprocess.Popen(
                        cmd,
                        cwd=str(sd_path),
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT
                    )
                
                logger.info(f"Starting Stable Diffusion from {sd_path}")
                
                # Wait for API to become ready
                start_time = asyncio.get_event_loop().time()
                while (asyncio.get_event_loop().time() - start_time) < self.startup_timeout:
                    if await self.check_api_ready():
                        self._starting = False
                        logger.info("Stable Diffusion API is ready")
                        return {
                            "success": True,
                            "message": "Stable Diffusion started successfully",
                            "startup_time": int(asyncio.get_event_loop().time() - start_time)
                        }
                    
                    # Check if process died
                    if self.process.poll() is not None:
                        self._starting = False
                        return {
                            "success": False,
                            "error": "Stable Diffusion process exited unexpectedly"
                        }
                    
                    await asyncio.sleep(2)
                
                self._starting = False
                return {
                    "success": False,
                    "error": f"Stable Diffusion failed to start within {self.startup_timeout} seconds"
                }
                
            except Exception as e:
                self._starting = False
                logger.error(f"Failed to start Stable Diffusion: {e}")
                return {
                    "success": False,
                    "error": str(e)
                }
    
    async def stop(self) -> Dict[str, Any]:
        """Stop the Stable Diffusion server"""
        if not self.is_running:
            return {
                "success": True,
                "message": "Stable Diffusion is not running"
            }
        
        try:
            self.process.terminate()
            
            # Wait for graceful shutdown
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
            
            self.process = None
            logger.info("Stable Diffusion stopped")
            
            return {
                "success": True,
                "message": "Stable Diffusion stopped successfully"
            }
            
        except Exception as e:
            logger.error(f"Failed to stop Stable Diffusion: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def get_status(self) -> Dict[str, Any]:
        """Get current status of SD server"""
        api_ready = await self.check_api_ready()
        
        return {
            "configured": self.is_configured,
            "sd_path": self.sd_path,
            "api_url": self.api_url,
            "subprocess_running": self.is_running,
            "api_ready": api_ready,
            "starting": self._starting
        }


# Singleton
_manager: Optional[SDProcessManager] = None


def get_sd_process_manager() -> SDProcessManager:
    """Get singleton SDProcessManager instance"""
    global _manager
    if _manager is None:
        _manager = SDProcessManager()
    return _manager
