"""Test Mem0 with ChromaDB configuration"""
import sys
sys.path.insert(0, 'E:\\Coding\\Hal\\backend')
import os

# Set environment before importing
os.environ["MEM0_DIR"] = "E:\\Coding\\Hal\\backend\\data\\mem0"
os.environ["MEM0_TELEMETRY"] = "false"

from mem0 import Memory

# ChromaDB storage path
chroma_path = "E:\\Coding\\Hal\\backend\\data\\chroma"
os.makedirs(chroma_path, exist_ok=True)

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
            "model": "mxbai-embed-large:latest",
            "ollama_base_url": "http://localhost:11434",
            "embedding_dims": 1024,
        }
    },
    "vector_store": {
        "provider": "chroma",
        "config": {
            "collection_name": "test_memories",
            "path": chroma_path,
        }
    },
    "version": "v1.1"
}

print("Initializing Mem0 with ChromaDB...")
try:
    m = Memory.from_config(config)
    print("[OK] Mem0 initialized successfully!")
    
    # Test adding a memory
    print("\nAdding test memory...")
    result = m.add("My name is Steve and I work as an AI Engineer", user_id="test_user")
    print(f"Add result: {result}")
    
    # Test searching
    print("\nSearching memories...")
    search = m.search("What is my name?", user_id="test_user")
    print(f"Search result: {search}")
    
    # Get all memories
    print("\nGetting all memories...")
    all_memories = m.get_all(user_id="test_user")
    print(f"All memories: {all_memories}")
    
    print("\n[OK] All tests passed!")
    
except Exception as e:
    print(f"[ERROR] Error: {e}")
    import traceback
    traceback.print_exc()
