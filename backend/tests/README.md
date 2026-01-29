# HAL Backend Tests

## Directory Structure

```
tests/
├── diagnostics/     # Quick diagnostic scripts for debugging
│   ├── check_db.py           # MongoDB connection & query test
│   ├── check_torch.py        # PyTorch/CUDA verification
│   ├── test_config.py        # Config loading test
│   ├── test_embed.py         # Embedding generation test
│   ├── test_gpu.py           # GPU availability check
│   ├── test_mem0.py          # Mem0 memory system test
│   ├── test_piper.py         # Piper TTS import test
│   ├── test_qdrant_collections.py  # Qdrant vector DB test
│   └── test_sd.py            # Stable Diffusion API test
└── README.md
```

## Running Diagnostics

From the `backend/` directory with venv activated:

```bash
# Check GPU/CUDA
python tests/diagnostics/check_torch.py
python tests/diagnostics/test_gpu.py

# Check database
python tests/diagnostics/check_db.py

# Check AI services
python tests/diagnostics/test_mem0.py
python tests/diagnostics/test_embed.py
python tests/diagnostics/test_sd.py

# Check TTS
python tests/diagnostics/test_piper.py
```

## Future: Unit Tests

Unit tests will be added here using pytest:

```
tests/
├── unit/
│   ├── test_auth.py
│   ├── test_chat.py
│   └── ...
└── integration/
    └── ...
```
