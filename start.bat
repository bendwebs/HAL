@echo off
title HAL 2.0 - Local AI System
cd /d "%~dp0"

REM Activate venv if it exists
if exist "backend\venv\Scripts\activate.bat" (
    call backend\venv\Scripts\activate.bat
)

REM Pass any arguments through (e.g., --https)
python start.py %*

pause
