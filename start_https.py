"""
HAL - HTTPS Startup Script for Mobile Voice Access
Runs both frontend and backend on HTTPS for secure context (required for microphone access on mobile)
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
CERTS_DIR = BASE_DIR / "certs"

# Determine Python executable (prefer venv)
VENV_PYTHON = BACKEND_DIR / "venv" / ("Scripts" if os.name == "nt" else "bin") / ("python.exe" if os.name == "nt" else "python")
PYTHON_EXE = str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable

# HTTPS commands
BACKEND_CMD = [PYTHON_EXE, "run_https.py"]
FRONTEND_CMD = ["npm.cmd" if os.name == "nt" else "npm", "run", "dev:https"]

# ANSI colors
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'

if os.name == 'nt':
    os.system('color')
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except:
        pass


def log(name, message, color=Colors.END, level="INFO"):
    timestamp = datetime.now().strftime("%H:%M:%S")
    level_colors = {"INFO": Colors.GREEN, "WARN": Colors.YELLOW, "ERROR": Colors.RED}
    level_color = level_colors.get(level, "")
    try:
        print(f"{Colors.BOLD}[{timestamp}]{Colors.END} {color}[{name:8}]{Colors.END} {level_color}{level:5}{Colors.END} {message}", flush=True)
    except:
        print(f"[{timestamp}] [{name:8}] {level:5} {message}", flush=True)


def stream_output(process, name, color, should_run):
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
                print(f"{color}[{name:8}]{Colors.END} {line}", flush=True)
            except:
                print(f"[{name:8}] {line}", flush=True)
    except Exception as e:
        log(name, f"Output stream error: {e}", color, "ERROR")


class ProcessManager:
    def __init__(self, name, cmd, cwd, color, env=None):
        self.name = name
        self.cmd = cmd
        self.cwd = cwd
        self.color = color
        self.env = env or os.environ.copy()
        self.process = None
        self.should_run = True
        self.thread = None
    
    def start(self):
        self.should_run = True
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()
    
    def stop(self):
        self.should_run = False
        if self.process:
            try:
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/F', '/T', '/PID', str(self.process.pid)], capture_output=True, timeout=5)
                else:
                    self.process.terminate()
                    self.process.wait(timeout=5)
            except:
                try:
                    self.process.kill()
                except:
                    pass
            self.process = None
    
    def _run_loop(self):
        while self.should_run:
            try:
                log(self.name, f"Starting: {' '.join(self.cmd[:3])}...", self.color, "INFO")
                
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
                
                output_thread = threading.Thread(
                    target=stream_output,
                    args=(self.process, self.name, self.color, lambda: self.should_run),
                    daemon=True
                )
                output_thread.start()
                
                exit_code = self.process.wait()
                
                if self.should_run:
                    log(self.name, f"Process exited with code {exit_code}. Restarting in 3s...", self.color, "WARN")
                    time.sleep(3)
                
            except Exception as e:
                log(self.name, f"Error: {e}", self.color, "ERROR")
                time.sleep(3)


def check_certificates():
    """Check if SSL certificates exist"""
    cert_file = CERTS_DIR / "cert.pem"
    key_file = CERTS_DIR / "key.pem"
    
    if not cert_file.exists() or not key_file.exists():
        print(f"{Colors.RED}SSL certificates not found!{Colors.END}")
        print(f"Please generate them first by running:")
        print(f"  cd certs")
        print(f"  openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem -config openssl.cnf")
        return False
    
    print(f"{Colors.GREEN}SSL certificates found{Colors.END}")
    return True


def main():
    print(f"""
{Colors.BOLD}{Colors.CYAN}
  HAL - HTTPS Mode (for Mobile Voice)
  ====================================
{Colors.END}
  Backend:  {Colors.CYAN}https://192.168.1.29:8443{Colors.END}
  Frontend: {Colors.BLUE}https://192.168.1.29:3443{Colors.END}
  
  {Colors.YELLOW}NOTE: You will need to accept the self-signed certificate warning
  on your mobile browser when first connecting.{Colors.END}
  
  Default Login: {Colors.YELLOW}admin / admin123{Colors.END}
  
  Press {Colors.RED}Ctrl+C{Colors.END} to stop all services
{Colors.BOLD}{'='*50}{Colors.END}
""")
    
    if not check_certificates():
        input("\nPress Enter to exit...")
        sys.exit(1)
    
    managers = []
    running = True
    
    # Backend
    backend_env = os.environ.copy()
    if VENV_PYTHON.exists():
        venv_bin = VENV_PYTHON.parent
        backend_env["PATH"] = str(venv_bin) + os.pathsep + backend_env.get("PATH", "")
        backend_env["VIRTUAL_ENV"] = str(venv_bin.parent)
    
    managers.append(ProcessManager(
        name="Backend",
        cmd=BACKEND_CMD,
        cwd=BACKEND_DIR,
        color=Colors.CYAN,
        env=backend_env
    ))
    
    # Frontend
    managers.append(ProcessManager(
        name="Frontend",
        cmd=FRONTEND_CMD,
        cwd=FRONTEND_DIR,
        color=Colors.BLUE
    ))
    
    def signal_handler(sig, frame):
        nonlocal running
        print(f"\n{Colors.YELLOW}Shutting down...{Colors.END}")
        running = False
        for m in managers:
            m.stop()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    for manager in managers:
        manager.start()
        time.sleep(2)
    
    try:
        while running:
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    
    for m in managers:
        m.stop()


if __name__ == "__main__":
    main()
