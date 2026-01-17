# HAL TTS Integration (IndexTTS)

## Overview
Text-to-Speech integration using IndexTTS2 for reading AI responses aloud.

## Components Added

### Backend
- `app/services/tts_service.py` - Standalone TTS service that wraps IndexTTS2
- `app/routers/tts.py` - API proxy endpoints for TTS operations
- Updated `app/main.py` - Added TTS router
- Updated `app/models/chat.py` - Added `tts_enabled` and `tts_voice_id` fields

### Frontend
- `components/chat/TTSButton.tsx` - Speaker button component
- Updated `components/chat/ChatMessage.tsx` - Added TTS button to messages
- Updated `components/chat/ChatHeader.tsx` - Added TTS toggle in chat menu
- Updated `lib/api.ts` - Added TTS API client
- Updated `types/index.ts` - Added TTS fields to Chat type

## Setup Instructions

### 1. Install IndexTTS
```bash
git clone https://github.com/index-tts/index-tts.git
cd index-tts
git lfs pull
pip install -U uv
uv sync --all-extras
```

### 2. Download Models
```bash
uv tool install "huggingface-hub[cli,hf_xet]"
hf download IndexTeam/IndexTTS-2 --local-dir=checkpoints
```

### 3. Add Voice Samples
Place `.wav` files in: `E:\Coding\Hal\backend\data\voices\`
These will appear in the voice selection.

### 4. Start Services
```bash
# Terminal 1: Start HAL (main backend + frontend)
cd E:\Coding\Hal
start.bat

# Terminal 2: Start TTS Service (requires GPU)
cd E:\Coding\Hal
start_tts.bat
```

## Usage

1. Open any chat in HAL
2. Click the ⋮ menu in the chat header
3. Select "Enable TTS"
4. A 🔊 speaker icon will appear next to each assistant message
5. Click the speaker icon to hear the response read aloud

## Configuration

Environment variables for TTS service:
- `INDEXTTS_PATH` - Path to IndexTTS installation (default: `E:\Coding\index-tts`)
- `HAL_VOICE_SAMPLES` - Path to custom voice samples (default: `E:\Coding\Hal\backend\data\voices`)
- `HAL_TTS_CACHE` - Path to cache generated audio (default: `E:\Coding\Hal\backend\data\tts_cache`)
- `TTS_SERVICE_URL` - URL of TTS service (default: `http://localhost:8001`)

## API Endpoints

- `GET /api/tts/health` - Check TTS service status
- `GET /api/tts/voices` - List available voices
- `POST /api/tts/generate` - Generate speech from text
  ```json
  {
    "text": "Hello world",
    "voice_id": "voice_01.wav",
    "use_cache": true
  }
  ```

## Notes

- TTS runs as a separate service (port 8001) due to GPU/memory requirements
- Audio is cached to avoid regenerating the same text
- Works with both IndexTTS1 and IndexTTS2 voices
- FP16 mode is enabled by default for lower VRAM usage
