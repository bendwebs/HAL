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
        self.startup_timeout = getattr(settings, 'sd_startup_timeout', 180)  # seconds
        self._starting = False
        self._lock = asyncio.Lock()
    
    @property
    def is_configured(self) -> bool:
        """Check if SD path is configured"""
        if not self.sd_path:
            return False
        sd_path = Path(self.sd_path)
        # Check for either run.bat (portable) or webui folder
        return sd_path.exists() and (
            (sd_path / 'run.bat').exists() or 
            (sd_path / 'webui-user.bat').exists() or
            (sd_path / 'webui' / 'webui-user.bat').exists()
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
    
    def _find_launch_script(self, sd_path: Path) -> tuple[Optional[Path], list[str]]:
        """Find the appropriate launch script and return (script_path, extra_args)"""
        
        # Option 1: Portable install with run.bat at root
        run_bat = sd_path / 'run.bat'
        if run_bat.exists():
            logger.info(f"Found portable SD install with run.bat")
            return run_bat, ['--api', '--nowebui']
        
        # Option 2: webui-user.bat at root (standard install)
        webui_user = sd_path / 'webui-user.bat'
        if webui_user.exists():
            logger.info(f"Found standard SD install with webui-user.bat")
            return webui_user, ['--api', '--nowebui']
        
        # Option 3: webui-user.bat in webui subfolder
        webui_user_sub = sd_path / 'webui' / 'webui-user.bat'
        if webui_user_sub.exists():
            logger.info(f"Found SD install with webui subfolder")
            return webui_user_sub, ['--api', '--nowebui']
        
        # Option 4: Linux - webui.sh
        webui_sh = sd_path / 'webui.sh'
        if webui_sh.exists():
            logger.info(f"Found Linux SD install with webui.sh")
            return webui_sh, ['--api', '--nowebui']
        
        return None, []
    
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
            
            # Find launch script
            launch_script, extra_args = self._find_launch_script(sd_path)
            
            if not launch_script:
                return {
                    "success": False,
                    "error": f"Cannot find run.bat, webui-user.bat, or webui.sh in {sd_path}"
                }
            
            self._starting = True
            
            try:
                logger.info(f"Starting Stable Diffusion from {launch_script}")
                logger.info(f"Extra args: {extra_args}")
                
                # Determine working directory
                work_dir = launch_script.parent
                
                if sys.platform == 'win32':
                    # On Windows, we need to modify COMMANDLINE_ARGS
                    # Create a temporary batch file that sets args and calls the original
                    
                    # For run.bat, we need to inject args differently
                    # The cleanest way is to set COMMANDLINE_ARGS environment variable
                    env = os.environ.copy()
                    env['COMMANDLINE_ARGS'] = ' '.join(extra_args)
                    
                    # Start the process
                    self.process = subprocess.Popen(
                        [str(launch_script)],
                        cwd=str(work_dir),
                        env=env,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        creationflags=subprocess.CREATE_NEW_CONSOLE
                    )
                else:
                    # Linux/Mac
                    cmd = ['bash', str(launch_script)] + extra_args
                    self.process = subprocess.Popen(
                        cmd,
                        cwd=str(work_dir),
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT
                    )
                
                logger.info(f"SD process started with PID {self.process.pid}")
                
                # Wait for API to become ready
                start_time = asyncio.get_event_loop().time()
                check_interval = 3  # seconds between checks
                
                while (asyncio.get_event_loop().time() - start_time) < self.startup_timeout:
                    elapsed = int(asyncio.get_event_loop().time() - start_time)
                    
                    if await self.check_api_ready():
                        self._starting = False
                        logger.info(f"Stable Diffusion API is ready after {elapsed}s")
                        return {
                            "success": True,
                            "message": f"Stable Diffusion started successfully in {elapsed}s",
                            "startup_time": elapsed
                        }
                    
                    # Check if process died
                    if self.process.poll() is not None:
                        self._starting = False
                        exit_code = self.process.returncode
                        logger.error(f"SD process exited with code {exit_code}")
                        return {
                            "success": False,
                            "error": f"Stable Diffusion process exited unexpectedly (code {exit_code})"
                        }
                    
                    if elapsed % 15 == 0:
                        logger.info(f"Waiting for SD API... ({elapsed}s / {self.startup_timeout}s)")
                    
                    await asyncio.sleep(check_interval)
                
                self._starting = False
                return {
                    "success": False,
                    "error": f"Stable Diffusion failed to start within {self.startup_timeout} seconds. It may still be loading - check the SD console window."
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
