# HAL TTS Integration (Chatterbox)

HAL uses Chatterbox TTS for fully local text-to-speech. All audio generation runs on your GPU - no external API calls or internet required.

## Features

- **Fully Local** - Runs entirely on your machine using GPU
- **Voice Cloning** - Clone any voice with just 5-10 seconds of audio
- **Emotion Control** - Adjust expressiveness from monotone to dramatic
- **Fast Generation** - Turbo model for low-latency voice responses
- **Audio Caching** - Generated audio is cached to avoid regeneration

## Requirements

- **Python 3.11** (recommended for best compatibility)
- **NVIDIA GPU** with CUDA support (RTX 20 series or newer)
- **~4GB VRAM** for the Turbo model

## Setup

### 1. Install PyTorch with CUDA

First, install PyTorch with CUDA support:

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

For RTX 50 series (Blackwell), you may need a newer CUDA version:
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
```

### 2. Install Chatterbox TTS

```bash
pip install chatterbox-tts
```

Or install from the requirements:
```bash
cd backend
pip install -r requirements.txt
```

### 3. Verify Installation

Start the backend and check the TTS health endpoint:

```bash
curl http://localhost:8000/api/tts/health
```

Should return something like:
```json
{
  "status": "healthy",
  "device": "cuda",
  "gpu": "NVIDIA GeForce RTX 5070",
  "model_loaded": false,
  "turbo_available": true
}
```

## Usage

### Voice Conversation

1. Go to the Voice Conversation page (`/converse`)
2. Click the waveform to start listening
3. Speak your message - it auto-sends after a pause
4. HAL will respond with synthesized speech

### API Endpoints

#### Check TTS Status
```
GET /api/tts/health
```

#### List Available Voices
```
GET /api/tts/voices
```

#### Generate Speech
```
POST /api/tts/generate
Content-Type: application/json

{
  "text": "Hello, world!",
  "voice_id": "default",        // optional - voice sample ID
  "exaggeration": 0.5,          // 0.0-1.0, emotion intensity
  "cfg_weight": 0.5,            // 0.0-1.0, voice similarity
  "use_cache": true,            // optional, default true
  "use_turbo": true             // optional, use faster model
}
```

Returns: Audio file (audio/wav)

#### Upload Voice Sample
```
POST /api/tts/voices/upload?voice_id=my_voice
Content-Type: multipart/form-data

file: <audio file (5-10 seconds)>
```

#### Delete Voice Sample
```
DELETE /api/tts/voices/{voice_id}
```

## Voice Cloning

To clone a voice:

1. Record a 5-10 second audio clip of the voice you want to clone
2. Upload it via the API or place it in `backend/data/voice_samples/`
3. Use the voice ID when generating speech

**Tips for good voice samples:**
- Use clean audio with minimal background noise
- 5-10 seconds of natural speech works best
- Avoid music or sound effects
- WAV or MP3 format preferred

## Parameters

### Exaggeration (0.0 - 1.0)
Controls emotional intensity:
- `0.0` = Monotone, flat delivery
- `0.5` = Natural, balanced (default)
- `1.0` = Highly expressive, dramatic

### CFG Weight (0.0 - 1.0)
Controls how closely to follow the reference voice:
- Lower values = More creative interpretation
- Higher values = Closer to original voice
- `0.5` = Balanced (default)

**Note:** High exaggeration tends to speed up speech. Reduce cfg_weight to compensate for slower pacing.

## Troubleshooting

### TTS shows "service unavailable"

1. Check that `chatterbox-tts` is installed: `pip show chatterbox-tts`
2. Verify PyTorch CUDA: `python -c "import torch; print(torch.cuda.is_available())"`
3. Check GPU memory - Chatterbox needs ~4GB VRAM
4. Restart the backend server

### First generation is slow

The model loads on first use. Subsequent generations will be faster. The Turbo model is ~2-3x faster than the standard model.

### Out of memory errors

- Close other GPU applications
- Use the Turbo model (default) which uses less VRAM
- Reduce batch size if processing multiple texts

### Audio quality issues

- Try adjusting `exaggeration` and `cfg_weight` parameters
- Use a cleaner voice sample for cloning
- Ensure the voice sample is 5-10 seconds (not too short/long)

## Cache Location

Generated audio is cached in `backend/data/tts_cache/`. To clear the cache:

```bash
rm -rf backend/data/tts_cache/*
```

Voice samples are stored in `backend/data/voice_samples/`.
