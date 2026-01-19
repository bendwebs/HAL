"""Tool Executor - Execute tools and manage tool definitions"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from bson import ObjectId

from app.database import database


class ToolExecutor:
    """Executes tools and manages tool definitions"""
    
    def __init__(self):
        self.builtin_tools = self._define_builtin_tools()
    
    def _define_builtin_tools(self) -> Dict[str, Dict[str, Any]]:
        """Define built-in tools"""
        return {
            "document_search": {
                "name": "document_search",
                "display_name": "Document Search",
                "description": "Search through user's uploaded documents using RAG",
                "icon": "📄",
                "schema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"},
                        "document_ids": {"type": "array", "items": {"type": "string"}}
                    },
                    "required": ["query"]
                }
            },
            "memory_recall": {
                "name": "memory_recall",
                "display_name": "Memory Recall",
                "description": "Search through stored memories about the user using Mem0",
                "icon": "🧠",
                "schema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "What to search for"}
                    },
                    "required": ["query"]
                }
            },
            "memory_store": {
                "name": "memory_store",
                "display_name": "Store Memory",
                "description": "Store a new memory about the user",
                "icon": "💾",
                "schema": {
                    "type": "object",
                    "properties": {
                        "content": {"type": "string"},
                        "category": {"type": "string"}
                    },
                    "required": ["content"]
                }
            },
            "calculator": {
                "name": "calculator",
                "display_name": "Calculator",
                "description": "Perform mathematical calculations",
                "icon": "🔢",
                "schema": {
                    "type": "object",
                    "properties": {
                        "expression": {"type": "string"}
                    },
                    "required": ["expression"]
                }
            },
            "spawn_agent": {
                "name": "spawn_agent",
                "display_name": "Spawn Sub-Agent",
                "description": "Create a sub-agent to handle a specific task",
                "icon": "🤖",
                "schema": {
                    "type": "object",
                    "properties": {
                        "task": {"type": "string"},
                        "tools": {"type": "array", "items": {"type": "string"}},
                        "can_spawn": {"type": "boolean"}
                    },
                    "required": ["task"]
                }
            },
            "web_search": {
                "name": "web_search",
                "display_name": "Web Search (Tavily)",
                "description": "Search the web for current information using Tavily API",
                "icon": "🌐",
                "schema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"},
                        "target_site": {"type": "string", "description": "Optional site to search on"}
                    },
                    "required": ["query"]
                }
            }
        }
    
    async def execute(
        self,
        tool_name: str,
        parameters: Dict[str, Any],
        user_id: str,
        context: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Execute a tool and return result"""
        
        if tool_name == "calculator":
            return await self._execute_calculator(parameters)
        elif tool_name == "document_search":
            return await self._execute_document_search(parameters, user_id)
        elif tool_name == "memory_recall":
            return await self._execute_memory_recall(parameters, user_id)
        elif tool_name == "memory_store":
            return await self._execute_memory_store(parameters, user_id, context)
        else:
            return {"error": f"Unknown tool: {tool_name}"}
    
    async def _execute_calculator(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Execute calculator tool"""
        expression = params.get("expression", "")
        try:
            allowed = {"abs": abs, "round": round, "min": min, "max": max, "pow": pow}
            result = eval(expression, {"__builtins__": {}}, allowed)
            return {"result": result}
        except Exception as e:
            return {"error": str(e)}
    
    async def _execute_document_search(self, params: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """Execute document search"""
        from app.services.rag_engine import get_rag_engine
        
        rag = get_rag_engine()
        results = await rag.search(user_id, params.get("query", ""), params.get("document_ids"))
        return {"results": results}
    
    async def _execute_memory_recall(self, params: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """Execute memory recall"""
        from app.services.memory_system import get_memory_system
        
        memory = get_memory_system()
        results = await memory.search_memories(user_id, params.get("query", ""))
        return {"results": results}
    
    async def _execute_memory_store(self, params: Dict[str, Any], user_id: str, context: Dict) -> Dict[str, Any]:
        """Execute memory store"""
        from app.services.memory_system import get_memory_system
        
        memory = get_memory_system()
        memory_id = await memory.add_memory(
            user_id=user_id,
            content=params.get("content", ""),
            category=params.get("category", "general"),
            source_chat_id=context.get("chat_id") if context else None
        )
        return {"memory_id": memory_id}
    
    async def initialize_tools_in_db(self):
        """Initialize built-in tools in database"""
        for name, tool in self.builtin_tools.items():
            existing = await database.tools.find_one({"name": name})
            if not existing:
                await database.tools.insert_one({
                    **tool,
                    "permission_level": "user_toggle",
                    "default_enabled": True,
                    "config": {},
                    "usage_count": 0,
                    "last_used": None,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                })
            else:
                # Update existing tool definitions (in case they changed)
                await database.tools.update_one(
                    {"name": name},
                    {"$set": {
                        "display_name": tool["display_name"],
                        "description": tool["description"],
                        "icon": tool["icon"],
                        "schema": tool["schema"],
                        "updated_at": datetime.utcnow()
                    }}
                )
    
    async def record_tool_usage(self, tool_name: str):
        """Record that a tool was used (increment usage_count and update last_used)"""
        await database.tools.update_one(
            {"name": tool_name},
            {
                "$inc": {"usage_count": 1},
                "$set": {"last_used": datetime.utcnow()}
            }
        )


_executor: Optional[ToolExecutor] = None


def get_tool_executor() -> ToolExecutor:
    global _executor
    if _executor is None:
        _executor = ToolExecutor()
    return _executor
