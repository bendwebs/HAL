import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check_hal_prompt():
    client = AsyncIOMotorClient("mongodb://localhost:27017/")
    db = client.hal
    
    hal = await db.personas.find_one({"name": "HAL", "is_system": True})
    if hal:
        print("HAL System Prompt:")
        print("-" * 50)
        print(hal.get("system_prompt", "NO PROMPT SET"))
        print("-" * 50)
        print(f"\ntools_enabled: {hal.get('tools_enabled')}")
    else:
        print("HAL persona NOT FOUND")
    
    client.close()

asyncio.run(check_hal_prompt())
