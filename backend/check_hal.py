import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check_hal():
    client = AsyncIOMotorClient("mongodb://localhost:27017/")
    db = client.hal
    
    hal = await db.personas.find_one({"name": "HAL", "is_system": True})
    if hal:
        print("HAL Persona found:")
        print(f"  ID: {hal['_id']}")
        print(f"  is_default: {hal.get('is_default', 'NOT SET')}")
        print(f"  tools_enabled: {hal.get('tools_enabled', 'NOT SET')}")
        print(f"  model_override: {hal.get('model_override', 'None')}")
    else:
        print("HAL persona NOT FOUND")
    
    client.close()

asyncio.run(check_hal())
