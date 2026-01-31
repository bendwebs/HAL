import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check_recent_chat():
    client = AsyncIOMotorClient("mongodb://localhost:27017/")
    db = client.hal
    
    # Get most recent chat
    chat = await db.chats.find_one(sort=[("updated_at", -1)])
    if chat:
        print("Most Recent Chat:")
        print(f"  ID: {chat['_id']}")
        print(f"  Title: {chat.get('title', 'Untitled')}")
        print(f"  persona_id: {chat.get('persona_id', 'None')}")
        print(f"  enabled_tools: {chat.get('enabled_tools', 'NOT SET (will use defaults)')}")
        print(f"  model_override: {chat.get('model_override', 'None')}")
    else:
        print("No chats found")
    
    # Also check tools in database
    print("\n\nTools in database:")
    tools = await db.tools.find().to_list(100)
    for t in tools:
        print(f"  {t['name']}: permission_level={t.get('permission_level', 'NOT SET')}, default_enabled={t.get('default_enabled', 'NOT SET')}")
    
    client.close()

asyncio.run(check_recent_chat())
