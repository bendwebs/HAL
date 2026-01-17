"""Test mem0 import"""
try:
    from mem0 import Memory
    print("SUCCESS: mem0.Memory imported successfully")
    
    # Try to create a simple config
    config = {
        "llm": {
            "provider": "ollama",
            "config": {
                "model": "qwen2.5:7b",
                "temperature": 0.1,
                "max_tokens": 2000,
                "ollama_base_url": "http://localhost:11434",
            }
        },
        "embedder": {
            "provider": "ollama", 
            "config": {
                "model": "nomic-embed-text",
                "ollama_base_url": "http://localhost:11434",
            }
        },
        "vector_store": {
            "provider": "qdrant",
            "config": {
                "collection_name": "hal_memories",
                "path": "./data/qdrant",
            }
        },
        "version": "v1.1"
    }
    
    print("Attempting to initialize Memory...")
    m = Memory.from_config(config)
    print("SUCCESS: Memory initialized")
    
except ImportError as e:
    print(f"IMPORT ERROR: {e}")
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
