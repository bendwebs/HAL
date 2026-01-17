"""Diagnose memory system status"""
import sys
sys.path.insert(0, 'E:\\Coding\\Hal\\backend')
import os
import asyncio

# Set environment before importing
os.environ["MEM0_DIR"] = "E:\\Coding\\Hal\\backend\\data\\mem0"
os.environ["MEM0_TELEMETRY"] = "false"

# Change to backend directory for relative paths
os.chdir('E:\\Coding\\Hal\\backend')

async def main():
    print("=" * 50)
    print("HAL Memory System Diagnostic")
    print("=" * 50)
    
    # Import and check memory system
    from app.services.memory_system import get_memory_system
    
    memory_system = get_memory_system()
    
    print(f"\n1. Memory system available: {memory_system.is_available}")
    print(f"2. Init error (if any): {memory_system._init_error}")
    
    if memory_system.is_available:
        print("\n3. Testing memory extraction...")
        
        test_messages = [
            {"role": "user", "content": "Hi, my name is TestUser and I work at TestCompany"},
            {"role": "assistant", "content": "Hello TestUser! Nice to meet you. How can I help you today?"}
        ]
        
        result = await memory_system.extract_memories(
            user_id="test_diagnostic_user",
            messages=test_messages,
            metadata={"chat_id": "test"}
        )
        
        print(f"   Extraction result: {result}")
        
        print("\n4. Testing direct memory add...")
        add_result = await memory_system.add_memory(
            user_id="test_diagnostic_user",
            content="TestUser works at TestCompany",
            metadata={"source": "diagnostic"}
        )
        print(f"   Add result: {add_result}")
        
        print("\n5. Testing memory search...")
        search_result = await memory_system.search_memories(
            user_id="test_diagnostic_user",
            query="Where does TestUser work?",
            limit=5
        )
        print(f"   Search result: {search_result}")
        
        print("\n6. Getting all memories for test user...")
        all_memories = await memory_system.get_all_memories(
            user_id="test_diagnostic_user",
            limit=10
        )
        print(f"   All memories: {all_memories}")
        
    else:
        print("\n[ERROR] Memory system is NOT available!")
        print("Check the init error above for details.")

if __name__ == "__main__":
    asyncio.run(main())
