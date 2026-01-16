"""Agent System - Core AI agent with sub-agent capabilities"""

from typing import List, Dict, Any, Optional, AsyncGenerator
from bson import ObjectId
from datetime import datetime
import uuid
import json
import re

from app.database import database
from app.config import settings
from app.services.ollama_client import get_ollama_client
from app.services.rag_engine import get_rag_engine
from app.services.memory_system import get_memory_system
from app.services.resource_monitor import get_resource_monitor
from app.services.tool_executor import ToolExecutor


def should_search_documents(message: str) -> bool:
    """Determine if the message warrants a document search.
    
    Returns True for questions, requests for information, or specific topics.
    Returns False for greetings, personal statements, or casual chat.
    """
    message_lower = message.lower().strip()
    
    # Skip search for very short messages (likely greetings)
    if len(message_lower) < 15:
        return False
    
    # Skip search for common greetings and personal statements
    skip_patterns = [
        r'^(hi|hello|hey|howdy|greetings|good\s+(morning|afternoon|evening))[\s,!.]*',
        r'^(my name is|i\'m |i am |call me )',
        r'^(thanks|thank you|thx)',
        r'^(bye|goodbye|see you|later)',
        r'^(how are you|what\'s up|sup)',
        r'^(yes|no|ok|okay|sure|alright|got it|understood)[\s!.]*$',
    ]
    
    for pattern in skip_patterns:
        if re.match(pattern, message_lower):
            return False
    
    # Search for questions or information requests
    search_indicators = [
        r'\?$',  # Ends with question mark
        r'^(what|who|where|when|why|how|which|can you|could you|do you|does|did|is|are|was|were)',
        r'(tell me|explain|describe|show me|find|search|look up|look for)',
        r'(information|details|about|regarding|concerning)',
        r'(document|file|report|article|paper)',
    ]
    
    for pattern in search_indicators:
        if re.search(pattern, message_lower):
            return True
    
    # Default: search if message is substantial (likely a real question)
    word_count = len(message_lower.split())
    return word_count >= 5


def should_search_memories(message: str) -> bool:
    """Determine if the message warrants a memory search.
    
    Returns True for questions about the user, references to past conversations,
    or topics that might benefit from personal context.
    """
    message_lower = message.lower().strip()
    
    # Skip for very short messages
    if len(message_lower) < 10:
        return False
    
    # Skip common greetings (but NOT personal introductions - we want to check memories for those)
    skip_patterns = [
        r'^(hi|hello|hey|howdy|greetings)[\s,!.]*$',
        r'^(thanks|thank you|thx)',
        r'^(bye|goodbye|see you)',
        r'^(yes|no|ok|okay|sure|alright)[\s!.]*$',
    ]
    
    for pattern in skip_patterns:
        if re.match(pattern, message_lower):
            return False
    
    # Always search memories for personal statements (to avoid re-learning known info)
    personal_patterns = [
        r'(my name is|i\'m |i am |call me )',
        r'(i work|i live|i like|i prefer|i have|i want)',
        r'(remember|forgot|mentioned|told you|said)',
    ]
    
    for pattern in personal_patterns:
        if re.search(pattern, message_lower):
            return True
    
    # Search for questions or substantial messages
    if '?' in message or len(message_lower.split()) >= 4:
        return True
    
    return False


