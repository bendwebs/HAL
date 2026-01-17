"""Memory System - Mem0 Integration for HAL

Uses the official mem0ai library for intelligent memory management.
Configured to work with local Ollama for LLM and embeddings.
Uses ChromaDB for local vector storage.
"""

from __future__ import annotations
from typing import List, Dict, Any, Optional
from datetime import datetime
import os

from app.config import settings

# Set MEM0_DIR to keep all data within the HAL project folder
os.environ["MEM0_DIR"] = os.path.join(settings.data_dir, "mem0")
# Disable Mem0 telemetry
os.environ["MEM0_TELEMETRY"] = "false"


def _get_mem0_config() -> dict:
    """Get Mem0 configuration for local Ollama + ChromaDB setup"""
    # ChromaDB storage path
    chroma_path = os.path.join(settings.data_dir, "chroma")
    os.makedirs(chroma_path, exist_ok=True)
    
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
                "embedding_dims": 1024,  # mxbai-embed-large dimensions
            }
        },
        "vector_store": {
            "provider": "chroma",
            "config": {
                "collection_name": "hal_memories",
                "path": chroma_path,
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
        """Initialize Mem0 with local Ollama + ChromaDB configuration"""
        try:
            from mem0 import Memory
            config = _get_mem0_config()
            print(f"[DEBUG] Mem0 config: {config}")
            self._memory = Memory.from_config(config)
            
            # Debug: Check actual embedder configuration
            print(f"[DEBUG] Embedder model: {self._memory.embedding_model.config.model}")
            print(f"[DEBUG] Embedder dims: {self._memory.embedding_model.config.embedding_dims}")
            
            # Test embedding
            test_embed = self._memory.embedding_model.embed("test")
            print(f"[DEBUG] Test embedding dimensions: {len(test_embed)}")
            
            print(f"[OK] Mem0 initialized with Ollama ({settings.default_chat_model}) + ChromaDB vector store")
        except ImportError as e:
            self._init_error = f"mem0ai not installed: {e}"
            print(f"[WARN] Mem0 not available: {self._init_error}")
        except Exception as e:
            self._init_error = str(e)
            print(f"[WARN] Mem0 initialization failed: {self._init_error}")
            import traceback
            traceback.print_exc()
    
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

    async def find_duplicates(self, user_id: str, threshold: float = 0.85) -> Dict[str, Any]:
        """Find duplicate/similar memories using semantic similarity
        
        Returns groups of similar memories that could be consolidated.
        """
        if not self.is_available:
            return {"groups": [], "total_duplicates": 0}
        
        try:
            # Get all memories
            all_memories = await self.get_all_memories(user_id, limit=500)
            
            if len(all_memories) < 2:
                return {"groups": [], "total_duplicates": 0}
            
            # Get embeddings for all memories
            embeddings = []
            for mem in all_memories:
                emb = self._memory.embedding_model.embed(mem["content"])
                embeddings.append(emb)
            
            # Find similar pairs using cosine similarity
            import numpy as np
            
            def cosine_similarity(a, b):
                a = np.array(a)
                b = np.array(b)
                return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
            
            # Build groups of similar memories
            processed = set()
            groups = []
            
            for i in range(len(all_memories)):
                if i in processed:
                    continue
                    
                group = [all_memories[i]]
                processed.add(i)
                
                for j in range(i + 1, len(all_memories)):
                    if j in processed:
                        continue
                    
                    sim = cosine_similarity(embeddings[i], embeddings[j])
                    if sim >= threshold:
                        group.append(all_memories[j])
                        processed.add(j)
                
                if len(group) > 1:
                    # Calculate average similarity within group
                    sims = []
                    for k in range(len(group)):
                        for l in range(k + 1, len(group)):
                            idx_k = all_memories.index(group[k])
                            idx_l = all_memories.index(group[l])
                            sims.append(cosine_similarity(embeddings[idx_k], embeddings[idx_l]))
                    
                    avg_sim = sum(sims) / len(sims) if sims else 0
                    
                    groups.append({
                        "memories": [
                            {"id": m["id"], "content": m["content"]} 
                            for m in group
                        ],
                        "similarity": round(avg_sim, 3),
                        "suggested_merge": self._suggest_merge(group)
                    })
            
            total_duplicates = sum(len(g["memories"]) - 1 for g in groups)
            
            return {
                "groups": groups,
                "total_duplicates": total_duplicates,
                "total_memories": len(all_memories)
            }
            
        except Exception as e:
            print(f"Error finding duplicates: {e}")
            import traceback
            traceback.print_exc()
            return {"groups": [], "total_duplicates": 0, "error": str(e)}
    
    def _suggest_merge(self, memories: List[Dict[str, Any]]) -> str:
        """Suggest a merged content for similar memories"""
        # For now, return the longest one as suggestion
        # In future, could use LLM to merge intelligently
        contents = [m["content"] for m in memories]
        return max(contents, key=len)

    async def extract_memories(self, user_id: str, messages: List[Dict[str, str]], metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Extract potential memories from conversation WITHOUT saving them.
        
        Uses the LLM to identify facts worth remembering, but returns them
        for user confirmation before saving.
        """
        if not self.is_available:
            return {"pending": []}
        
        try:
            from app.services.ollama_client import get_ollama_client
            ollama = get_ollama_client()
            
            # Format conversation for analysis
            conversation_text = "\n".join([
                f"{m['role'].upper()}: {m['content']}" 
                for m in messages
            ])
            
            extraction_prompt = f"""You are a memory extraction assistant. Your job is to identify facts about the USER from conversations that should be remembered.

CONVERSATION:
{conversation_text}

TASK: Extract any personal facts the user has shared about themselves. Look for:
- Their name (e.g., "My name is X" or "I'm X" or "Call me X")
- Their job/profession
- Where they live or work
- Their preferences, likes, or dislikes
- Projects they're working on
- Any other personal information

IMPORTANT: If the user states their name, that IS a fact to extract. "My name is Steve" should result in {{"facts": ["User's name is Steve"]}}

Return ONLY a JSON object with extracted facts. Include at least one fact if ANY personal information was shared.

Examples:
- User says "My name is John" → {{"facts": ["User's name is John"]}}
- User says "I work at Google" → {{"facts": ["User works at Google"]}}
- User says "Hello" → {{"facts": []}}

Now extract facts from the conversation above. Respond with ONLY the JSON object, nothing else:"""""

            response = await ollama.chat(
                model=settings.default_chat_model,
                messages=[{"role": "user", "content": extraction_prompt}]
            )
            
            response_text = response.get("message", {}).get("content", "").strip()
            print(f"[DEBUG] Memory extraction raw response: {response_text[:500]}")
            
            # Parse JSON response
            import json
            import re
            
            # Try to extract JSON from response - handle nested structures
            # Look for {"facts": [...]} pattern
            json_match = re.search(r'\{[^{}]*"facts"\s*:\s*\[[^\]]*\][^{}]*\}', response_text)
            if not json_match:
                # Fallback: try to find any JSON object
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                try:
                    data = json.loads(json_match.group())
                    facts = data.get("facts", [])
                    print(f"[DEBUG] Extracted facts: {facts}")
                    
                    # Filter out empty or very short facts
                    valid_facts = [f.strip() for f in facts if f and len(f.strip()) > 10]
                    print(f"[DEBUG] Valid facts after filtering: {valid_facts}")
                    
                    return {
                        "pending": valid_facts,
                        "chat_id": metadata.get("chat_id") if metadata else None
                    }
                except json.JSONDecodeError as je:
                    print(f"[DEBUG] JSON decode error: {je}")
                    pass
            else:
                print(f"[DEBUG] No JSON match found in response")
            
            return {"pending": []}
            
        except Exception as e:
            print(f"Error extracting memories: {e}")
            import traceback
            traceback.print_exc()
            return {"pending": []}


# Singleton instance
_system = None


def get_memory_system() -> MemorySystem:
    """Get the singleton memory system instance"""
    global _system
    if _system is None:
        _system = MemorySystem()
    return _system
