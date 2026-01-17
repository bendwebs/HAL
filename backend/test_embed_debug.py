import sys
sys.path.insert(0, 'E:\\Coding\\Hal\\backend')
import os
os.environ["MEM0_DIR"] = "E:\\Coding\\Hal\\backend\\data\\mem0"
os.environ["MEM0_TELEMETRY"] = "false"

# Test 1: Direct Ollama API
import requests
response = requests.post(
    "http://localhost:11434/api/embeddings",
    json={"model": "nomic-embed-text", "prompt": "test"}
)
data = response.json()
print(f"Direct Ollama API - nomic-embed-text dimensions: {len(data['embedding'])}")

# Test 2: Ollama Python client
from ollama import Client
client = Client(host="http://localhost:11434")
response = client.embeddings(model="nomic-embed-text", prompt="test")
print(f"Ollama Python client - nomic-embed-text dimensions: {len(response['embedding'])}")

# Test 3: Mem0's Ollama embedder
from mem0.embeddings.ollama import OllamaEmbedding
from mem0.configs.embeddings.base import BaseEmbedderConfig

config = BaseEmbedderConfig(
    model="nomic-embed-text",
    ollama_base_url="http://localhost:11434",
    embedding_dims=768
)
embedder = OllamaEmbedding(config)
print(f"Mem0 Ollama embedder config embedding_dims: {embedder.config.embedding_dims}")
embedding = embedder.embed("test")
print(f"Mem0 Ollama embedder actual dimensions: {len(embedding)}")
