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

REM Check for --https flag
if "%1"=="--https" goto https_mode
if "%1"=="-s" goto https_mode
if "%1"=="https" goto https_mode

REM Normal HTTP mode
echo Starting HAL in HTTP mode...
echo (Use 'start.bat --https' for mobile voice support)
echo.
python start.py
goto end

:https_mode
echo Starting HAL in HTTPS mode (for mobile voice)...
echo.
python start_https.py

:end
pause
