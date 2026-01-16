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

# Fix Windows console encoding
if os.name == 'nt':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'replace')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'replace')
    os.system('chcp 65001 >nul 2>&1')

# Configuration
BASE_DIR = Path(__file__).parent
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR / "frontend"

# Determine Python executable (prefer venv)
VENV_PYTHON = BACKEND_DIR / "venv" / ("Scripts" if os.name == "nt" else "bin") / ("python.exe" if os.name == "nt" else "python")
PYTHON_EXE = str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable

BACKEND_CMD = [PYTHON_EXE, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
FRONTEND_CMD = ["npm.cmd" if os.name == "nt" else "npm", "run", "dev"]

RESTART_DELAY = 3
MAX_RESTART_ATTEMPTS = 10
RESTART_WINDOW = 60

# Simple ASCII-safe colors
class Colors:
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    END = '\033[0m'


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
        self.lock = threading.Lock()
    
    def log(self, message, level="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        level_colors = {
            "INFO": Colors.GREEN,
            "WARN": Colors.YELLOW,
            "ERROR": Colors.RED,
            "DEBUG": Colors.CYAN
        }
        level_color = level_colors.get(level, "")
        try:
            print(f"{Colors.BOLD}[{timestamp}]{Colors.END} {self.color}[{self.name:8}]{Colors.END} {level_color}{level:5}{Colors.END} {message}")
        except:
            print(f"[{timestamp}] [{self.name:8}] {level:5} {message}")
    
    def start(self):
        self.should_run = True
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()
    
    def stop(self):
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
                    try:
                        self.process.kill()
                    except:
                        pass
                self.process = None
    
    def _run_loop(self):
        while self.should_run:
            if time.time() - self.last_restart_reset > RESTART_WINDOW:
                self.restart_count = 0
                self.last_restart_reset = time.time()
            
            if self.restart_count >= MAX_RESTART_ATTEMPTS:
                self.log(f"Max restarts exceeded. Waiting {RESTART_WINDOW}s...", "ERROR")
                time.sleep(RESTART_WINDOW)
                self.restart_count = 0
                self.last_restart_reset = time.time()
            
            try:
                self.log("Starting process...", "INFO")
                
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
                        try:
                            if 'error' in line.lower():
                                print(f"{self.color}[{self.name:8}]{Colors.END} {Colors.RED}{line}{Colors.END}")
                            elif 'warn' in line.lower():
                                print(f"{self.color}[{self.name:8}]{Colors.END} {Colors.YELLOW}{line}{Colors.END}")
                            elif 'ready' in line.lower() or 'started' in line.lower():
                                print(f"{self.color}[{self.name:8}]{Colors.END} {Colors.GREEN}{line}{Colors.END}")
                            else:
                                print(f"{self.color}[{self.name:8}]{Colors.END} {line}")
                        except:
                            print(f"[{self.name:8}] {line}")
                
                exit_code = self.process.wait() if self.process else 0
                
                if self.should_run:
                    self.log(f"Process exited with code {exit_code}", "WARN")
                    self.restart_count += 1
                    self.log(f"Restarting in {RESTART_DELAY}s...", "WARN")
                    time.sleep(RESTART_DELAY)
                
            except FileNotFoundError as e:
                self.log(f"Command not found: {e}", "ERROR")
                self.restart_count += 1
                time.sleep(RESTART_DELAY)
            except Exception as e:
                self.log(f"Error: {e}", "ERROR")
                self.restart_count += 1
                time.sleep(RESTART_DELAY)


class HALRunner:
    def __init__(self):
        self.managers = []
        self.running = False
    
    def setup(self):
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
        try:
            print(f"""
{Colors.BOLD}{Colors.CYAN}
  HAL - Local AI System
{Colors.END}
  Backend:  {Colors.CYAN}http://localhost:8000{Colors.END}
  Frontend: {Colors.BLUE}http://localhost:3000{Colors.END}
  API Docs: {Colors.CYAN}http://localhost:8000/docs{Colors.END}
  
  Default Login: {Colors.YELLOW}admin / admin123{Colors.END}
  
  Press {Colors.RED}Ctrl+C{Colors.END} to stop all services
{Colors.BOLD}{'='*50}{Colors.END}
""")
        except:
            print("\nHAL - Local AI System")
            print("Backend:  http://localhost:8000")
            print("Frontend: http://localhost:3000")
            print("Press Ctrl+C to stop\n")
    
    def start(self):
        self.running = True
        self.print_banner()
        
        for manager in self.managers:
            manager.start()
            time.sleep(2)
    
    def stop(self):
        print("\nShutting down HAL...")
        self.running = False
        
        for manager in self.managers:
            manager.stop()
        
        print("All services stopped.")
    
    def wait(self):
        try:
            while self.running:
                time.sleep(0.5)
        except KeyboardInterrupt:
            pass


def setup_backend():
    print("Setting up Backend...")
    
    venv_dir = BACKEND_DIR / "venv"
    pip_exe = venv_dir / ("Scripts" if os.name == "nt" else "bin") / ("pip.exe" if os.name == "nt" else "pip")
    
    if not venv_dir.exists():
        print("  Creating Python virtual environment...")
        success, _, err = run_command([sys.executable, "-m", "venv", str(venv_dir)])
        if not success:
            print(f"  ERROR: Failed to create venv: {err}")
            return False
        print("  OK: Virtual environment created")
    else:
        print("  OK: Virtual environment exists")
    
    print("  Installing Python dependencies...")
    
    result = subprocess.run(
        [str(pip_exe), "install", "-r", "requirements.txt"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"  ERROR: Failed to install requirements")
        error_msg = result.stderr or result.stdout
        if error_msg:
            print(f"    {error_msg[:500]}")
        return False
    
    print("  OK: Dependencies installed")
    return True


def setup_frontend():
    print("\nSetting up Frontend...")
    
    node_modules = FRONTEND_DIR / "node_modules"
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    
    if not node_modules.exists():
        print("  Installing Node.js dependencies...")
        
        result = subprocess.run(
            [npm_cmd, "install"],
            cwd=FRONTEND_DIR,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"  ERROR: Failed to install npm packages")
            return False
        
        print("  OK: Node modules installed")
    else:
        print("  OK: Node modules exist")
    
    return True


def check_prerequisites():
    print("\n" + "="*50)
    print("  HAL - Local AI System Setup")
    print("="*50)
    print("Checking system requirements...")
    
    errors = []
    
    print(f"  OK: Python {sys.version.split()[0]}")
    
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    try:
        result = subprocess.run([npm_cmd, "--version"], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"  OK: npm {result.stdout.strip()}")
        else:
            errors.append("npm not found")
    except FileNotFoundError:
        errors.append("npm not found - please install Node.js")
    
    if BACKEND_DIR.exists():
        print(f"  OK: Backend directory exists")
    else:
        errors.append(f"Backend directory not found")
    
    if FRONTEND_DIR.exists():
        print(f"  OK: Frontend directory exists")
    else:
        errors.append(f"Frontend directory not found")
    
    if errors:
        print("\nErrors found:")
        for err in errors:
            print(f"  ERROR: {err}")
        return False
    
    return True


def main():
    if not check_prerequisites():
        print("\nPlease fix the above errors before starting.")
        sys.exit(1)
    
    if not setup_backend():
        print("\nBackend setup failed.")
        sys.exit(1)
    
    if not setup_frontend():
        print("\nFrontend setup failed.")
        sys.exit(1)
    
    print("\nSetup complete! Starting services...\n")
    
    global PYTHON_EXE, BACKEND_CMD
    PYTHON_EXE = str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable
    BACKEND_CMD = [PYTHON_EXE, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
    
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
