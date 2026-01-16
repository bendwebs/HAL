"""Memory System - Mem0-style memory management"""

from typing import List, Dict, Any, Optional
from bson import ObjectId
from datetime import datetime

from app.database import database
from app.config import settings
from app.services.ollama_client import get_ollama_client


class MemorySystem:
    """Mem0-inspired memory system for storing and retrieving user memories"""
    
    def __init__(self):
        self.embed_model = settings.default_embed_model
    
    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for text"""
        ollama = get_ollama_client()
        try:
            return await ollama.embed(self.embed_model, text)
        except Exception as e:
            print(f"Error generating embedding: {e}")
            return []
    
    async def add_memory(
        self,
        user_id: str,
        content: str,
        category: str = "general",
        importance: float = 0.5,
        source_chat_id: Optional[str] = None
    ) -> str:
        """Add a new memory"""
        embedding = await self.generate_embedding(content)
        
        memory_doc = {
            "user_id": ObjectId(user_id),
            "content": content,
            "category": category,
            "importance": importance,
            "embedding": embedding,
            "source_chat_id": ObjectId(source_chat_id) if source_chat_id else None,
            "access_count": 0,
            "created_at": datetime.utcnow(),
            "last_accessed": None
        }
        
        result = await database.memories.insert_one(memory_doc)
        return str(result.inserted_id)
    
    async def search_memories(
        self,
        user_id: str,
        query: str,
        limit: int = 10,
        min_importance: float = 0.0
    ) -> List[Dict[str, Any]]:
        """Search memories by semantic similarity"""
        query_embedding = await self.generate_embedding(query)
        
        if not query_embedding:
            return []
        
        # Get user's memories
        memories = await database.memories.find({
            "user_id": ObjectId(user_id),
            "importance": {"$gte": min_importance}
        }).to_list(500)
        
        # Calculate relevance scores
        results = []
        for memory in memories:
            if memory.get("embedding"):
                similarity = self._cosine_similarity(query_embedding, memory["embedding"])
                
                # Boost score based on recency and access frequency
                recency_boost = self._recency_score(memory["created_at"])
                importance_boost = memory.get("importance", 0.5)
                
                # Combined relevance score
                relevance = (similarity * 0.6) + (recency_boost * 0.2) + (importance_boost * 0.2)
                
                results.append({
                    "id": str(memory["_id"]),
                    "content": memory["content"],
                    "category": memory.get("category", "general"),
                    "importance": memory.get("importance", 0.5),
                    "relevance_score": relevance,
                    "created_at": memory["created_at"]
                })
        
        # Sort by relevance
        results.sort(key=lambda x: x["relevance_score"], reverse=True)
        
        # Update access counts for returned memories
        top_results = results[:limit]
        if top_results:
            memory_ids = [ObjectId(r["id"]) for r in top_results]
            await database.memories.update_many(
                {"_id": {"$in": memory_ids}},
                {
                    "$inc": {"access_count": 1},
                    "$set": {"last_accessed": datetime.utcnow()}
                }
            )
        
        return top_results
    
    async def extract_memories_from_chat(
        self,
        user_id: str,
        chat_id: str,
        messages: List[Dict[str, Any]]
    ) -> List[str]:
        """Extract and store memories from a chat conversation"""
        # Build a prompt to extract key facts/preferences
        conversation = "\n".join([
            f"{m['role']}: {m['content']}" 
            for m in messages[-10:]  # Last 10 messages
        ])
        
        extraction_prompt = f"""Analyze this conversation and extract key facts, preferences, or important information about the user that should be remembered for future conversations.

Conversation:
{conversation}

Extract 0-3 memories. Each memory should be:
- A single, clear statement about the user
- Factual or preference-based
- Useful for personalizing future interactions

Return each memory on a new line, or "NONE" if no memories worth storing.
Memories:"""
        
        ollama = get_ollama_client()
        
        try:
            response = await ollama.generate(
                model=settings.default_chat_model,
                prompt=extraction_prompt,
                temperature=0.3
            )
            
            response_text = response.get("response", "")
            
            if "NONE" in response_text.upper():
                return []
            
            # Parse memories
            memories = []
            for line in response_text.strip().split("\n"):
                line = line.strip()
                if line and len(line) > 10 and not line.upper().startswith("NONE"):
                    # Clean up common prefixes
                    for prefix in ["- ", "• ", "* ", "1. ", "2. ", "3. "]:
                        if line.startswith(prefix):
                            line = line[len(prefix):]
                    
                    if line:
                        memory_id = await self.add_memory(
                            user_id=user_id,
                            content=line,
                            category="auto_extracted",
                            importance=0.6,
                            source_chat_id=chat_id
                        )
                        memories.append(memory_id)
            
            return memories
            
        except Exception as e:
            print(f"Error extracting memories: {e}")
            return []
    
    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity"""
        if not vec1 or not vec2 or len(vec1) != len(vec2):
            return 0.0
        
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = sum(a * a for a in vec1) ** 0.5
        norm2 = sum(b * b for b in vec2) ** 0.5
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot_product / (norm1 * norm2)
    
    def _recency_score(self, created_at: datetime) -> float:
        """Calculate recency score (0-1, higher = more recent)"""
        now = datetime.utcnow()
        age_days = (now - created_at).days
        
        # Decay over 90 days
        if age_days >= 90:
            return 0.1
        
        return 1.0 - (age_days / 90) * 0.9


# Singleton
_system: Optional[MemorySystem] = None


def get_memory_system() -> MemorySystem:
    global _system
    if _system is None:
        _system = MemorySystem()
    return _system
