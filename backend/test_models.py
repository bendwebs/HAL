import requests

# Test mxbai-embed-large dimensions
response = requests.post(
    "http://localhost:11434/api/embeddings",
    json={"model": "mxbai-embed-large", "prompt": "test"}
)
data = response.json()
print(f"mxbai-embed-large dimensions: {len(data['embedding'])}")

# Test nomic-embed-text dimensions
response = requests.post(
    "http://localhost:11434/api/embeddings",
    json={"model": "nomic-embed-text", "prompt": "test"}
)
data = response.json()
print(f"nomic-embed-text dimensions: {len(data['embedding'])}")
