import os
os.environ["MEM0_DIR"] = "E:\\Coding\\Hal\\backend\\data\\mem0_test"
os.environ["MEM0_TELEMETRY"] = "false"

# Delete test directories
import shutil
if os.path.exists("E:\\Coding\\Hal\\backend\\data\\mem0_test"):
    shutil.rmtree("E:\\Coding\\Hal\\backend\\data\\mem0_test")
if os.path.exists("E:\\Coding\\Hal\\backend\\data\\qdrant_test"):
    shutil.rmtree("E:\\Coding\\Hal\\backend\\data\\qdrant_test")

from mem0 import Memory

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
            "embedding_dims": 768,
        }
    },
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "collection_name": "test_memories",
            "path": "E:\\Coding\\Hal\\backend\\data\\qdrant_test",
            "embedding_model_dims": 768,
        }
    },
    "version": "v1.1"
}

print("Creating Memory instance...")
try:
    m = Memory.from_config(config)
    print("Memory created successfully!")
    
    # Check the actual embedder model
    print(f"Embedder model: {m.embedding_model.config.model}")
    print(f"Embedder dims config: {m.embedding_model.config.embedding_dims}")
    
    # Test embedding
    test_embed = m.embedding_model.embed("test")
    print(f"Actual embedding dimensions: {len(test_embed)}")
    
    print("\nAdding a test memory...")
    result = m.add("My name is Steve and I am a software engineer", user_id="test_user")
    print(f"Add result: {result}")
    
    print("\nSearching memories...")
    search = m.search("What is my name?", user_id="test_user")
    print(f"Search result: {search}")
    
except Exception as e:
    import traceback
    print(f"Error: {e}")
    traceback.print_exc()
finally:
    # Cleanup
    import time
    time.sleep(1)
    if os.path.exists("E:\\Coding\\Hal\\backend\\data\\qdrant_test"):
        try:
            shutil.rmtree("E:\\Coding\\Hal\\backend\\data\\qdrant_test")
        except:
            pass
    if os.path.exists("E:\\Coding\\Hal\\backend\\data\\mem0_test"):
        try:
            shutil.rmtree("E:\\Coding\\Hal\\backend\\data\\mem0_test")
        except:
            pass
