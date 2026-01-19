@echo off
title HAL - Local AI System
cd /d "%~dp0"

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo Python not found. Please install Python 3.11+
    pause
    exit /b 1
)

REM Activate venv if it exists
if exist "backend\venv\Scripts\activate.bat" (
    call backend\venv\Scripts\activate.bat
)

REM Default to HTTPS mode (required for mobile voice)
echo Starting HAL in HTTPS mode...
echo.
echo   Frontend: https://192.168.1.29:3443
echo   Backend:  https://192.168.1.29:8443
echo.
python start_https.py

pause
