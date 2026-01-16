# HAL - Local AI System Startup Script (PowerShell)
# Run with: .\start.ps1

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "`n  HAL - Local AI System Startup" -ForegroundColor Cyan
Write-Host "  ================================`n" -ForegroundColor Cyan

# Check Python
try {
    $pythonVersion = python --version 2>&1
    Write-Host "  [OK] Python: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Python not found. Please install Python 3.11+" -ForegroundColor Red
    exit 1
}

# Check Node.js
try {
    $nodeVersion = node --version 2>&1
    Write-Host "  [OK] Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Node.js not found. Please install Node.js 18+" -ForegroundColor Red
    exit 1
}

# Check backend venv
$venvPath = Join-Path $ScriptDir "backend\venv\Scripts\Activate.ps1"
if (Test-Path $venvPath) {
    Write-Host "  [OK] Backend venv found" -ForegroundColor Green
    & $venvPath
} else {
    Write-Host "  [WARN] Backend venv not found. Creating..." -ForegroundColor Yellow
    Set-Location (Join-Path $ScriptDir "backend")
    python -m venv venv
    & ".\venv\Scripts\Activate.ps1"
    pip install -r requirements.txt
    Set-Location $ScriptDir
}

# Check frontend node_modules
$nodeModules = Join-Path $ScriptDir "frontend\node_modules"
if (Test-Path $nodeModules) {
    Write-Host "  [OK] Frontend node_modules found" -ForegroundColor Green
} else {
    Write-Host "  [WARN] Frontend node_modules not found. Installing..." -ForegroundColor Yellow
    Set-Location (Join-Path $ScriptDir "frontend")
    npm install
    Set-Location $ScriptDir
}

Write-Host "`n  Starting HAL...`n" -ForegroundColor Cyan

# Run the Python startup script
python start.py
