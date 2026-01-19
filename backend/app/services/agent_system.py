"""Agent System - Core AI agent with sub-agent capabilities"""

from typing import List, Dict, Any, Optional, AsyncGenerator
from bson import ObjectId
from datetime import datetime
import uuid
import json
import re
import logging

from app.database import database
from app.config import settings
from app.services.ollama_client import get_ollama_client
from app.services.rag_engine import get_rag_engine
from app.services.memory_system import get_memory_system
from app.services.resource_monitor import get_resource_monitor
from app.services.tool_executor import ToolExecutor
from app.services.web_search import get_web_search_service

logger = logging.getLogger(__name__)


def should_web_search(message: str) -> tuple[bool, Optional[str], Optional[str]]:
    """Determine if the message warrants a web search.
    
    Returns (should_search, search_query, target_site) tuple.
    
    IMPORTANT: This function should be CONSERVATIVE - only trigger web searches
    when the user is clearly requesting external information, not for casual
    conversation that happens to contain words like "recent" or "latest".
    """
    message_lower = message.lower().strip()
    
    # Skip very short messages
    if len(message_lower) < 10:
        return False, None, None
    
    # Skip conversational/personal statements - these are NOT search requests
    skip_patterns = [
        r'^(hi|hello|hey|howdy|greetings)',
        r'^(yes|no|yea|yeah|yep|nope|sure|ok|okay)',
        r'^(thanks|thank you|thx)',
        r'(i think|i feel|i believe|in my opinion|imo)',
        r'(i\'ve been|i have been|it\'s been|its been)',  # Personal observations
        r'(i live|i work|i\'m from|i am from)',
        r'^(that\'s|thats) (interesting|cool|nice|great|good)',
    ]
    
    for pattern in skip_patterns:
        if re.search(pattern, message_lower):
            return False, None, None
    
    # Known sites that users might want to search on
    known_sites = {
        'bloomberg': 'bloomberg.com',
        'reuters': 'reuters.com',
        'cnn': 'cnn.com',
        'bbc': 'bbc.com',
        'wikipedia': 'wikipedia.org',
        'reddit': 'reddit.com',
        'youtube': 'youtube.com',
        'github': 'github.com',
        'yahoo finance': 'finance.yahoo.com',
        'google': None,  # Generic search indicator
    }
    
    # EXPLICIT search requests - must start with action verb or be a clear question
    # Pattern 1: "search/lookup/find/google X" at the START of the message
    explicit_search = re.match(
        r'^(?:please\s+)?(?:can you\s+)?(?:search|look\s*up|find|google)\s+(?:for\s+)?(?:the\s+)?(.+)',
        message_lower
    )
    if explicit_search:
        query = explicit_search.group(1).strip()
        query = re.sub(r'\s*(please|thanks|now|for me)\.?$', '', query, flags=re.IGNORECASE)
        if len(query) > 3:
            return True, query, None
    
    # Pattern 2: "search X on [site]" or "find X on [site]"
    site_search = re.match(
        r'^(?:please\s+)?(?:can you\s+)?(?:search|look\s*up|find|check)\s+(.+?)\s+(?:on|from|at)\s+(\w+(?:\s+\w+)?)',
        message_lower
    )
    if site_search:
        query = site_search.group(1).strip()
        site_hint = site_search.group(2).strip()
        target_site = known_sites.get(site_hint)
        if target_site:
            return True, query, target_site
        if '.' in site_hint:
            return True, query, site_hint
        return True, f"{query} {site_hint}", None
    
    # Pattern 3: Questions asking for current/latest information
    # Must be a QUESTION (start with question word or end with ?)
    is_question = message_lower.endswith('?') or re.match(
        r'^(what|who|where|when|why|how|which|is|are|does|do|can|could|will|would)\b',
        message_lower
    )
    
    if is_question:
        # Check if asking about current/latest/recent things
        # Note: what(?:'?s| is| are) handles "what's", "whats", "what is", "what are"
        current_info_patterns = [
            r'(?:what(?:\'?s| is| are))\s+(?:the\s+)?(?:current|latest|recent|newest|today\'?s?)\s+(.+)',
            r'(?:what(?:\'?s| is| are))\s+(.+?)\s+(?:right now|today|currently|at the moment)',
            # "what's the price of X" - must come before the generic "X price" pattern
            r'(?:what(?:\'?s| is| are))\s+(?:the\s+)?(?:price|cost|value|rate)\s+(?:of\s+)?(.+)',
            # "what's the X price/cost" - more specific, less greedy
            r'(?:what(?:\'?s| is| are))\s+(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:price|cost|value|rate|score|status)\b',
            r'(?:who|what)\s+(?:is|are)\s+(?:the\s+)?(?:current|new|latest)\s+(.+)',
            r'(?:how much)\s+(?:is|does|are)\s+(.+)',
        ]
        
        for pattern in current_info_patterns:
            match = re.search(pattern, message_lower)
            if match:
                query = match.group(1).strip()
                query = re.sub(r'\s*(please|thanks|\?)\.?$', '', query, flags=re.IGNORECASE)
                if len(query) > 3:
                    return True, query, None
    
    # Pattern 4: Explicit news requests
    news_patterns = [
        r'^(?:get|show|tell)\s+(?:me\s+)?(?:the\s+)?(?:latest|recent|today\'?s?)\s+news\s+(?:about|on|for)\s+(.+)',
        r'^(?:get|show|tell)\s+(?:me\s+)?(?:the\s+)?(?:latest|recent|today\'?s?)\s+(.+?)\s+news$',  # "get latest AI news"
        r'^(?:what\'?s?|any)\s+(?:the\s+)?(?:latest|recent|new)\s+news\s+(?:about|on|for)\s+(.+)',
        r'^news\s+(?:about|on|for)\s+(.+)',
    ]
    
    for pattern in news_patterns:
        match = re.match(pattern, message_lower)
        if match:
            query = match.group(1).strip()
            if len(query) >= 2:  # Allow short queries like "AI" since we append " news"
                return True, f"{query} news", None
    
    return False, None, None


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
        voice_mode: bool = False,
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
            chat_id, user_id, message, document_ids, persona_id, model_override, voice_mode
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
        voice_mode: bool = False,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Generate response with streaming"""
        model = model_override or self.model
        ollama = get_ollama_client()
        
        # Get system prompt from persona
        system_prompt = await self._get_system_prompt(persona_id, user_id)
        
        # Add voice mode enhancements for more conversational responses
        if voice_mode:
            system_prompt += """

