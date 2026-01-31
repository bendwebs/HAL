"""
Script to update HAL for default persona support
Run from backend directory: python apply_default_persona_updates.py
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

async def update_database():
    """Update the HAL persona to be the default"""
    client = AsyncIOMotorClient("mongodb://localhost:27017/")
    db = client.hal
    
    # Update HAL persona to be the default
    result = await db.personas.update_one(
        {"is_system": True, "name": "HAL"},
        {"$set": {"is_default": True}}
    )
    
    if result.modified_count > 0:
        print("[OK] HAL persona marked as default")
    elif result.matched_count > 0:
        print("[INFO] HAL persona already has is_default field")
    else:
        print("[WARN] HAL persona not found - will be created on next startup")
    
    # Ensure only one persona is default
    await db.personas.update_many(
        {"is_system": True, "name": {"$ne": "HAL"}},
        {"$set": {"is_default": False}}
    )
    
    print("[OK] Ensured only HAL is marked as default")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(update_database())
    print("\n[DONE] Database update complete!")
    print("   Now run: python update_default_persona.py")
    print("   Then restart the backend server")
