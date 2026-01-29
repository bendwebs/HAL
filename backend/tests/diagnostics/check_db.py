import asyncio
from pymongo import MongoClient
import json

client = MongoClient('mongodb://localhost:27017/')
db = client.hal

msg = db.messages.find_one(
    {'actions.name': 'generate_image'}, 
    sort=[('created_at', -1)]
)

if msg:
    print("Found message with generate_image action:")
    for action in msg.get('actions', []):
        if action.get('name') == 'generate_image':
            print(f"Action name: {action.get('name')}")
            print(f"Action status: {action.get('status')}")
            result = action.get('result')
            print(f"Result type: {type(result)}")
            if isinstance(result, dict):
                print(f"Result keys: {list(result.keys())}")
                print(f"Result 'type' field: {result.get('type')}")
                print(f"Result 'images' count: {len(result.get('images', []))}")
            else:
                print(f"Result value: {str(result)[:200] if result else None}...")
else:
    print("No messages with generate_image found")

client.close()
