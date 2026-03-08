"""
HAL 2.0 - Unified Startup Script
Manages frontend + backend with LAN auto-discovery and optional HTTPS
"""

import subprocess
import sys
import time
import signal
import threading
import os
import socket
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

RESTART_DELAY = 3
MAX_RESTART_ATTEMPTS = 10
RESTART_WINDOW = 60

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
    DIM = '\033[2m'

if os.name == 'nt':
    os.system('color')
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    except:
        pass


def get_lan_ip():
    """Auto-detect the LAN IP address"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def has_ssl_certs():
    """Check if SSL certificates exist"""
    return (CERTS_DIR / "cert.pem").exists() and (CERTS_DIR / "key.pem").exists()


def log(name, message, color=Colors.END, level="INFO"):
    timestamp = datetime.now().strftime("%H:%M:%S")
    level_colors = {"INFO": Colors.GREEN, "WARN": Colors.YELLOW, "ERROR": Colors.RED, "DEBUG": Colors.CYAN}
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

    def start(self):
        self.should_run = True
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.should_run = False
        if self.process:
            log(self.name, "Stopping...", self.color, "WARN")
            try:
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/F', '/T', '/PID', str(self.process.pid)],
                                   capture_output=True, timeout=5)
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
            if time.time() - self.last_restart_reset > RESTART_WINDOW:
                self.restart_count = 0
                self.last_restart_reset = time.time()

            if self.restart_count >= MAX_RESTART_ATTEMPTS:
                log(self.name, f"Max restarts ({MAX_RESTART_ATTEMPTS}) exceeded. Waiting {RESTART_WINDOW}s...", self.color, "ERROR")
                time.sleep(RESTART_WINDOW)
                self.restart_count = 0
                self.last_restart_reset = time.time()

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
                    self.restart_count += 1
                    log(self.name, f"Exited (code {exit_code}). Restarting in {RESTART_DELAY}s... ({self.restart_count}/{MAX_RESTART_ATTEMPTS})", self.color, "WARN")
                    time.sleep(RESTART_DELAY)

            except FileNotFoundError:
                log(self.name, f"Command not found: {self.cmd[0]}", self.color, "ERROR")
                self.restart_count += 1
                time.sleep(RESTART_DELAY)
            except Exception as e:
                log(self.name, f"Error: {e}", self.color, "ERROR")
                self.restart_count += 1
                time.sleep(RESTART_DELAY)


def check_prerequisites():
    """Check required tools and directories"""
    errors = []

    def ok(msg):
        try: print(f"  {Colors.GREEN}[OK]{Colors.END}   {msg}", flush=True)
        except: print(f"  [OK]   {msg}", flush=True)

    def warn(msg):
        try: print(f"  {Colors.YELLOW}[WARN]{Colors.END} {msg}", flush=True)
        except: print(f"  [WARN] {msg}", flush=True)

    def err(msg):
        try: print(f"  {Colors.RED}[ERR]{Colors.END}  {msg}", flush=True)
        except: print(f"  [ERR]  {msg}", flush=True)

    if BACKEND_DIR.exists():
        ok("Backend directory")
    else:
        err(f"Backend directory not found: {BACKEND_DIR}")
        errors.append(True)

    if FRONTEND_DIR.exists():
        ok("Frontend directory")
    else:
        err(f"Frontend directory not found: {FRONTEND_DIR}")
        errors.append(True)

    ok(f"Python {sys.version.split()[0]}")

    if VENV_PYTHON.exists():
        ok("Backend venv")
    else:
        warn("No venv - run: cd backend && python -m venv venv && pip install -r requirements.txt")

    if (FRONTEND_DIR / "node_modules").exists():
        ok("Frontend node_modules")
    else:
        warn("No node_modules - run: cd frontend && npm install")

    try:
        npm_cmd = "npm.cmd" if os.name == 'nt' else "npm"
        result = subprocess.run([npm_cmd, "--version"], capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            ok(f"npm {result.stdout.strip()}")
        else:
            err("npm not found")
            errors.append(True)
    except:
        err("npm not found - install Node.js 18+")
        errors.append(True)

    ssl = has_ssl_certs()
    if ssl:
        ok("SSL certificates (HTTPS enabled)")
    else:
        warn("No SSL certs - HTTPS disabled (HTTP-only mode, voice on mobile won't work)")

    print(flush=True)
    return len(errors) == 0, ssl


def main():
    lan_ip = get_lan_ip()
    ssl_available = has_ssl_certs()

    # Determine mode from CLI args
    use_https = "--https" in sys.argv or "-s" in sys.argv
    http_only = "--http" in sys.argv

    if use_https and not ssl_available:
        print(f"{Colors.RED}HTTPS requested but no SSL certs found!{Colors.END}")
        print(f"Generate certs: cd certs && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem")
        sys.exit(1)

    # Default: use HTTPS mode if certs exist, otherwise HTTP
    if not use_https and not http_only:
        use_https = ssl_available

    try:
        print(f"\n{Colors.BOLD}{Colors.CYAN}", flush=True)
        print(f"  HAL 2.0 - Local AI System", flush=True)
        print(f"  ========================={Colors.END}\n", flush=True)
    except:
        print("\n  HAL 2.0 - Local AI System")
        print("  =========================\n")

    # Prerequisites
    prereqs_ok, _ = check_prerequisites()
    if not prereqs_ok:
        print(f"\n{Colors.RED}Fix errors above before starting.{Colors.END}")
        input("\nPress Enter to exit...")
        sys.exit(1)

    # Build commands based on mode
    if use_https:
        backend_cmd = [PYTHON_EXE, "run_https.py"]
        frontend_cmd = ["npm.cmd" if os.name == "nt" else "npm", "run", "dev:https"]
    else:
        backend_cmd = [PYTHON_EXE, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
        frontend_cmd = ["npm.cmd" if os.name == "nt" else "npm", "run", "dev"]

    # Print access info
    try:
        print(f"  {Colors.BOLD}Access URLs:{Colors.END}", flush=True)
        print(f"  {Colors.DIM}{'─' * 44}{Colors.END}", flush=True)

        if use_https:
            print(f"  {Colors.CYAN}Local:{Colors.END}       https://localhost:3443", flush=True)
            print(f"  {Colors.GREEN}LAN:{Colors.END}         https://{lan_ip}:3443", flush=True)
            print(f"  {Colors.CYAN}Backend:{Colors.END}     https://{lan_ip}:8443", flush=True)
            print(f"  {Colors.CYAN}API Docs:{Colors.END}    https://{lan_ip}:8443/docs", flush=True)
        else:
            print(f"  {Colors.CYAN}Local:{Colors.END}       http://localhost:3000", flush=True)
            print(f"  {Colors.GREEN}LAN:{Colors.END}         http://{lan_ip}:3000", flush=True)
            print(f"  {Colors.CYAN}Backend:{Colors.END}     http://{lan_ip}:8000", flush=True)
            print(f"  {Colors.CYAN}API Docs:{Colors.END}    http://{lan_ip}:8000/docs", flush=True)

        print(f"  {Colors.DIM}{'─' * 44}{Colors.END}", flush=True)
        print(f"  {Colors.YELLOW}Login:{Colors.END}       admin / admin123", flush=True)
        print(f"  {Colors.DIM}Mode:{Colors.END}        {'HTTPS (voice-ready)' if use_https else 'HTTP (use --https for voice on mobile)'}", flush=True)

        if not use_https and ssl_available:
            print(f"  {Colors.DIM}Tip:{Colors.END}         SSL certs found - run with --https for mobile voice", flush=True)

        print(f"\n  {Colors.DIM}Any device on your Wi-Fi can connect via the LAN URL{Colors.END}", flush=True)
        print(f"  Press {Colors.RED}Ctrl+C{Colors.END} to stop\n", flush=True)
        print(f"  {Colors.BOLD}{'=' * 50}{Colors.END}\n", flush=True)
    except:
        if use_https:
            print(f"  Local:    https://localhost:3443")
            print(f"  LAN:      https://{lan_ip}:3443")
        else:
            print(f"  Local:    http://localhost:3000")
            print(f"  LAN:      http://{lan_ip}:3000")
        print(f"  Login:    admin / admin123")
        print(f"  Ctrl+C to stop\n")

    # Setup process managers
    managers = []

    backend_env = os.environ.copy()
    if VENV_PYTHON.exists():
        venv_bin = VENV_PYTHON.parent
        backend_env["PATH"] = str(venv_bin) + os.pathsep + backend_env.get("PATH", "")
        backend_env["VIRTUAL_ENV"] = str(venv_bin.parent)

    managers.append(ProcessManager(
        name="Backend",
        cmd=backend_cmd,
        cwd=BACKEND_DIR,
        color=Colors.CYAN,
        env=backend_env
    ))

    # Pass BACKEND_URL to frontend so proxy knows where to connect
    frontend_env = os.environ.copy()
    if use_https:
        frontend_env["BACKEND_URL"] = f"https://localhost:8443"
    else:
        frontend_env["BACKEND_URL"] = f"http://localhost:8000"

    managers.append(ProcessManager(
        name="Frontend",
        cmd=frontend_cmd,
        cwd=FRONTEND_DIR,
        color=Colors.BLUE,
        env=frontend_env
    ))

    # Signal handlers
    running = True

    def signal_handler(sig, frame):
        nonlocal running
        try:
            print(f"\n{Colors.YELLOW}Shutting down HAL...{Colors.END}", flush=True)
        except:
            print("\nShutting down HAL...")
        running = False
        for m in managers:
            m.stop()
        try:
            print(f"{Colors.GREEN}All services stopped.{Colors.END}", flush=True)
        except:
            print("All services stopped.")
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Start
    for manager in managers:
        manager.start()
        time.sleep(2)

    # Wait
    try:
        while running:
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass

    for m in managers:
        m.stop()


if __name__ == "__main__":
    main()
