"""Memory System - Mem0 Integration for HAL

Uses the official mem0ai library for intelligent memory management.
Configured to work with local Ollama for LLM and embeddings.
"""

from __future__ import annotations
from typing import List, Dict, Any, Optional
from datetime import datetime
import os

from app.config import settings


def _get_mem0_config() -> dict:
    """Get Mem0 configuration for local Ollama setup"""
    return {
        "llm": {
            "provider": "ollama",
            "config": {
                "model": settings.default_chat_model,
                "temperature": 0.1,
                "max_tokens": 2000,
                "ollama_base_url": settings.ollama_base_url,
            }
        },
        "embedder": {
            "provider": "ollama", 
            "config": {
                "model": settings.default_embed_model,
                "ollama_base_url": settings.ollama_base_url,
            }
        },
        "vector_store": {
            "provider": "qdrant",
            "config": {
                "collection_name": "hal_memories",
                "path": os.path.join(settings.data_dir, "qdrant"),
            }
        },
        "version": "v1.1"
    }


class MemorySystem:
    """Mem0-powered memory system for HAL"""
    
    def __init__(self):
        self._memory = None
        self._init_error = None
        self._initialize()
    
    def _initialize(self):
        """Initialize Mem0 with local Ollama configuration"""
        try:
            from mem0 import Memory
            config = _get_mem0_config()
            self._memory = Memory.from_config(config)
            print(f"[OK] Mem0 initialized with Ollama ({settings.default_chat_model})")
        except ImportError as e:
            self._init_error = f"mem0ai not installed: {e}"
            print(f"[WARN] Mem0 not available: {self._init_error}")
        except Exception as e:
            self._init_error = str(e)
            print(f"[WARN] Mem0 initialization failed: {self._init_error}")
    
    @property
    def is_available(self) -> bool:
        """Check if Mem0 is properly initialized"""
        return self._memory is not None
    
    async def add_memory(self, user_id: str, content: str, metadata: Optional[Dict[str, Any]] = None):
        """Add a memory for a user"""
        if not self.is_available:
            return None
        
        try:
            result = self._memory.add(content, user_id=user_id, metadata=metadata or {})
            return result
        except Exception as e:
            print(f"Error adding memory: {e}")
            return None
    
    async def add_conversation(self, user_id: str, messages: List[Dict[str, str]], metadata: Optional[Dict[str, Any]] = None):
        """Add memories from a conversation"""
        if not self.is_available:
            return None
        
        try:
            result = self._memory.add(messages, user_id=user_id, metadata=metadata or {})
            return result
        except Exception as e:
            print(f"Error adding conversation memories: {e}")
            return None
    
    async def search_memories(self, user_id: str, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search memories by semantic similarity"""
        if not self.is_available:
            return []
        
        try:
            results = self._memory.search(query, user_id=user_id, limit=limit)
            
            memories = []
            for r in results.get("results", []):
                memories.append({
                    "id": r.get("id", ""),
                    "content": r.get("memory", ""),
                    "score": r.get("score", 0.0),
                    "metadata": r.get("metadata", {}),
                    "created_at": r.get("created_at", ""),
                    "categories": r.get("categories", [])
                })
            
            return memories
        except Exception as e:
            print(f"Error searching memories: {e}")
            return []
    
    async def get_all_memories(self, user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Get all memories for a user"""
        if not self.is_available:
            return []
        
        try:
            results = self._memory.get_all(user_id=user_id, limit=limit)
            
            memories = []
            for r in results.get("results", []):
                memories.append({
                    "id": r.get("id", ""),
                    "content": r.get("memory", ""),
                    "metadata": r.get("metadata", {}),
                    "created_at": r.get("created_at", ""),
                    "updated_at": r.get("updated_at", ""),
                    "categories": r.get("categories", [])
                })
            
            return memories
        except Exception as e:
            print(f"Error getting memories: {e}")
            return []
    
    async def get_memory(self, memory_id: str):
        """Get a specific memory by ID"""
        if not self.is_available:
            return None
        
        try:
            result = self._memory.get(memory_id)
            if result:
                return {
                    "id": result.get("id", ""),
                    "content": result.get("memory", ""),
                    "metadata": result.get("metadata", {}),
                    "created_at": result.get("created_at", ""),
                    "updated_at": result.get("updated_at", ""),
                    "categories": result.get("categories", [])
                }
            return None
        except Exception as e:
            print(f"Error getting memory: {e}")
            return None
    
    async def update_memory(self, memory_id: str, content: str):
        """Update an existing memory"""
        if not self.is_available:
            return None
        
        try:
            result = self._memory.update(memory_id, content)
            return result
        except Exception as e:
            print(f"Error updating memory: {e}")
            return None
    
    async def delete_memory(self, memory_id: str) -> bool:
        """Delete a memory"""
        if not self.is_available:
            return False
        
        try:
            self._memory.delete(memory_id)
            return True
        except Exception as e:
            print(f"Error deleting memory: {e}")
            return False
    
    async def delete_all_memories(self, user_id: str) -> bool:
        """Delete all memories for a user"""
        if not self.is_available:
            return False
        
        try:
            self._memory.delete_all(user_id=user_id)
            return True
        except Exception as e:
            print(f"Error deleting all memories: {e}")
            return False
    
    def get_history(self, memory_id: str) -> list:
        """Get history of a memory"""
        if not self.is_available:
            return []
        
        try:
            return self._memory.history(memory_id)
        except Exception as e:
            print(f"Error getting memory history: {e}")
            return []


# Singleton instance
_system = None


def get_memory_system() -> MemorySystem:
    """Get the singleton memory system instance"""
    global _system
    if _system is None:
        _system = MemorySystem()
    return _system