"""Tool Executor - Execute tools and manage tool definitions"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from bson import ObjectId

from app.database import database


class ToolExecutor:
    """Executes tools and manages tool definitions"""
    
    def __init__(self):
        self.builtin_tools = self._define_builtin_tools()
    
    # Tools that are always injected into the system prompt and hidden from user toggle
    ALWAYS_ON_TOOLS = {"memory_recall", "memory_store", "document_search", "get_current_date", "get_current_time"}
    
    def _define_builtin_tools(self) -> Dict[str, Dict[str, Any]]:
        """Define built-in tools"""
        return {
            "get_current_date": {
                "name": "get_current_date",
                "display_name": "Get Current Date",
                "description": "Get the current date",
                "icon": "📅",
                "permission_level": "always_on",
                "schema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            "get_current_time": {
                "name": "get_current_time",
                "display_name": "Get Current Time",
                "description": "Get the current time",
                "icon": "🕐",
                "permission_level": "always_on",
                "schema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
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
            },
            "youtube_search": {
                "name": "youtube_search",
                "display_name": "YouTube Search",
                "description": "Search and play YouTube videos in the chat",
                "icon": "📺",
                "schema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Video search query"}
                    },
                    "required": ["query"]
                }
            },
            "generate_image": {
                "name": "generate_image",
                "display_name": "Generate Image",
                "description": "Generate images using Stable Diffusion AI. Create artwork, illustrations, photos, and more from text descriptions.",
                "icon": "🎨",
                "schema": {
                    "type": "object",
                    "properties": {
                        "prompt": {
                            "type": "string",
                            "description": "Detailed description of the image to generate. Be specific about style, lighting, composition, colors, etc."
                        },
                        "negative_prompt": {
                            "type": "string",
                            "description": "Things to avoid in the image (e.g., 'blurry, low quality, distorted')"
                        },
                        "width": {
                            "type": "integer",
                            "description": "Image width in pixels (default 512, max 1024)"
                        },
                        "height": {
                            "type": "integer",
                            "description": "Image height in pixels (default 512, max 1024)"
                        },
                        "steps": {
                            "type": "integer",
                            "description": "Number of generation steps (default 20, more = better quality but slower)"
                        }
                    },
                    "required": ["prompt"]
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
        elif tool_name == "get_current_date":
            return await self._execute_get_current_date(parameters)
        elif tool_name == "get_current_time":
            return await self._execute_get_current_time(parameters)
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
    
    async def _execute_get_current_date(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Return the current date"""
        from datetime import datetime as dt
        now = dt.now()
        return {
            "date": now.strftime("%Y-%m-%d"),
            "day_of_week": now.strftime("%A"),
            "formatted": now.strftime("%A, %B %d, %Y")
        }
    
    async def _execute_get_current_time(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Return the current time"""
        from datetime import datetime as dt
        now = dt.now()
        return {
            "time": now.strftime("%H:%M:%S"),
            "formatted": now.strftime("%I:%M %p"),
            "timezone": "local"
        }
    
    async def initialize_tools_in_db(self):
        """Initialize built-in tools in database.
        
        Tools in ALWAYS_ON_TOOLS get permission_level='always_on' forced on every startup.
        New tools use permission_level from their definition or default to 'user_toggle'.
        """
        for name, tool in self.builtin_tools.items():
            # Determine permission level: use tool definition, or always_on if in the set
            if name in self.ALWAYS_ON_TOOLS:
                perm = "always_on"
            else:
                perm = tool.get("permission_level", "user_toggle")
            
            existing = await database.tools.find_one({"name": name})
            if not existing:
                await database.tools.insert_one({
                    **tool,
                    "permission_level": perm,
                    "default_enabled": True,
                    "config": {},
                    "usage_count": 0,
                    "last_used": None,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                })
            else:
                # Update existing tool definitions (in case they changed)
                update_fields = {
                    "display_name": tool["display_name"],
                    "description": tool["description"],
                    "icon": tool["icon"],
                    "schema": tool["schema"],
                    "updated_at": datetime.utcnow()
                }
                # Always force permission_level for ALWAYS_ON tools
                if name in self.ALWAYS_ON_TOOLS:
                    update_fields["permission_level"] = "always_on"
                
                await database.tools.update_one(
                    {"name": name},
                    {"$set": update_fields}
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
