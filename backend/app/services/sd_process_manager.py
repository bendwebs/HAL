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
        self.startup_timeout = getattr(settings, 'sd_startup_timeout', 180)
        self._starting = False
        self._lock = asyncio.Lock()
    
    @property
    def is_configured(self) -> bool:
        """Check if SD path is configured"""
        if not self.sd_path:
            return False
        sd_path = Path(self.sd_path)
        return sd_path.exists() and (
            (sd_path / 'run.bat').exists() or 
            (sd_path / 'webui-user.bat').exists() or
            (sd_path / 'webui' / 'webui-user.bat').exists() or
            (sd_path / 'webui.sh').exists()
        )
    
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
    
    def _create_api_launcher(self, sd_path: Path) -> Optional[Path]:
        """Create a launcher script that starts SD with --api flag"""
        
        # Check for portable install (has run.bat and environment.bat)
        run_bat = sd_path / 'run.bat'
        env_bat = sd_path / 'environment.bat'
        webui_dir = sd_path / 'webui'
        
        if run_bat.exists() and env_bat.exists() and webui_dir.exists():
            # Portable install - create API launcher that passes args to launch.py
            launcher_path = sd_path / 'run_api.bat'
            
            # The key is to pass --api --nowebui to launch.py directly via %*
            # webui.bat runs: %PYTHON% launch.py %*
            # --nowebui makes it headless (no browser UI)
            launcher_content = f'''@echo off
call "{env_bat}"
cd /d "{webui_dir}"
call webui.bat --api --nowebui
'''
            logger.info(f"Creating API launcher at {launcher_path}")
            with open(launcher_path, 'w') as f:
                f.write(launcher_content)
            
            return launcher_path
        
        # Standard install with webui-user.bat at root
        webui_user = sd_path / 'webui-user.bat'
        if webui_user.exists():
            launcher_path = sd_path / 'webui-api.bat'
            
            # Pass --api --nowebui as arguments
            launcher_content = f'''@echo off
call "{webui_user}" --api --nowebui
'''
            logger.info(f"Creating API launcher at {launcher_path}")
            with open(launcher_path, 'w') as f:
                f.write(launcher_content)
            
            return launcher_path
        
        # Linux
        webui_sh = sd_path / 'webui.sh'
        if webui_sh.exists():
            return webui_sh  # We'll pass args directly
        
        return None
    
    async def start(self) -> Dict[str, Any]:
        """Start the Stable Diffusion server."""
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
            
            if not self.sd_path:
                return {
                    "success": False,
                    "error": "SD_WEBUI_PATH not set in .env"
                }
            
            sd_path = Path(self.sd_path)
            if not sd_path.exists():
                return {
                    "success": False,
                    "error": f"SD path does not exist: {sd_path}"
                }
            
            self._starting = True
            
            try:
                # Create or find the appropriate launcher
                launcher = self._create_api_launcher(sd_path)
                
                if not launcher:
                    self._starting = False
                    return {
                        "success": False,
                        "error": f"Cannot find or create launcher in {sd_path}"
                    }
                
                logger.info(f"Starting Stable Diffusion with: {launcher}")
                
                if sys.platform == 'win32':
                    # Windows - run the batch file
                    self.process = subprocess.Popen(
                        [str(launcher)],
                        cwd=str(launcher.parent),
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        creationflags=subprocess.CREATE_NEW_CONSOLE
                    )
                else:
                    # Linux/Mac
                    self.process = subprocess.Popen(
                        ['bash', str(launcher), '--api', '--nowebui'],
                        cwd=str(launcher.parent),
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT
                    )
                
                logger.info(f"SD process started with PID {self.process.pid}")
                
                # Wait for API to become ready
                start_time = asyncio.get_event_loop().time()
                check_interval = 3
                last_log_time = 0
                
                while (asyncio.get_event_loop().time() - start_time) < self.startup_timeout:
                    elapsed = int(asyncio.get_event_loop().time() - start_time)
                    
                    # Log every 10 seconds
                    if elapsed - last_log_time >= 10:
                        logger.info(f"[SD STARTUP] Waiting for API... ({elapsed}s / {self.startup_timeout}s)")
                        last_log_time = elapsed
                    
                    if await self.check_api_ready():
                        self._starting = False
                        logger.info(f"[SD STARTUP] Stable Diffusion API is ready after {elapsed}s")
                        return {
                            "success": True,
                            "message": f"Stable Diffusion started successfully in {elapsed}s",
                            "startup_time": elapsed
                        }
                    
                    # Check if process died
                    if self.process.poll() is not None:
                        self._starting = False
                        exit_code = self.process.returncode
                        logger.error(f"[SD STARTUP] Process exited with code {exit_code}")
                        return {
                            "success": False,
                            "error": f"Stable Diffusion process exited unexpectedly (code {exit_code})"
                        }
                    
                    await asyncio.sleep(check_interval)
                
                self._starting = False
                return {
                    "success": False,
                    "error": f"Stable Diffusion failed to start within {self.startup_timeout}s. Check the SD console window."
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
