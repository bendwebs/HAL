"""Test memory extraction with the new prompt"""
import sys
sys.path.insert(0, 'E:\\Coding\\Hal\\backend')
import os
import asyncio

os.environ["MEM0_DIR"] = "E:\\Coding\\Hal\\backend\\data\\mem0"
os.environ["MEM0_TELEMETRY"] = "false"
os.chdir('E:\\Coding\\Hal\\backend')

async def main():
    from app.services.memory_system import get_memory_system
    
    ms = get_memory_system()
    print(f"Memory system available: {ms.is_available}")
    
    test_messages = [
        {"role": "user", "content": "My name is Steve. Remember that"},
        {"role": "assistant", "content": "Of course, Steve! It's nice to meet you."}
    ]
    
    print(f"\nTest messages: {test_messages}")
    print("\nExtracting memories...")
    
    result = await ms.extract_memories(
        user_id="test_user",
        messages=test_messages,
        metadata={"chat_id": "test"}
    )
    
    print(f"\nExtraction result: {result}")

if __name__ == "__main__":
    asyncio.run(main())
