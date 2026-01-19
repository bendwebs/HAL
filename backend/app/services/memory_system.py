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
    
    async def add_memory(self, user_id: str, content: str, metadata: Optional[Dict[str, Any]] = None, check_duplicates: bool = True):
        """Add a memory for a user
        
        Args:
            user_id: User identifier
            content: Memory content to add
            metadata: Optional metadata
            check_duplicates: If True, check for similar existing memories first
        """
        if not self.is_available:
            return None
        
        try:
            # Optionally check for duplicates before adding
            if check_duplicates:
                existing = await self.search_memories(user_id, content, limit=3)
                for mem in existing:
                    # If very similar memory exists (score > 0.85), skip
                    if mem.get("score", 0) > 0.85:
                        print(f"[DEBUG] Skipping duplicate memory: '{content[:50]}...' (similar to '{mem['content'][:50]}...')")
                        return {"results": [], "skipped": True, "reason": "duplicate"}
            
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

    async def analyze_memories(self, user_id: str, threshold: float = 0.85, find_low_value: bool = True) -> Dict[str, Any]:
        """Comprehensive memory analysis: find duplicates, related concepts, and low-value entries
        
        Returns:
        - groups: Similar memories that could be merged
        - low_value: Generic/unhelpful memories that could be removed
        - related: Thematically related memories that could be combined
        """
        if not self.is_available:
            return {"groups": [], "low_value": [], "related": [], "total_memories": 0}
        
        try:
            import numpy as np
            
            # Get all memories
            all_memories = await self.get_all_memories(user_id, limit=500)
            
            if len(all_memories) < 1:
                return {"groups": [], "low_value": [], "related": [], "total_memories": 0}
            
            # Get embeddings for all memories
            embeddings = []
            for mem in all_memories:
                emb = self._memory.embedding_model.embed(mem["content"])
                embeddings.append(emb)
            
            def cosine_similarity(a, b):
                a = np.array(a)
                b = np.array(b)
                return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
            
            # 1. Find duplicate/highly similar memories
            processed = set()
            groups = []
            
            for i in range(len(all_memories)):
                if i in processed:
                    continue
                    
                group = [all_memories[i]]
                group_indices = [i]
                processed.add(i)
                
                for j in range(i + 1, len(all_memories)):
                    if j in processed:
                        continue
                    
                    sim = cosine_similarity(embeddings[i], embeddings[j])
                    if sim >= threshold:
                        group.append(all_memories[j])
                        group_indices.append(j)
                        processed.add(j)
                
                if len(group) > 1:
                    # Calculate average similarity within group
                    sims = []
                    for k in range(len(group_indices)):
                        for l in range(k + 1, len(group_indices)):
                            sims.append(cosine_similarity(embeddings[group_indices[k]], embeddings[group_indices[l]]))
                    
                    avg_sim = sum(sims) / len(sims) if sims else 0
                    
                    groups.append({
                        "type": "duplicate",
                        "memories": [{"id": m["id"], "content": m["content"]} for m in group],
                        "similarity": round(avg_sim, 3),
                        "suggested_merge": self._suggest_merge(group),
                        "reason": "These memories are very similar and could be merged"
                    })
            
            # 2. Find related concepts (lower threshold) that aren't duplicates
            related_threshold = max(0.65, threshold - 0.2)
            related_processed = set()
            related_groups = []
            
            # Get indices already in duplicate groups
            duplicate_indices = set()
            for g in groups:
                for m in g["memories"]:
                    for i, mem in enumerate(all_memories):
                        if mem["id"] == m["id"]:
                            duplicate_indices.add(i)
            
            for i in range(len(all_memories)):
                if i in related_processed or i in duplicate_indices:
                    continue
                
                related = [(all_memories[i], i)]
                related_processed.add(i)
                
                for j in range(i + 1, len(all_memories)):
                    if j in related_processed or j in duplicate_indices:
                        continue
                    
                    sim = cosine_similarity(embeddings[i], embeddings[j])
                    # Related but not duplicate
                    if related_threshold <= sim < threshold:
                        related.append((all_memories[j], j))
                        related_processed.add(j)
                
                if len(related) > 1:
                    sims = []
                    for k in range(len(related)):
                        for l in range(k + 1, len(related)):
                            sims.append(cosine_similarity(embeddings[related[k][1]], embeddings[related[l][1]]))
                    avg_sim = sum(sims) / len(sims) if sims else 0
                    
                    related_groups.append({
                        "type": "related",
                        "memories": [{"id": m["id"], "content": m["content"]} for m, _ in related],
                        "similarity": round(avg_sim, 3),
                        "suggested_merge": await self._suggest_smart_merge([m for m, _ in related]),
                        "reason": "These memories are thematically related and could be combined"
                    })
            
            # 3. Find thematic consolidation opportunities (use LLM to group by theme)
            consolidation_suggestions = []
            if len(all_memories) > 3:
                consolidation_suggestions = await self._suggest_thematic_consolidations(all_memories)
            
            # 4. Find low-value/generic memories using LLM (very conservative)
            low_value = []
            if find_low_value and all_memories:
                low_value = await self._find_low_value_memories(all_memories)
            
            total_duplicates = sum(len(g["memories"]) - 1 for g in groups)
            
            return {
                "groups": groups,
                "related": related_groups,
                "consolidation_suggestions": consolidation_suggestions,
                "low_value": low_value,
                "total_duplicates": total_duplicates,
                "total_memories": len(all_memories)
            }
            
        except Exception as e:
            print(f"Error analyzing memories: {e}")
            import traceback
            traceback.print_exc()
            return {"groups": [], "low_value": [], "related": [], "consolidation_suggestions": [], "error": str(e)}

    async def _suggest_thematic_consolidations(self, memories: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Use LLM to suggest thematic groupings for scattered facts
        
        Instead of marking memories as low-value, suggest how they could be
        combined into more useful composite memories.
        """
        try:
            from app.services.ollama_client import get_ollama_client
            ollama = get_ollama_client()
            
            memory_list = "\n".join([
                f"{i+1}. {m['content']}" 
                for i, m in enumerate(memories[:40])
            ])
            
            prompt = f"""Analyze these personal memories and suggest how scattered facts could be combined into more useful composite memories.

MEMORIES:
{memory_list}

TASK: Group related memories that could be combined into single, more useful memories.

Examples of good consolidations:
- "Likes turtles" + "Has a pet turtle named Shelly" → "Has a pet turtle named Shelly and enjoys turtles in general"
- "Lives in Oregon" + "Drives a 2WD vehicle" + "Gets stuck in snow" → "Lives in Oregon, drives a 2WD vehicle which can be challenging in snowy conditions"
- "Has food stocked" + "Has blankets for emergencies" + "Has supplies for power outages" → "Keeps emergency supplies including food, blankets, and other items for power outages"

Return ONLY a JSON object:
{{"consolidations": [
  {{
    "memory_indices": [3, 7, 12],
    "theme": "Emergency preparedness",
    "suggested_combined": "Keeps emergency supplies including food, movies, and blankets in case of power outages"
  }}
]}}

Only suggest consolidations where combining actually makes sense. If memories are already good standalone, don't include them.
If no consolidations make sense, return: {{"consolidations": []}}"""

            response = await ollama.chat(
                model=settings.default_chat_model,
                messages=[{"role": "user", "content": prompt}]
            )
            
            response_text = response.get("message", {}).get("content", "").strip()
            
            import json
            import re
            
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                try:
                    data = json.loads(json_match.group())
                    consolidations = data.get("consolidations", [])
                    
                    result = []
                    for cons in consolidations:
                        indices = cons.get("memory_indices", [])
                        if len(indices) >= 2:
                            memories_in_group = []
                            for idx in indices:
                                idx = idx - 1  # Convert to 0-based
                                if 0 <= idx < len(memories):
                                    memories_in_group.append({
                                        "id": memories[idx]["id"],
                                        "content": memories[idx]["content"]
                                    })
                            
                            if len(memories_in_group) >= 2:
                                result.append({
                                    "type": "thematic",
                                    "theme": cons.get("theme", "Related facts"),
                                    "memories": memories_in_group,
                                    "suggested_merge": cons.get("suggested_combined", ""),
                                    "reason": f"These facts about '{cons.get('theme', 'this topic')}' could be combined"
                                })
                    
                    return result
                except json.JSONDecodeError:
                    pass
            
            return []
            
        except Exception as e:
            print(f"Error suggesting thematic consolidations: {e}")
            return []

    async def _find_low_value_memories(self, memories: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Use LLM to identify truly useless memories that should be removed
        
        IMPORTANT: This should be VERY conservative. Most memories have some value.
        Only flag memories that are truly useless and cannot be combined with others.
        """
        try:
            from app.services.ollama_client import get_ollama_client
            ollama = get_ollama_client()
            
            # Format memories for analysis
            memory_list = "\n".join([
                f"{i+1}. {m['content']}" 
                for i, m in enumerate(memories[:50])  # Limit to avoid token overflow
            ])
            
            prompt = f"""Analyze these personal memories and identify ONLY the ones that are truly useless and should be removed.

NEVER FLAG AS LOW VALUE:
- User's name (ALWAYS high value - "Name is Steve" is important!)
- Location information (city, state, country)
- Job/profession information
- Specific preferences or likes (even simple ones like "likes turtles")
- Personal context that could be referenced in future conversations
- Supplies, hobbies, vehicles, pets, family info

ONLY FLAG AS LOW VALUE:
- Exact duplicates of other memories
- Completely meaningless statements (e.g., "Had a conversation")
- References to specific documents/files that no longer exist
- Statements so vague they provide zero context (e.g., "Exists", "Is a person")

MEMORIES:
{memory_list}

BE VERY CONSERVATIVE. When in doubt, DO NOT flag it. Most memories have value.
The user's name, preferences, and personal details are ALWAYS valuable.

Return ONLY a JSON object:
{{"low_value": [
  {{"index": 3, "reason": "Exact duplicate of memory #7"}}
]}}

If no memories are truly low value, return: {{"low_value": []}}"""

            response = await ollama.chat(
                model=settings.default_chat_model,
                messages=[{"role": "user", "content": prompt}]
            )
            
            response_text = response.get("message", {}).get("content", "").strip()
            
            import json
            import re
            
            # Extract JSON from response
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                try:
                    data = json.loads(json_match.group())
                    low_value_items = data.get("low_value", [])
                    
                    result = []
                    for item in low_value_items:
                        idx = item.get("index", 0) - 1  # Convert to 0-based
                        if 0 <= idx < len(memories):
                            memory_content = memories[idx]["content"].lower()
                            
                            # HARD PROTECTION: Never flag these as low value
                            protected_patterns = [
                                "name is", "name:", "called",  # Names
                                "lives in", "located in", "from",  # Location
                                "works at", "job", "profession", "engineer", "developer",  # Job
                                "likes", "loves", "enjoys", "prefers", "favorite",  # Preferences
                                "drives", "car", "vehicle",  # Vehicles
                                "has", "owns",  # Possessions
                            ]
                            
                            is_protected = any(pattern in memory_content for pattern in protected_patterns)
                            
                            if not is_protected:
                                result.append({
                                    "id": memories[idx]["id"],
                                    "content": memories[idx]["content"],
                                    "reason": item.get("reason", "Generic or low-value memory")
                                })
                    
                    return result
                except json.JSONDecodeError:
                    pass
            
            return []
            
        except Exception as e:
            print(f"Error finding low-value memories: {e}")
            return []

    async def _suggest_smart_merge(self, memories: List[Dict[str, Any]]) -> str:
        """Use LLM to suggest a smart merge of related memories"""
        try:
            from app.services.ollama_client import get_ollama_client
            ollama = get_ollama_client()
            
            contents = [m["content"] for m in memories]
            memories_text = "\n- ".join(contents)
            
            prompt = f"""These related memories should be combined into a single, comprehensive memory:

- {memories_text}

Write ONE concise memory statement that captures all the key information. Be specific and actionable.
Return ONLY the merged memory text, nothing else."""

            response = await ollama.chat(
                model=settings.default_chat_model,
                messages=[{"role": "user", "content": prompt}]
            )
            
            merged = response.get("message", {}).get("content", "").strip()
            
            # Clean up any quotes or extra formatting
            merged = merged.strip('"\'')
            
            if merged and len(merged) > 10:
                return merged
            
            # Fallback to longest memory
            return max(contents, key=len)
            
        except Exception as e:
            print(f"Error suggesting smart merge: {e}")
            return max([m["content"] for m in memories], key=len)

    async def extract_memories(self, user_id: str, messages: List[Dict[str, str]], metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Extract potential memories from conversation WITHOUT saving them.
        
        Uses the LLM to identify facts worth remembering, but returns them
        for user confirmation before saving.
        
        IMPORTANT: This extracts MEANINGFUL, COMPOSITE memories - not every tiny fact.
        We want memories that will be useful for personalizing future conversations.
        """
        if not self.is_available:
            return {"pending": []}
        
        try:
            from app.services.ollama_client import get_ollama_client
            ollama = get_ollama_client()
            
            # Get existing memories to avoid duplicates
            existing_memories = await self.get_all_memories(user_id, limit=50)
            existing_text = "\n".join([f"- {m['content']}" for m in existing_memories]) if existing_memories else "None yet"
            
            # Format conversation for analysis
            conversation_text = "\n".join([
                f"{m['role'].upper()}: {m['content']}" 
                for m in messages
            ])
            
            extraction_prompt = f"""You are a memory extraction assistant for a personal AI. Your job is to identify MEANINGFUL facts about the USER that should be remembered for future conversations.

EXISTING MEMORIES (do not duplicate these):
{existing_text}

CURRENT CONVERSATION:
{conversation_text}

GUIDELINES FOR GOOD MEMORIES:
1. SPECIFIC and ACTIONABLE - facts that help personalize future conversations
2. COMPOSITE when possible - combine related facts into one memory
3. STABLE information - things unlikely to change often
4. IDENTITY-related - name, job, location, key interests, preferences

EXAMPLES OF GOOD MEMORIES:
- "User's name is Steve, works as an AI Engineer at Belden Inc"
- "Lives in Oregon, drives a Jeep Grand Cherokee (2WD), enjoys snow but can get stuck"
- "Building game development projects using Godot and Pygame"
- "Prefers concise, conversational responses without excessive formatting"

EXAMPLES OF BAD MEMORIES (too granular or generic):
- "Likes technology" (too vague)
- "Has a document about X" (temporary)
- "Mentioned snow" (not useful without context)
- "Is having a conversation" (obvious)
- Separate memories for related facts that should be one

TASK: Extract NEW facts from this conversation that aren't already in existing memories.
- Combine related facts into composite memories
- Skip facts that are too generic or temporary
- Skip anything already covered by existing memories
- If the user shares their name and it's not in existing memories, ALWAYS extract it

Return ONLY a JSON object:
{{"facts": ["Memory statement 1", "Memory statement 2"]}}

If nothing new and meaningful to remember, return: {{"facts": []}}"""

            response = await ollama.chat(
                model=settings.default_chat_model,
                messages=[{"role": "user", "content": extraction_prompt}]
            )
            
            response_text = response.get("message", {}).get("content", "").strip()
            print(f"[DEBUG] Memory extraction raw response: {response_text[:500]}")
            
            # Parse JSON response
            import json
            import re
            
            # Try to extract JSON from response
            json_match = re.search(r'\{[^{}]*"facts"\s*:\s*\[[^\]]*\][^{}]*\}', response_text)
            if not json_match:
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            
            if json_match:
                try:
                    data = json.loads(json_match.group())
                    facts = data.get("facts", [])
                    print(f"[DEBUG] Extracted facts: {facts}")
                    
                    # Filter out empty or very short facts
                    valid_facts = [f.strip() for f in facts if f and len(f.strip()) > 15]
                    print(f"[DEBUG] Valid facts after filtering: {valid_facts}")
                    
                    return {
                        "pending": valid_facts,
                        "chat_id": metadata.get("chat_id") if metadata else None
                    }
                except json.JSONDecodeError as je:
                    print(f"[DEBUG] JSON decode error: {je}")
            else:
                print(f"[DEBUG] No JSON match found in response")
            
            return {"pending": []}
            
        except Exception as e:
            print(f"Error extracting memories: {e}")
            import traceback
            traceback.print_exc()
            return {"pending": []}

    async def auto_consolidate(self, user_id: str, threshold: float = 0.80) -> Dict[str, Any]:
        """Automatically consolidate similar memories for a user
        
        This merges highly similar memories, thematic groups, and is very 
        conservative about removing anything.
        
        Returns summary of actions taken.
        """
        if not self.is_available:
            return {"success": False, "error": "Memory system not available"}
        
        try:
            # Analyze memories
            analysis = await self.analyze_memories(
                user_id=user_id, 
                threshold=threshold,
                find_low_value=True
            )
            
            merged_count = 0
            deleted_count = 0
            
            # Merge duplicate groups
            for group in analysis.get("groups", []):
                memories = group.get("memories", [])
                if len(memories) > 1:
                    # Get suggested merge content
                    suggested = group.get("suggested_merge", "")
                    if not suggested:
                        suggested = max([m["content"] for m in memories], key=len)
                    
                    # Create merged memory
                    await self.add_memory(
                        user_id=user_id,
                        content=suggested,
                        metadata={"consolidated": True, "merged_from": [m["id"] for m in memories]},
                        check_duplicates=False  # Don't check duplicates for consolidation
                    )
                    
                    # Delete originals
                    for mem in memories:
                        if await self.delete_memory(mem["id"]):
                            deleted_count += 1
                    
                    merged_count += 1
            
            # Merge related concept groups (use LLM-suggested merge)
            for group in analysis.get("related", []):
                memories = group.get("memories", [])
                if len(memories) > 1 and group.get("similarity", 0) > 0.7:
                    suggested = group.get("suggested_merge", "")
                    if suggested and len(suggested) > 20:
                        # Create merged memory
                        await self.add_memory(
                            user_id=user_id,
                            content=suggested,
                            metadata={"consolidated": True, "merged_from": [m["id"] for m in memories]},
                            check_duplicates=False
                        )
                        
                        # Delete originals
                        for mem in memories:
                            if await self.delete_memory(mem["id"]):
                                deleted_count += 1
                        
                        merged_count += 1
            
            # Merge thematic consolidation suggestions
            thematic_merged = 0
            for group in analysis.get("consolidation_suggestions", []):
                memories = group.get("memories", [])
                suggested = group.get("suggested_merge", "")
                if len(memories) > 1 and suggested and len(suggested) > 20:
                    # Create merged memory
                    await self.add_memory(
                        user_id=user_id,
                        content=suggested,
                        metadata={
                            "consolidated": True, 
                            "theme": group.get("theme", ""),
                            "merged_from": [m["id"] for m in memories]
                        },
                        check_duplicates=False
                    )
                    
                    # Delete originals
                    for mem in memories:
                        if await self.delete_memory(mem["id"]):
                            deleted_count += 1
                    
                    thematic_merged += 1
                    merged_count += 1
            
            # Be VERY conservative about deleting "low value" - only delete exact duplicates
            low_value_deleted = 0
            for lv in analysis.get("low_value", [])[:1]:  # Limit to 1 at a time, very conservative
                # Double-check it's not something important
                content_lower = lv.get("content", "").lower()
                if not any(word in content_lower for word in ["name", "lives", "works", "likes", "has", "drives"]):
                    if await self.delete_memory(lv["id"]):
                        low_value_deleted += 1
                        print(f"[DEBUG] Deleted low-value memory: {lv['content'][:50]}... Reason: {lv.get('reason', 'N/A')}")
            
            return {
                "success": True,
                "merged_groups": merged_count,
                "thematic_merged": thematic_merged,
                "deleted_duplicates": deleted_count,
                "deleted_low_value": low_value_deleted,
                "total_memories_before": analysis.get("total_memories", 0),
                "total_memories_after": analysis.get("total_memories", 0) - deleted_count - low_value_deleted + merged_count
            }
            
        except Exception as e:
            print(f"Error in auto_consolidate: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}


# Singleton instance
_system = None


def get_memory_system() -> MemorySystem:
    """Get the singleton memory system instance"""
    global _system
    if _system is None:
        _system = MemorySystem()
    return _system
