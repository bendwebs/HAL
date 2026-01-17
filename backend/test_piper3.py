from piper import PiperVoice
import wave
import io

# Check synthesize signature
import inspect
print("synthesize signature:", inspect.signature(PiperVoice.synthesize))
print("synthesize_wav signature:", inspect.signature(PiperVoice.synthesize_wav) if hasattr(PiperVoice, 'synthesize_wav') else "N/A")
