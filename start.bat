@echo off
title HAL - Local AI System
cd /d "%~dp0"

REM TTS is enabled by default, use --no-tts to disable
set HAL_ENABLE_TTS=1
:parse_args
if "%~1"=="" goto :done_args
if /i "%~1"=="--no-tts" set HAL_ENABLE_TTS=0
if /i "%~1"=="-n" set HAL_ENABLE_TTS=0
shift
goto :parse_args
:done_args

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

REM Show TTS status
if "%HAL_ENABLE_TTS%"=="1" (
    echo TTS Service: ENABLED
) else (
    echo TTS Service: disabled (remove --no-tts to enable)
)
echo.

REM Run the startup script
python start.py

pause
