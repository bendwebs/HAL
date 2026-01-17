@echo off
title HAL - Local AI System
cd /d "%~dp0"

REM Parse command line arguments
set HAL_ENABLE_TTS=0
:parse_args
if "%~1"=="" goto :done_args
if /i "%~1"=="--tts" set HAL_ENABLE_TTS=1
if /i "%~1"=="-t" set HAL_ENABLE_TTS=1
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
    echo.
) else (
    echo TTS Service: disabled (use --tts or -t to enable)
    echo.
)

REM Run the startup script
python start.py

pause
