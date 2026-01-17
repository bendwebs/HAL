import sys
sys.path.insert(0, 'E:\\Coding\\Hal\\backend')

from mem0 import Memory
import os

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
            "collection_name": "test_memories",
            "path": "./test_qdrant",
        }
    },
    "version": "v1.1"
}

print("Creating Memory instance...")
m = Memory.from_config(config)

print("Adding a test memory...")
result = m.add("My name is Steve and I am a software engineer", user_id="test_user")
print(f"Add result: {result}")

print("\nSearching memories...")
search = m.search("What is my name?", user_id="test_user")
print(f"Search result: {search}")

# Cleanup
import shutil
if os.path.exists("./test_qdrant"):
    shutil.rmtree("./test_qdrant")
