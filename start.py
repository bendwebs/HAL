"""
HAL - Unified Startup Script
Manages both frontend and backend processes with automatic restart on failure
"""

import subprocess
import sys
import time
import signal
import threading
import os
from datetime import datetime
from pathlib import Path
import io

# Force UTF-8 output on Windows
if os.name == 'nt':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Configuration
BASE_DIR = Path(__file__).parent
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR / "frontend"

# TTS Configuration
INDEXTTS_DIR = Path(os.environ.get("INDEXTTS_PATH", str(BASE_DIR / "index-tts")))
TTS_SERVICE_FILE = BACKEND_DIR / "app" / "services" / "tts_service.py"
ENABLE_TTS = os.environ.get("HAL_ENABLE_TTS", "1").lower() in ("1", "true", "yes")

# Determine Python executable (prefer venv)
VENV_PYTHON = BACKEND_DIR / "venv" / ("Scripts" if os.name == "nt" else "bin") / ("python.exe" if os.name == "nt" else "python")
PYTHON_EXE = str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable

# IndexTTS uses uv for environment management
INDEXTTS_UV = "uv"

BACKEND_CMD = [PYTHON_EXE, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
FRONTEND_CMD = ["npm.cmd" if os.name == "nt" else "npm", "run", "dev"]
TTS_CMD = [INDEXTTS_UV, "run", "python", str(TTS_SERVICE_FILE)]

RESTART_DELAY = 3  # seconds to wait before restarting
MAX_RESTART_ATTEMPTS = 10  # max restarts within the window
RESTART_WINDOW = 60  # seconds - reset restart counter after this

# ANSI colors for terminal output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'

# Enable ANSI colors on Windows
if os.name == 'nt':
    os.system('color')
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except:
        pass


def log(name, message, color=Colors.END, level="INFO"):
    """Thread-safe logging"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    level_colors = {
        "INFO": Colors.GREEN,
        "WARN": Colors.YELLOW,
        "ERROR": Colors.RED,
        "DEBUG": Colors.CYAN
    }
    level_color = level_colors.get(level, "")
    try:
        print(f"{Colors.BOLD}[{timestamp}]{Colors.END} {color}[{name:8}]{Colors.END} {level_color}{level:5}{Colors.END} {message}", flush=True)
    except:
        print(f"[{timestamp}] [{name:8}] {level:5} {message}", flush=True)


def stream_output(process, name, color, should_run):
    """Stream process output line by line"""
    try:
        while should_run():
            line = process.stdout.readline()
            if not line:
                if process.poll() is not None:
                    break
                continue
            
            line = line.rstrip()
            if not line:
                continue
            
            try:
                # Color code certain keywords
                line_lower = line.lower()
                if 'error' in line_lower:
                    print(f"{color}[{name:8}]{Colors.END} {Colors.RED}{line}{Colors.END}", flush=True)
                elif 'warn' in line_lower:
                    print(f"{color}[{name:8}]{Colors.END} {Colors.YELLOW}{line}{Colors.END}", flush=True)
                elif any(kw in line_lower for kw in ['ready', 'started', 'listening', 'running', 'connected']):
                    print(f"{color}[{name:8}]{Colors.END} {Colors.GREEN}{line}{Colors.END}", flush=True)
                else:
                    print(f"{color}[{name:8}]{Colors.END} {line}", flush=True)
            except:
                print(f"[{name:8}] {line}", flush=True)
    except Exception as e:
        log(name, f"Output stream error: {e}", color, "ERROR")


class ProcessManager:
    """Manages a single process with automatic restart"""
    
    def __init__(self, name, cmd, cwd, color, env=None):
        self.name = name
        self.cmd = cmd
        self.cwd = cwd
        self.color = color
        self.env = env or os.environ.copy()
        self.process = None
        self.should_run = True
        self.restart_count = 0
        self.last_restart_reset = time.time()
        self.thread = None
        self.output_thread = None
    
    def start(self):
        """Start the process manager thread"""
        self.should_run = True
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()
    
    def stop(self):
        """Stop the process"""
        self.should_run = False
        if self.process:
            log(self.name, "Stopping process...", self.color, "WARN")
            try:
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/F', '/T', '/PID', str(self.process.pid)], 
                                  capture_output=True, timeout=5)
                else:
                    self.process.terminate()
                    self.process.wait(timeout=5)
            except Exception as e:
                log(self.name, f"Error stopping: {e}", self.color, "WARN")
                try:
                    self.process.kill()
                except:
                    pass
            self.process = None
    
    def _run_loop(self):
        """Main loop that runs and restarts the process"""
        while self.should_run:
            # Reset restart counter if outside window
            if time.time() - self.last_restart_reset > RESTART_WINDOW:
                self.restart_count = 0
                self.last_restart_reset = time.time()
            
            # Check if we've exceeded max restarts
            if self.restart_count >= MAX_RESTART_ATTEMPTS:
                log(self.name, f"Max restarts ({MAX_RESTART_ATTEMPTS}) exceeded. Waiting {RESTART_WINDOW}s...", self.color, "ERROR")
                time.sleep(RESTART_WINDOW)
                self.restart_count = 0
                self.last_restart_reset = time.time()
            
            try:
                log(self.name, f"Starting: {' '.join(self.cmd[:3])}...", self.color, "INFO")
                
                # Start the process
                startupinfo = None
                if os.name == 'nt':
                    startupinfo = subprocess.STARTUPINFO()
                    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                
                self.process = subprocess.Popen(
                    self.cmd,
                    cwd=self.cwd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    env=self.env,
                    startupinfo=startupinfo,
                    encoding='utf-8',
                    errors='replace'
                )
                
                # Stream output in separate thread
                self.output_thread = threading.Thread(
                    target=stream_output,
                    args=(self.process, self.name, self.color, lambda: self.should_run),
                    daemon=True
                )
                self.output_thread.start()
                
                # Wait for process to exit
                exit_code = self.process.wait()
                
                if self.should_run:
                    log(self.name, f"Process exited with code {exit_code}", self.color, "WARN" if exit_code != 0 else "INFO")
                    self.restart_count += 1
                    log(self.name, f"Restarting in {RESTART_DELAY}s... (attempt {self.restart_count}/{MAX_RESTART_ATTEMPTS})", self.color, "WARN")
                    time.sleep(RESTART_DELAY)
                
            except FileNotFoundError:
                log(self.name, f"Command not found: {self.cmd[0]}", self.color, "ERROR")
                self.restart_count += 1
                time.sleep(RESTART_DELAY)
            except Exception as e:
                log(self.name, f"Error: {e}", self.color, "ERROR")
                self.restart_count += 1
                time.sleep(RESTART_DELAY)


class HALRunner:
    """Main runner that manages all processes"""
    
    def __init__(self):
        self.managers = []
        self.running = False
    
    def setup(self):
        """Initialize process managers"""
        # Backend
        backend_env = os.environ.copy()
        if VENV_PYTHON.exists():
            venv_bin = VENV_PYTHON.parent
            backend_env["PATH"] = str(venv_bin) + os.pathsep + backend_env.get("PATH", "")
            backend_env["VIRTUAL_ENV"] = str(venv_bin.parent)
        
        self.managers.append(ProcessManager(
            name="Backend",
            cmd=BACKEND_CMD,
            cwd=BACKEND_DIR,
            color=Colors.CYAN,
            env=backend_env
        ))
        
        # Frontend
        self.managers.append(ProcessManager(
            name="Frontend",
            cmd=FRONTEND_CMD,
            cwd=FRONTEND_DIR,
            color=Colors.BLUE
        ))
        
        # TTS Service (optional - requires IndexTTS installation)
        if ENABLE_TTS and INDEXTTS_DIR.exists():
            tts_env = os.environ.copy()
            tts_env["INDEXTTS_PATH"] = str(INDEXTTS_DIR)
            tts_env["HAL_VOICE_SAMPLES"] = str(BACKEND_DIR / "data" / "voices")
            tts_env["HAL_TTS_CACHE"] = str(BACKEND_DIR / "data" / "tts_cache")
            
            self.managers.append(ProcessManager(
                name="TTS",
                cmd=TTS_CMD,
                cwd=INDEXTTS_DIR,
                color=Colors.GREEN,
                env=tts_env
            ))
            log("HAL", "TTS service enabled", Colors.GREEN, "INFO")
        elif ENABLE_TTS:
            log("HAL", f"TTS enabled but IndexTTS not found at {INDEXTTS_DIR}", Colors.YELLOW, "WARN")
    
    def print_banner(self):
        """Print startup banner"""
        if ENABLE_TTS and INDEXTTS_DIR.exists():
            tts_status = f"{Colors.GREEN}http://localhost:8001{Colors.END}"
            tts_hint = ""
        elif ENABLE_TTS:
            tts_status = f"{Colors.YELLOW}not installed{Colors.END}"
            tts_hint = f"\n  Install TTS: {Colors.CYAN}git clone https://github.com/index-tts/index-tts.git{Colors.END}"
        else:
            tts_status = f"{Colors.YELLOW}disabled{Colors.END}"
            tts_hint = f"\n  Enable TTS: {Colors.CYAN}start.bat{Colors.END} (enabled by default)"
        try:
            banner = f"""
{Colors.BOLD}{Colors.CYAN}
  HAL - Local AI System
  ======================
{Colors.END}
  Backend:  {Colors.CYAN}http://localhost:8000{Colors.END}
  Frontend: {Colors.BLUE}http://localhost:3000{Colors.END}
  TTS:      {tts_status}
  API Docs: {Colors.CYAN}http://localhost:8000/docs{Colors.END}
  
  Default Login: {Colors.YELLOW}admin / admin123{Colors.END}
  {tts_hint}
  Press {Colors.RED}Ctrl+C{Colors.END} to stop all services
{Colors.BOLD}{'='*50}{Colors.END}
"""
            print(banner, flush=True)
        except:
            tts_display = "http://localhost:8001" if ENABLE_TTS and INDEXTTS_DIR.exists() else ("not installed" if ENABLE_TTS else "disabled")
            print("\n  HAL - Local AI System")
            print("  ======================")
            print("  Backend:  http://localhost:8000")
            print("  Frontend: http://localhost:3000")
            print(f"  TTS:      {tts_display}")
            print("  API Docs: http://localhost:8000/docs")
            print("  Default Login: admin / admin123")
            if ENABLE_TTS and not INDEXTTS_DIR.exists():
                print("  Install TTS: git clone https://github.com/index-tts/index-tts.git")
            print("  Press Ctrl+C to stop")
            print("=" * 50 + "\n", flush=True)
    
    def start(self):
        """Start all processes"""
        self.running = True
        self.print_banner()
        
        for manager in self.managers:
            manager.start()
            time.sleep(2)  # Stagger startup
    
    def stop(self):
        """Stop all processes"""
        try:
            print(f"\n{Colors.YELLOW}Shutting down HAL...{Colors.END}", flush=True)
        except:
            print("\nShutting down HAL...", flush=True)
        
        self.running = False
        
        for manager in self.managers:
            manager.stop()
        
        try:
            print(f"{Colors.GREEN}All services stopped.{Colors.END}", flush=True)
        except:
            print("All services stopped.", flush=True)
    
    def wait(self):
        """Wait for interrupt signal"""
        try:
            while self.running:
                time.sleep(0.5)
        except KeyboardInterrupt:
            pass


def check_prerequisites():
    """Check if required tools and directories exist"""
    try:
        print(f"\n{Colors.BOLD}Checking prerequisites...{Colors.END}\n", flush=True)
    except:
        print("\nChecking prerequisites...\n", flush=True)
    
    warnings = []
    errors = []
    
    def print_ok(msg):
        try:
            print(f"  {Colors.GREEN}[OK]{Colors.END} {msg}", flush=True)
        except:
            print(f"  [OK] {msg}", flush=True)
    
    def print_warn(msg):
        try:
            print(f"  {Colors.YELLOW}[WARN]{Colors.END} {msg}", flush=True)
        except:
            print(f"  [WARN] {msg}", flush=True)
    
    def print_err(msg):
        try:
            print(f"  {Colors.RED}[ERR]{Colors.END} {msg}", flush=True)
        except:
            print(f"  [ERR] {msg}", flush=True)
    
    # Check directories
    if not BACKEND_DIR.exists():
        errors.append(f"Backend directory not found: {BACKEND_DIR}")
    else:
        print_ok("Backend directory found")
    
    if not FRONTEND_DIR.exists():
        errors.append(f"Frontend directory not found: {FRONTEND_DIR}")
    else:
        print_ok("Frontend directory found")
    
    # Check Python
    print_ok(f"Python: {sys.version.split()[0]}")
    
    # Check for venv
    if VENV_PYTHON.exists():
        print_ok("Backend venv found")
    else:
        print_warn("Python venv not found")
        warnings.append("Run: cd backend && python -m venv venv && venv\\Scripts\\activate && pip install -r requirements.txt")
    
    # Check for node_modules
    node_modules = FRONTEND_DIR / "node_modules"
    if node_modules.exists():
        print_ok("Frontend node_modules found")
    else:
        print_warn("node_modules not found")
        warnings.append("Run: cd frontend && npm install")
    
    # Check for npm
    try:
        npm_cmd = "npm.cmd" if os.name == 'nt' else "npm"
        result = subprocess.run([npm_cmd, "--version"], capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            print_ok(f"npm: {result.stdout.strip()}")
        else:
            errors.append("npm not found. Please install Node.js")
    except FileNotFoundError:
        errors.append("npm not found. Please install Node.js")
    except Exception as e:
        errors.append(f"Error checking npm: {e}")
    
    print(flush=True)
    
    # Print warnings
    for warning in warnings:
        print_warn(warning)
        print(flush=True)
    
    # Print errors
    for error in errors:
        print_err(error)
        print(flush=True)
    
    return len(errors) == 0


def main():
    try:
        print(f"\n{Colors.BOLD}HAL Startup Script{Colors.END}\n", flush=True)
    except:
        print("\nHAL Startup Script\n", flush=True)
    
    # Check prerequisites
    if not check_prerequisites():
        try:
            print(f"\n{Colors.RED}Please fix the above errors before starting.{Colors.END}", flush=True)
        except:
            print("\nPlease fix the above errors before starting.", flush=True)
        input("\nPress Enter to exit...")
        sys.exit(1)
    
    # Create and run
    runner = HALRunner()
    runner.setup()
    
    # Handle signals
    def signal_handler(sig, frame):
        runner.stop()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Start and wait
    runner.start()
    runner.wait()
    runner.stop()


if __name__ == "__main__":
    main()
