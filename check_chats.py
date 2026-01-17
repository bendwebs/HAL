import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['hal']
    
    total = await db.chats.count_documents({})
    print(f"Total chats: {total}")
    
    voice_chats = await db.chats.count_documents({"title": "Voice Conversation"})
    print(f"Voice Conversation chats: {voice_chats}")
    
    # Show recent 10
    cursor = db.chats.find().sort("updated_at", -1).limit(10)
    print("\nRecent 10 chats:")
    async for chat in cursor:
        print(f"  - {chat.get('title', 'No title')} ({chat['_id']})")
    
    client.close()

asyncio.run(main())
