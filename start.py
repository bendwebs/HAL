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

# Configuration
BASE_DIR = Path(__file__).parent
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR / "frontend"

# Determine Python executable (prefer venv)
VENV_PYTHON = BACKEND_DIR / "venv" / ("Scripts" if os.name == "nt" else "bin") / ("python.exe" if os.name == "nt" else "python")
PYTHON_EXE = str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable

BACKEND_CMD = [PYTHON_EXE, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
FRONTEND_CMD = ["npm.cmd" if os.name == "nt" else "npm", "run", "dev"]

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


def run_command(cmd, cwd=None, capture=True):
    """Run a command and return output"""
    try:
        result = subprocess.run(
            cmd, 
            cwd=cwd, 
            capture_output=capture, 
            text=True,
            shell=(os.name == 'nt')
        )
        return result.returncode == 0, result.stdout if capture else "", result.stderr if capture else ""
    except Exception as e:
        return False, "", str(e)


class ProcessManager:
    """Manages a single process with automatic restart"""
    
    def __init__(self, name: str, cmd: list, cwd: Path, color: str, env: dict = None):
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
        self.lock = threading.Lock()
    
    def log(self, message: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        level_colors = {
            "INFO": Colors.GREEN,
            "WARN": Colors.YELLOW,
            "ERROR": Colors.RED,
            "DEBUG": Colors.CYAN
        }
        level_color = level_colors.get(level, "")
        print(f"{Colors.BOLD}[{timestamp}]{Colors.END} {self.color}[{self.name:8}]{Colors.END} {level_color}{level:5}{Colors.END} {message}")
    
    def start(self):
        """Start the process"""
        self.should_run = True
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()
    
    def stop(self):
        """Stop the process"""
        self.should_run = False
        with self.lock:
            if self.process:
                self.log("Stopping process...", "WARN")
                try:
                    if os.name == 'nt':
                        subprocess.run(['taskkill', '/F', '/T', '/PID', str(self.process.pid)], 
                                      capture_output=True)
                    else:
                        self.process.terminate()
                        self.process.wait(timeout=5)
                except Exception as e:
                    self.log(f"Error stopping: {e}", "WARN")
                    try:
                        self.process.kill()
                    except:
                        pass
                self.process = None
    
    def _run_loop(self):
        """Main loop that runs and restarts the process"""
        while self.should_run:
            if time.time() - self.last_restart_reset > RESTART_WINDOW:
                self.restart_count = 0
                self.last_restart_reset = time.time()
            
            if self.restart_count >= MAX_RESTART_ATTEMPTS:
                self.log(f"Max restarts ({MAX_RESTART_ATTEMPTS}) exceeded. Waiting {RESTART_WINDOW}s...", "ERROR")
                time.sleep(RESTART_WINDOW)
                self.restart_count = 0
                self.last_restart_reset = time.time()
            
            try:
                self.log(f"Starting process...", "INFO")
                
                with self.lock:
                    self.process = subprocess.Popen(
                        self.cmd,
                        cwd=self.cwd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        bufsize=1,
                        env=self.env,
                        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
                    )
                
                while self.should_run:
                    line = self.process.stdout.readline()
                    if not line:
                        break
                    line = line.rstrip()
                    if line:
                        if 'error' in line.lower():
                            print(f"{self.color}[{self.name:8}]{Colors.END} {Colors.RED}{line}{Colors.END}")
                        elif 'warn' in line.lower():
                            print(f"{self.color}[{self.name:8}]{Colors.END} {Colors.YELLOW}{line}{Colors.END}")
                        elif 'ready' in line.lower() or 'started' in line.lower() or 'listening' in line.lower():
                            print(f"{self.color}[{self.name:8}]{Colors.END} {Colors.GREEN}{line}{Colors.END}")
                        else:
                            print(f"{self.color}[{self.name:8}]{Colors.END} {line}")
                
                exit_code = self.process.wait() if self.process else 0
                
                if self.should_run:
                    self.log(f"Process exited with code {exit_code}", "WARN" if exit_code != 0 else "INFO")
                    self.restart_count += 1
                    self.log(f"Restarting in {RESTART_DELAY}s... (attempt {self.restart_count}/{MAX_RESTART_ATTEMPTS})", "WARN")
                    time.sleep(RESTART_DELAY)
                
            except FileNotFoundError as e:
                self.log(f"Command not found: {e}", "ERROR")
                self.log(f"Command was: {' '.join(self.cmd)}", "DEBUG")
                self.restart_count += 1
                time.sleep(RESTART_DELAY)
            except Exception as e:
                self.log(f"Error: {e}", "ERROR")
                self.restart_count += 1
                time.sleep(RESTART_DELAY)


class HALRunner:
    """Main runner that manages all processes"""
    
    def __init__(self):
        self.managers = []
        self.running = False
    
    def setup(self):
        """Initialize process managers"""
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
        
        self.managers.append(ProcessManager(
            name="Frontend",
            cmd=FRONTEND_CMD,
            cwd=FRONTEND_DIR,
            color=Colors.BLUE
        ))
    
    def print_banner(self):
        """Print startup banner"""
        print(f"""
{Colors.BOLD}{Colors.CYAN}
  ██╗  ██╗ █████╗ ██╗     
  ██║  ██║██╔══██╗██║     
  ███████║███████║██║     
  ██╔══██║██╔══██║██║     
  ██║  ██║██║  ██║███████╗
  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
{Colors.END}
  {Colors.GREEN}Local AI System{Colors.END}
  
  Backend:  {Colors.CYAN}http://localhost:8000{Colors.END}
  Frontend: {Colors.BLUE}http://localhost:3000{Colors.END}
  API Docs: {Colors.CYAN}http://localhost:8000/docs{Colors.END}
  
  Default Login: {Colors.YELLOW}admin / admin123{Colors.END}
  
  Press {Colors.RED}Ctrl+C{Colors.END} to stop all services
{Colors.BOLD}{'─'*50}{Colors.END}
""")
    
    def start(self):
        """Start all processes"""
        self.running = True
        self.print_banner()
        
        for manager in self.managers:
            manager.start()
            time.sleep(2)
    
    def stop(self):
        """Stop all processes"""
        print(f"\n{Colors.YELLOW}Shutting down HAL...{Colors.END}")
        self.running = False
        
        for manager in self.managers:
            manager.stop()
        
        print(f"{Colors.GREEN}All services stopped.{Colors.END}")
    
    def wait(self):
        """Wait for interrupt signal"""
        try:
            while self.running:
                time.sleep(0.5)
        except KeyboardInterrupt:
            pass


def print_box(title):
    """Print a boxed title"""
    width = 50
    print(f"\n{Colors.CYAN}╔{'═'*width}╗{Colors.END}")
    print(f"{Colors.CYAN}║{Colors.END}{title:^{width}}{Colors.CYAN}║{Colors.END}")
    print(f"{Colors.CYAN}╚{'═'*width}╝{Colors.END}")


def setup_backend():
    """Setup backend environment"""
    print(f"{Colors.BOLD}Setting up Backend...{Colors.END}")
    
    venv_dir = BACKEND_DIR / "venv"
    pip_exe = venv_dir / ("Scripts" if os.name == "nt" else "bin") / ("pip.exe" if os.name == "nt" else "pip")
    
    # Create venv if needed
    if not venv_dir.exists():
        print(f"  Creating Python virtual environment...")
        print(f"  {Colors.CYAN}→ Creating venv{Colors.END}")
        success, _, err = run_command([sys.executable, "-m", "venv", str(venv_dir)])
        if not success:
            print(f"  {Colors.RED}✗ Failed to create venv: {err}{Colors.END}")
            return False
        print(f"  {Colors.GREEN}✓ Virtual environment created{Colors.END}")
    else:
        print(f"  {Colors.GREEN}✓ Virtual environment exists{Colors.END}")
    
    # Install requirements
    print(f"  Installing Python dependencies...")
    print(f"  {Colors.CYAN}→ {pip_exe} install -r requirements.txt{Colors.END}")
    
    result = subprocess.run(
        [str(pip_exe), "install", "-r", "requirements.txt"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"  {Colors.RED}✗ Failed to install requirements{Colors.END}")
        print(f"    Error: {result.stderr[:500] if result.stderr else result.stdout[:500]}")
        return False
    
    print(f"  {Colors.GREEN}✓ Dependencies installed{Colors.END}")
    return True


def setup_frontend():
    """Setup frontend environment"""
    print(f"\n{Colors.BOLD}Setting up Frontend...{Colors.END}")
    
    node_modules = FRONTEND_DIR / "node_modules"
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    
    if not node_modules.exists():
        print(f"  Installing Node.js dependencies...")
        print(f"  {Colors.CYAN}→ npm install{Colors.END}")
        
        result = subprocess.run(
            [npm_cmd, "install"],
            cwd=FRONTEND_DIR,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"  {Colors.RED}✗ Failed to install npm packages{Colors.END}")
            print(f"    Error: {result.stderr[:500] if result.stderr else 'Unknown error'}")
            return False
        
        print(f"  {Colors.GREEN}✓ Node modules installed{Colors.END}")
    else:
        print(f"  {Colors.GREEN}✓ Node modules exist{Colors.END}")
    
    return True


def check_prerequisites():
    """Check if required tools exist"""
    print_box("HAL - Local AI System Setup")
    print(f"{Colors.BOLD}Checking system requirements...{Colors.END}")
    
    errors = []
    
    # Check Python
    print(f"  {Colors.GREEN}✓{Colors.END} Python {sys.version.split()[0]}")
    
    # Check npm
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    try:
        result = subprocess.run([npm_cmd, "--version"], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"  {Colors.GREEN}✓{Colors.END} npm {result.stdout.strip()}")
        else:
            errors.append("npm not found")
    except FileNotFoundError:
        errors.append("npm not found - please install Node.js")
    
    # Check directories
    if BACKEND_DIR.exists():
        print(f"  {Colors.GREEN}✓{Colors.END} Backend directory exists")
    else:
        errors.append(f"Backend directory not found: {BACKEND_DIR}")
    
    if FRONTEND_DIR.exists():
        print(f"  {Colors.GREEN}✓{Colors.END} Frontend directory exists")
    else:
        errors.append(f"Frontend directory not found: {FRONTEND_DIR}")
    
    if errors:
        print(f"\n{Colors.RED}Errors found:{Colors.END}")
        for err in errors:
            print(f"  {Colors.RED}✗{Colors.END} {err}")
        return False
    
    return True


def main():
    if not check_prerequisites():
        print(f"\n{Colors.RED}Please fix the above errors before starting.{Colors.END}")
        sys.exit(1)
    
    # Setup environments
    if not setup_backend():
        print(f"\n{Colors.RED}Backend setup failed. Please check errors above.{Colors.END}")
        sys.exit(1)
    
    if not setup_frontend():
        print(f"\n{Colors.RED}Frontend setup failed. Please check errors above.{Colors.END}")
        sys.exit(1)
    
    print(f"\n{Colors.GREEN}Setup complete! Starting services...{Colors.END}")
    
    # Update PYTHON_EXE now that venv exists
    global PYTHON_EXE, BACKEND_CMD
    PYTHON_EXE = str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable
    BACKEND_CMD = [PYTHON_EXE, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
    
    # Create and run
    runner = HALRunner()
    runner.setup()
    
    def signal_handler(sig, frame):
        runner.stop()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    runner.start()
    runner.wait()
    runner.stop()


if __name__ == "__main__":
    main()
