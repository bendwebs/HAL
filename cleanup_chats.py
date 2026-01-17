import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

async def cleanup():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['hal']
    
    # Count before
    total_before = await db.chats.count_documents({})
    voice_before = await db.chats.count_documents({"title": "Voice Conversation"})
    print(f"Before cleanup:")
    print(f"  Total chats: {total_before}")
    print(f"  Voice Conversation chats: {voice_before}")
    
    # Find all Voice Conversation chats
    voice_chats = await db.chats.find({"title": "Voice Conversation"}).to_list(10000)
    
    deleted = 0
    kept = 0
    
    for chat in voice_chats:
        chat_id = chat["_id"]
        # Check message count
        msg_count = await db.messages.count_documents({"chat_id": chat_id})
        
        if msg_count == 0:
            # Delete empty chat
            await db.chats.delete_one({"_id": chat_id})
            deleted += 1
        else:
            kept += 1
            print(f"  Keeping chat {chat_id} with {msg_count} messages")
    
    print(f"\nCleanup complete:")
    print(f"  Deleted: {deleted} empty chats")
    print(f"  Kept: {kept} chats with messages")
    
    # Count after
    total_after = await db.chats.count_documents({})
    print(f"  Remaining total: {total_after}")
    
    client.close()

asyncio.run(cleanup())
