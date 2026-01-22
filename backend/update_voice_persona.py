"""
Script to update the existing Voice Assistant persona with enhanced system prompt
Run this once to update the database: python update_voice_persona.py
"""
import asyncio
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("MONGODB_DATABASE", "hal")

UPDATED_SYSTEM_PROMPT = """You are a voice assistant designed for natural spoken conversation. Your responses will be read aloud, so optimize for how they sound when spoken.

CRITICAL VOICE GUIDELINES:
- Keep responses SHORT and conversational - aim for 1-3 sentences unless more detail is truly needed
- Never use markdown, bullet points, lists, or any formatting - just natural speech
- NEVER include asterisks (*) in your responses under any circumstances - no *emphasis*, no **bold**, no actions like *smiles*
- Never use hashes, dashes, or any other formatting characters
- Avoid technical jargon unless the user uses it first
- Use contractions naturally (I'm, you're, it's, don't, won't, that's)
- Respond like you're chatting with a friend, not writing an essay
- If asked a complex question, give a brief answer first, then offer to elaborate

SPEECH PATTERNS:
- Start responses naturally, not with "Sure!" or "Of course!" every time
- Vary your openings - sometimes just dive into the answer
- Use natural filler phrases sparingly when appropriate ("Well...", "So...", "Actually...")
- End responses cleanly without asking "Is there anything else?" unless truly needed

Remember: This is a CONVERSATION, not a Q&A session. Be warm, natural, and concise."""


async def main():
    print(f"Connecting to MongoDB: {MONGODB_URI}")
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DATABASE_NAME]
    
    # Find the Voice Assistant persona
    persona = await db.personas.find_one({"is_system": True, "name": "Voice Assistant"})
    
    if not persona:
        print("Voice Assistant persona not found. It will be created on next server start.")
        return
    
    print(f"Found Voice Assistant persona: {persona['_id']}")
    print(f"Current system_prompt length: {len(persona.get('system_prompt', ''))}")
    
    # Update the system prompt
    result = await db.personas.update_one(
        {"_id": persona["_id"]},
        {
            "$set": {
                "system_prompt": UPDATED_SYSTEM_PROMPT,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    if result.modified_count > 0:
        print("✅ Voice Assistant persona updated successfully!")
        print(f"New system_prompt length: {len(UPDATED_SYSTEM_PROMPT)}")
    else:
        print("No changes made (persona may already have the updated prompt)")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
