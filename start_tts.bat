@echo off
REM HAL TTS Service Startup Script

echo Starting IndexTTS Service for HAL...
echo.

REM Set paths
set INDEXTTS_PATH=E:\Coding\index-tts
set HAL_VOICE_SAMPLES=E:\Coding\Hal\backend\data\voices
set HAL_TTS_CACHE=E:\Coding\Hal\backend\data\tts_cache

REM Create directories
if not exist "%HAL_VOICE_SAMPLES%" mkdir "%HAL_VOICE_SAMPLES%"
if not exist "%HAL_TTS_CACHE%" mkdir "%HAL_TTS_CACHE%"

REM Activate IndexTTS environment and run service
cd /d %INDEXTTS_PATH%

REM Use uv to run the TTS service
echo Running TTS service on port 8001...
uv run python E:\Coding\Hal\backend\app\services\tts_service.py

pause
