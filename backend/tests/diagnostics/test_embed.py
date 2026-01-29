import requests
import json

# Test embedding dimensions
response = requests.post(
    "http://localhost:11434/api/embeddings",
    json={"model": "nomic-embed-text", "prompt": "test"}
)
data = response.json()
if "embedding" in data:
    print(f"Embedding dimensions: {len(data['embedding'])}")
else:
    print(f"Error: {data}")
