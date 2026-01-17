@echo off
REM HAL TTS Service - Standalone Startup Script
REM Use this to start TTS separately, or just use: start.bat (TTS enabled by default)

title HAL TTS Service
cd /d "%~dp0"

echo ================================================
echo HAL TTS Service (IndexTTS)
echo ================================================
echo.

REM Set paths - IndexTTS should be inside HAL folder
set INDEXTTS_PATH=%~dp0index-tts
set HAL_VOICE_SAMPLES=%~dp0backend\data\voices
set HAL_TTS_CACHE=%~dp0backend\data\tts_cache

REM Check if IndexTTS exists
if not exist "%INDEXTTS_PATH%" (
    echo ERROR: IndexTTS not found at %INDEXTTS_PATH%
    echo.
    echo Please install IndexTTS:
    echo   cd %~dp0
    echo   git clone https://github.com/index-tts/index-tts.git
    echo   cd index-tts
    echo   git lfs pull
    echo   pip install -U uv
    echo   uv sync --all-extras
    echo.
    pause
    exit /b 1
)

REM Create directories
if not exist "%HAL_VOICE_SAMPLES%" mkdir "%HAL_VOICE_SAMPLES%"
if not exist "%HAL_TTS_CACHE%" mkdir "%HAL_TTS_CACHE%"

REM Run TTS service using uv from IndexTTS directory
cd /d "%INDEXTTS_PATH%"
echo Starting TTS service on http://localhost:8001 ...
echo.
uv run python "%~dp0backend\app\services\tts_service.py"

pause