class AgentSystem:
    """Main agent system with sub-agent support"""
    
    def __init__(self):
        self.model = settings.default_chat_model
        self.max_depth = settings.max_agent_depth
        self.tool_executor = ToolExecutor()
        self._warmed_up = False
    
    async def warmup(self) -> bool:
        """Warm up the model by sending a quick ping - makes first real response faster"""
        if self._warmed_up:
            return True
        
        try:
            ollama = get_ollama_client()
            async for _ in ollama.chat_stream(
                model=self.model,
                messages=[{"role": "user", "content": "hi"}],
                system="Reply with just 'ok'."
            ):
                pass
            self._warmed_up = True
            return True
        except Exception as e:
            print(f"Warmup failed: {e}")
            return False
    
    async def generate_response(
        self,
        chat_id: str,
        user_id: str,
        message: str,
        document_ids: List[str] = None,
        persona_id: Optional[str] = None,
        model_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate a complete response (non-streaming)"""
        result = {
            "content": "",
            "thinking": None,
            "actions": [],
            "model_used": model_override or self.model,
            "token_usage": {"prompt": 0, "completion": 0, "total": 0}
        }
        
        async for chunk in self.generate_response_stream(
            chat_id, user_id, message, document_ids, persona_id, model_override
        ):
            if chunk["type"] == "thinking":
                result["thinking"] = chunk["data"].get("content", "")
            elif chunk["type"] == "content":
                result["content"] += chunk["data"].get("delta", "")
            elif chunk["type"] == "action_complete":
                result["actions"].append(chunk["data"])
            elif chunk["type"] == "done":
                result["token_usage"] = chunk["data"].get("token_usage", result["token_usage"])
        
        return result

    async def generate_response_stream(
        self,
        chat_id: str,
        user_id: str,
        message: str,
        document_ids: List[str] = None,
        persona_id: Optional[str] = None,
        model_override: Optional[str] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Generate response with streaming"""
        model = model_override or self.model
        ollama = get_ollama_client()
        
        # Get system prompt from persona
        system_prompt = await self._get_system_prompt(persona_id, user_id)
        
        # Build context
        context_parts = []
        
        # Retrieve relevant memories using Mem0 (only if appropriate)
        memory_system = get_memory_system()
        memories = []
        
        if memory_system.is_available and should_search_memories(message):
            memories = await memory_system.search_memories(user_id, message, limit=5)
        
        if memories:
            memory_text = "\n".join([f"- {m['content']}" for m in memories])
            context_parts.append(f"Relevant memories about this user:\n{memory_text}")
            
            # Send memory usage details to frontend
            yield {
                "type": "memories_used",
                "data": {
                    "memories": [
                        {
                            "id": m["id"],
                            "content": m["content"],
                            "score": m.get("score", 0),
                            "categories": m.get("categories", [])
                        }
                        for m in memories
                    ]
                }
            }
            
            yield {
                "type": "action_complete",
                "data": {
                    "id": str(uuid.uuid4()),
                    "type": "memory_recall",
                    "name": "recall_memories",
                    "parameters": {"query": message[:100]},
                    "status": "complete",
                    "result": f"Found {len(memories)} relevant memories",
                    "duration_ms": 50
                }
            }
        
        # SMART LIBRARY SEARCH - only search when the message warrants it
        # If specific document_ids provided, always search those; otherwise check if search is appropriate
        rag = get_rag_engine()
        doc_results = []
        
        if document_ids or should_search_documents(message):
            doc_results = await rag.search(user_id, message, document_ids, limit=5)
        
        if doc_results:
            doc_text = "\n\n".join([
                f"From '{r['document_name']}' (relevance: {r['score']:.2f}):\n{r['content']}"
                for r in doc_results
            ])
            context_parts.append(f"Relevant excerpts from your documents:\n{doc_text}")
            
            # List which documents were searched
            doc_names = list(set(r['document_name'] for r in doc_results))
            yield {
                "type": "action_complete",
                "data": {
                    "id": str(uuid.uuid4()),
                    "type": "rag_search",
                    "name": "search_library",
                    "parameters": {"query": message[:100]},
                    "status": "complete",
                    "result": f"Found {len(doc_results)} relevant excerpts from: {', '.join(doc_names)}",
                    "duration_ms": 100
                }
            }

        # Get chat history
        history = await self._get_chat_history(chat_id, limit=10)
        
        # Build messages
        messages = []
        
        # Add context to system prompt
        if context_parts:
            context = "\n\n".join(context_parts)
            system_prompt = f"{system_prompt}\n\nContext:\n{context}"
        
        # Add history
        for msg in history:
            messages.append({
                "role": msg["role"],
                "content": msg["content"]
            })
        
        # Add current message
        messages.append({"role": "user", "content": message})
        
        # Generate response
        start_time = datetime.utcnow()
        full_response = ""
        token_usage = {"prompt": 0, "completion": 0, "total": 0}
        
        try:
            async for chunk in ollama.chat_stream(
                model=model,
                messages=messages,
                system=system_prompt
            ):
                if chunk.get("message", {}).get("content"):
                    delta = chunk["message"]["content"]
                    full_response += delta
                    yield {"type": "content", "data": {"delta": delta}}
                
                if chunk.get("done"):
                    token_usage = {
                        "prompt": chunk.get("prompt_eval_count", 0),
                        "completion": chunk.get("eval_count", 0),
                        "total": chunk.get("prompt_eval_count", 0) + chunk.get("eval_count", 0)
                    }
        
        except Exception as e:
            yield {"type": "error", "data": {"message": str(e)}}
            return
        
        # Record latency
        duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        monitor = get_resource_monitor()
        monitor.record_latency(duration_ms)
        
        yield {
            "type": "done",
            "data": {
                "model": model,
                "token_usage": token_usage,
                "duration_ms": duration_ms
            }
        }

    async def _get_system_prompt(self, persona_id: Optional[str], user_id: str) -> str:
        """Get system prompt from persona or default"""
        if persona_id:
            persona = await database.personas.find_one({"_id": ObjectId(persona_id)})
            if persona:
                return persona["system_prompt"]
        
        return """You are HAL, a helpful AI assistant running locally. You have access to the user's personal document library and memories.

Key capabilities:
- You can search the user's uploaded documents for relevant information when needed
- You remember important facts about the user from previous conversations
- All data stays local and private

When answering:
- For greetings and casual conversation, respond naturally without searching documents
- If you find relevant information in documents, cite the source (document name)
- If you recall memories about the user, acknowledge them naturally (e.g., "I remember you mentioned...")
- Be helpful, concise, and accurate
- If you don't know something and it's not in the documents, say so honestly
- When a user shares personal information (like their name), acknowledge it warmly - this information will be automatically remembered for future conversations"""
    
    async def _get_chat_history(self, chat_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent chat history"""
        messages = await database.messages.find(
            {"chat_id": ObjectId(chat_id)}
        ).sort("created_at", -1).limit(limit).to_list(limit)
        
        messages.reverse()
        
        return [
            {"role": m["role"], "content": m["content"]}
            for m in messages
        ]


# Singleton
_system: Optional[AgentSystem] = None


def get_agent_system() -> AgentSystem:
    global _system
    if _system is None:
        _system = AgentSystem()
    return _system
