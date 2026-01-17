# HAL TTS Integration

HAL includes text-to-speech (TTS) functionality using Microsoft Edge TTS. This allows AI responses to be read aloud.

## Features

- **No API key required** - Uses Microsoft Edge's free TTS service
- **Multiple voices** - Male/female voices in US, UK, and Australian accents
- **Audio caching** - Generated audio is cached to avoid regeneration
- **Per-chat toggle** - Enable/disable TTS for each chat individually

## Setup

TTS is included in the main HAL installation. Just install the requirements:

```bash
cd backend
pip install -r requirements.txt
```

The `edge-tts` package will be installed automatically.

## Usage

### Enable TTS for a Chat

1. Open a chat
2. Click the ⋮ menu in the chat header
3. Click "Enable TTS"

### Play Audio

Once TTS is enabled for a chat:
- A speaker icon (🔊) appears next to each AI response
- Click the icon to play the audio
- Click again to stop playback

### Available Voices

| Voice ID | Name | Gender | Locale |
|----------|------|--------|--------|
| en-US-GuyNeural | Guy (US) | Male | en-US |
| en-US-JennyNeural | Jenny (US) | Female | en-US |
| en-US-AriaNeural | Aria (US) | Female | en-US |
| en-US-DavisNeural | Davis (US) | Male | en-US |
| en-GB-SoniaNeural | Sonia (UK) | Female | en-GB |
| en-GB-RyanNeural | Ryan (UK) | Male | en-GB |
| en-AU-NatashaNeural | Natasha (AU) | Female | en-AU |
| en-AU-WilliamNeural | William (AU) | Male | en-AU |

## API Endpoints

### Check TTS Status
```
GET /api/tts/health
```

### List Available Voices
```
GET /api/tts/voices
```

### Generate Speech
```
POST /api/tts/generate
Content-Type: application/json

{
  "text": "Hello, world!",
  "voice_id": "en-US-GuyNeural",  // optional
  "use_cache": true               // optional, default true
}
```

Returns: Audio file (audio/mpeg)

## Configuration

### Cache Location

Audio files are cached in `backend/data/tts_cache/`. To clear the cache, delete files in this directory.

### Default Voice

The default voice is `en-US-GuyNeural`. This can be changed in `backend/app/services/tts_service.py`.

## Troubleshooting

### TTS shows "service offline"

1. Check that `edge-tts` is installed: `pip show edge-tts`
2. Restart HAL
3. Check the backend logs for errors

### Audio doesn't play

1. Check browser console for errors
2. Ensure your browser allows audio playback
3. Try a different browser