You are in a voice conversation. Keep these guidelines in mind:
- Be conversational and engaging - ask follow-up questions to keep the dialogue flowing
- Keep responses concise (1-3 sentences unless explaining something complex)
- Show genuine curiosity about what the user shares
- Don't just answer questions - also share relevant thoughts, ask about their experience, or offer interesting related information
- Use natural conversational fillers occasionally like "That's interesting..." or "You know what..."
- If the user gives a short response, ask a thoughtful follow-up question
- Vary your response patterns - don't always start with "That's great!" or similar
- Remember context from earlier in the conversation and reference it naturally"""
        
        # Build context
        context_parts = []
        
        # Check if user wants a web search
        should_search, search_query, target_site = should_web_search(message)
        
        if should_search and search_query:
            web_search = get_web_search_service()
            
            if web_search.is_available:
                # Notify that we're searching
                yield {
                    "type": "action_start",
                    "data": {
                        "id": str(uuid.uuid4()),
                        "type": "web_search",
                        "name": "web_search",
                        "parameters": {"query": search_query, "site": target_site},
                        "status": "running"
                    }
                }
                
                start_time = datetime.utcnow()
                
                # Perform search and save results to MongoDB
                web_result = await web_search.search_and_save(
                    user_id=user_id,
                    query=search_query,
                    target_site=target_site,
                    max_results=5
                )
                
                duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
                
                if web_result.get("success"):
                    # Build context from web results
                    web_context = f"Web search for: {search_query}\n"
                    
                    # Add Tavily's answer if available
                    if web_result.get("answer"):
                        web_context += f"\nSummary: {web_result['answer']}\n"
                    
                    # Add search result snippets
                    if web_result.get("results"):
                        web_context += "\nSearch results:\n"
                        for i, r in enumerate(web_result["results"]):
                            web_context += f"{i+1}. {r.get('title', '')} ({r.get('url', '')})\n"
                            web_context += f"   {r.get('content', '')[:500]}\n\n"
                    
                    context_parts.append(web_context)
                    
                    result_desc = f"Found {web_result.get('result_count', 0)} results"
                    if web_result.get("answer"):
                        result_desc = f"Got answer + {web_result.get('result_count', 0)} results"
                    
                    yield {
                        "type": "action_complete",
                        "data": {
                            "id": str(uuid.uuid4()),
                            "type": "web_search",
                            "name": "web_search",
                            "parameters": {"query": search_query, "site": target_site},
                            "status": "complete",
                            "result": result_desc,
                            "search_id": web_result.get("search_id"),  # Include for later extraction
                            "duration_ms": duration_ms
                        }
                    }
                else:
                    yield {
                        "type": "action_complete",
                        "data": {
                            "id": str(uuid.uuid4()),
                            "type": "web_search",
                            "name": "web_search",
                            "parameters": {"query": search_query, "site": target_site},
                            "status": "error",
                            "result": web_result.get("error", "Search failed"),
                            "duration_ms": duration_ms
                        }
                    }
        
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
        
        return """You are HAL, a friendly AI assistant running locally on the user's computer. You have access to their personal documents, memories from past conversations, and can search the web when needed.

IMPORTANT - Response Style:
- Write like you're having a natural conversation with a friend, not writing a document
- NEVER use markdown formatting (no **, no ##, no bullet points, no numbered lists)
- Instead of lists, weave information naturally into sentences and paragraphs
- Keep responses conversational and flowing, like you're talking out loud
- Use casual transitions like "So basically...", "The thing is...", "What's interesting is..."
- It's okay to use contractions (don't, won't, it's, that's)
- Vary your sentence length - mix short punchy sentences with longer explanatory ones
- If you need to mention multiple things, work them into the conversation naturally rather than listing them

Examples of what NOT to do:
- "Here are the key points: 1. First thing 2. Second thing"
- "**Important:** This is crucial"
- "## Summary"

Examples of good conversational style:
- "So there are a few things going on here. First off, the main issue seems to be... and then there's also the fact that..."
- "That's a great question! Basically what happens is..."
- "I remember you mentioned something about this before - you were working on..."

Your capabilities:
- You can pull up relevant info from documents the user has uploaded
- You remember things about the user from previous chats
- You can search the web when they ask for current information

Be warm, helpful, and genuine. If you don't know something, just say so naturally - no need to be formal about it."""
    
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
