import sys
sys.path.insert(0, 'E:\\Coding\\Hal\\backend')
import os
os.environ["MEM0_DIR"] = "E:\\Coding\\Hal\\backend\\data\\mem0"
os.environ["MEM0_TELEMETRY"] = "false"

from qdrant_client import QdrantClient

# Check main qdrant
path1 = "E:\\Coding\\Hal\\backend\\data\\qdrant"
if os.path.exists(path1):
    print(f"Checking {path1}...")
    client = QdrantClient(path=path1)
    collections = client.get_collections()
    for col in collections.collections:
        info = client.get_collection(col.name)
        print(f"  Collection: {col.name}, Vector size: {info.config.params.vectors.size}")
    client.close()
else:
    print(f"{path1} does not exist")

# Check mem0 qdrant
path2 = "E:\\Coding\\Hal\\backend\\data\\mem0"
if os.path.exists(path2):
    print(f"\nChecking {path2}...")
    for subdir in os.listdir(path2):
        subpath = os.path.join(path2, subdir)
        if os.path.isdir(subpath):
            print(f"  Found subdir: {subdir}")
            try:
                client = QdrantClient(path=subpath)
                collections = client.get_collections()
                for col in collections.collections:
                    info = client.get_collection(col.name)
                    print(f"    Collection: {col.name}, Vector size: {info.config.params.vectors.size}")
                client.close()
            except Exception as e:
                print(f"    Error: {e}")
else:
    print(f"{path2} does not exist")

# Check user home .mem0
path3 = os.path.expanduser("~/.mem0")
if os.path.exists(path3):
    print(f"\nWARNING: {path3} still exists!")
    for item in os.listdir(path3):
        print(f"  {item}")
