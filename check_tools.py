import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check_tools():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['hal']
    tools = await db.tools.find().to_list(100)
    for t in tools:
        print(f"{t['name']}: permission_level={t.get('permission_level', 'NOT SET')}")
    client.close()

asyncio.run(check_tools())
