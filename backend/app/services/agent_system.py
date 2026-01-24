"""Agent System - Core AI agent with LLM tool calling"""

from typing import List, Dict, Any, Optional, AsyncGenerator
from bson import ObjectId
from datetime import datetime
import uuid
import json
import logging
import re

from app.database import database
from app.config import settings
from app.services.ollama_client import get_ollama_client
from app.services.rag_engine import get_rag_engine
from app.services.memory_system import get_memory_system
from app.services.resource_monitor import get_resource_monitor
from app.services.tool_executor import get_tool_executor
from app.services.web_search import get_web_search_service
from app.services.youtube_service import get_youtube_service
from app.services.stable_diffusion_service import get_stable_diffusion_service

logger = logging.getLogger(__name__)


# Tool definitions in Ollama format
TOOL_DEFINITIONS = {
    "web_search": {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for current information, news, prices, or recent events.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    }
                },
                "required": ["query"]
            }
        }
    },
    "youtube_search": {
        "type": "function",
        "function": {
            "name": "youtube_search",
            "description": "Search YouTube for videos to play. Use when the user wants to watch, play, or find a video. Returns video results that can be embedded and played in the chat.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The video search query - include video title, artist, topic, etc."
                    }
                },
                "required": ["query"]
            }
        }
    },
    "document_search": {
        "type": "function",
        "function": {
            "name": "document_search",
            "description": "Search through the user's uploaded documents for relevant information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "What to search for in documents"
                    }
                },
                "required": ["query"]
            }
        }
    },
    "memory_recall": {
        "type": "function",
        "function": {
            "name": "memory_recall",
            "description": "Search stored memories about the user - their preferences, personal info, past conversations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "What to search for in memories"
                    }
                },
                "required": ["query"]
            }
        }
    },
    "memory_store": {
        "type": "function",
        "function": {
            "name": "memory_store",
            "description": "Store new information about the user for future reference - their name, preferences, important facts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "The information to remember about the user"
                    },
                    "category": {
                        "type": "string",
                        "description": "Category: personal, preferences, work, or general"
                    }
                },
                "required": ["content"]
            }
        }
    },
    "calculator": {
        "type": "function", 
        "function": {
            "name": "calculator",
            "description": "Perform mathematical calculations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "Math expression like '2+2', 'sqrt(16)', '15% of 200'"
                    }
                },
                "required": ["expression"]
            }
        }
    },
    "generate_image": {
        "type": "function",
        "function": {
            "name": "generate_image",
            "description": "Generate an image using Stable Diffusion AI. Use when the user asks to create, generate, draw, or make an image, picture, artwork, illustration, or photo. Provide a detailed prompt describing what should be in the image.",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "Detailed description of the image to generate. Include style (realistic, anime, oil painting, etc.), subject, setting, lighting, colors, mood, and composition details."
                    },
                    "negative_prompt": {
                        "type": "string",
                        "description": "Things to avoid in the image. Default: 'blurry, bad quality, distorted, ugly, deformed'"
                    },
                    "width": {
                        "type": "integer",
                        "description": "Image width in pixels. Default 512. Use 768 or 1024 for larger images."
                    },
                    "height": {
                        "type": "integer",
                        "description": "Image height in pixels. Default 512. Use 768 or 1024 for larger images."
                    }
                },
                "required": ["prompt"]
            }
        }
    }
}


class AgentSystem:
    """Main agent system with LLM tool calling support"""
    
    def __init__(self):
        self.model = settings.default_chat_model
        self.max_depth = settings.max_agent_depth
        self._warmed_up = False
    
    async def warmup(self) -> bool:
        """Warm up the model"""
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
            logger.error(f"Warmup failed: {e}")
            return False
    
    def _get_tools_for_ollama(self, enabled_tool_names: List[str]) -> List[Dict[str, Any]]:
        """Get tool definitions in Ollama format"""
        tools = []
        for name in enabled_tool_names:
            if name in TOOL_DEFINITIONS:
                tools.append(TOOL_DEFINITIONS[name])
        return tools
    
    async def _execute_tool(
        self,
        tool_name: str,
        parameters: Dict[str, Any],
        user_id: str,
        chat_id: str
    ) -> Dict[str, Any]:
        """Execute a tool and return the result"""
        tool_executor = get_tool_executor()
        
        try:
            if tool_name == "web_search":
                web_search = get_web_search_service()
                if not web_search.is_available:
                    return {"success": False, "error": "Web search not configured"}
                
                result = await web_search.search_and_save(
                    user_id=user_id,
                    query=parameters.get("query", ""),
                    max_results=5
                )
                
                if result.get("success"):
                    formatted = f"Search results for: {parameters.get('query')}\n\n"
                    if result.get("answer"):
                        formatted += f"Summary: {result['answer']}\n\n"
                    for i, r in enumerate(result.get("results", [])[:5]):
                        formatted += f"{i+1}. {r.get('title', '')}\n"
                        formatted += f"   {r.get('content', '')[:250]}...\n\n"
                    
                    await tool_executor.record_tool_usage("web_search")
                    return {"success": True, "result": formatted, "count": result.get("result_count", 0)}
                else:
                    return {"success": False, "error": result.get("error", "Search failed")}
            
            elif tool_name == "document_search":
                rag = get_rag_engine()
                results = await rag.search(user_id, parameters.get("query", ""), limit=5)
                
                if results:
                    formatted = "Found in documents:\n\n"
                    for r in results:
                        formatted += f"From '{r['document_name']}':\n{r['content'][:400]}...\n\n"
                    
                    await tool_executor.record_tool_usage("document_search")
                    return {"success": True, "result": formatted, "count": len(results)}
                else:
                    return {"success": True, "result": "No relevant documents found.", "count": 0}
            
            elif tool_name == "memory_recall":
                memory_system = get_memory_system()
                if not memory_system.is_available:
                    return {"success": False, "error": "Memory system not available"}
                
                results = await memory_system.search_memories(
                    user_id, parameters.get("query", ""), limit=5
                )
                
                if results:
                    formatted = "Memories found:\n" + "\n".join([f"- {m['content']}" for m in results])
                    await tool_executor.record_tool_usage("memory_recall")
                    return {"success": True, "result": formatted, "count": len(results)}
                else:
                    return {"success": True, "result": "No relevant memories found.", "count": 0}
            
            elif tool_name == "memory_store":
                memory_system = get_memory_system()
                if not memory_system.is_available:
                    return {"success": False, "error": "Memory system not available"}
                
                content = parameters.get("content", "")
                category = parameters.get("category", "general")
                
                memory_id = await memory_system.add_memory(
                    user_id=user_id,
                    content=content,
                    category=category,
                    source_chat_id=chat_id
                )
                
                await tool_executor.record_tool_usage("memory_store")
                return {"success": True, "result": f"Stored: {content}", "memory_id": memory_id}
            
            elif tool_name == "calculator":
                expression = parameters.get("expression", "")
                try:
                    import math
                    # Handle percentage expressions
                    expr = expression.lower()
                    if "% of" in expr:
                        match = re.match(r"(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)", expr)
                        if match:
                            pct, val = float(match.group(1)), float(match.group(2))
                            result = (pct / 100) * val
                            await tool_executor.record_tool_usage("calculator")
                            return {"success": True, "result": f"{expression} = {result}"}
                    
                    allowed = {
                        "abs": abs, "round": round, "min": min, "max": max,
                        "pow": pow, "sqrt": math.sqrt, "sin": math.sin,
                        "cos": math.cos, "tan": math.tan, "pi": math.pi,
                        "e": math.e, "log": math.log, "log10": math.log10
                    }
                    result = eval(expression, {"__builtins__": {}}, allowed)
                    await tool_executor.record_tool_usage("calculator")
                    return {"success": True, "result": f"{expression} = {result}"}
                except Exception as e:
                    return {"success": False, "error": f"Calculation error: {str(e)}"}
            
            elif tool_name == "youtube_search":
                youtube = get_youtube_service()
                if not youtube.is_available:
                    return {"success": False, "error": "YouTube API not configured. Add YOUTUBE_API_KEY to .env"}
                
                result = await youtube.search_and_score(
                    user_id=user_id,
                    query=parameters.get("query", ""),
                    chat_id=chat_id,
                    max_results=5
                )
                
                logger.info(f"[YOUTUBE] Search result: success={result.get('success')}, videos={len(result.get('videos', []))}")
                
                if result.get("success"):
                    await tool_executor.record_tool_usage("youtube_search")
                    
                    # Return structured data for frontend to render
                    youtube_result = {
                        "success": True,
                        "type": "youtube_results",
                        "action": result.get("action"),  # "play" or "select"
                        "query": result.get("query"),
                        "videos": result.get("videos", []),
                        "selected_video": result.get("selected_video"),
                        "top_confidence": result.get("top_confidence"),
                        "search_id": result.get("search_id"),
                        "message": result.get("message", "")
                    }
                    logger.info(f"[YOUTUBE] Returning structured result with {len(youtube_result.get('videos', []))} videos")
                    return youtube_result
                else:
                    return {"success": False, "error": result.get("error", "YouTube search failed")}
            
            elif tool_name == "generate_image":
                sd = get_stable_diffusion_service()
                
                prompt = parameters.get("prompt", "")
                if not prompt:
                    return {"success": False, "error": "No prompt provided for image generation"}
                
                # Get optional parameters with defaults
                negative_prompt = parameters.get("negative_prompt", "")
                width = min(parameters.get("width", 512), 1024)  # Cap at 1024
                height = min(parameters.get("height", 512), 1024)
                steps = min(parameters.get("steps", 20), 50)  # Cap at 50 steps
                
                # Check if SD needs to start (this is quick)
                if not await sd.check_availability():
                    logger.info(f"[GENERATE_IMAGE] SD not running, will auto-start...")
                
                logger.info(f"[GENERATE_IMAGE] Generating image: {prompt[:100]}...")
                
                # generate_image now handles ensure_running internally
                result = await sd.generate_image(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    width=width,
                    height=height,
                    steps=steps
                )
                
                if result.get("success"):
                    await tool_executor.record_tool_usage("generate_image")
                    
                    # Return structured data for frontend to render
                    image_result = {
                        "success": True,
                        "type": "generated_image",
                        "images": result.get("images", []),
                        "prompt": prompt,
                        "negative_prompt": negative_prompt,
                        "width": width,
                        "height": height,
                        "steps": steps,
                        "seed": result.get("seed"),
                        "message": f"Generated image for: {prompt[:50]}..."
                    }
                    logger.info(f"[GENERATE_IMAGE] Successfully generated {len(image_result.get('images', []))} image(s)")
                    return image_result
                else:
                    return {"success": False, "error": result.get("error", "Image generation failed")}
            
            else:
                return {"success": False, "error": f"Unknown tool: {tool_name}"}
        
        except Exception as e:
            logger.error(f"Tool execution error for {tool_name}: {e}")
            return {"success": False, "error": str(e)}

    async def generate_response_stream(
        self,
        chat_id: str,
        user_id: str,
        message: str,
        document_ids: List[str] = None,
        persona_id: Optional[str] = None,
        model_override: Optional[str] = None,
        voice_mode: bool = False,
        enabled_tools: Optional[List[str]] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Generate response with streaming and tool calling"""
        model = model_override or self.model
        ollama = get_ollama_client()
        
        # Default tools if not specified
        if enabled_tools is None:
            enabled_tools = ["web_search", "youtube_search", "generate_image", "document_search", "memory_recall", "memory_store", "calculator"]
        
        # Get system prompt with tool availability info and memory context for voice mode
        system_prompt = await self._get_system_prompt(
            persona_id, user_id, enabled_tools, 
            voice_mode=voice_mode, 
            user_message=message
        )
        
        if voice_mode:
            system_prompt += "\n\nYou are in voice mode. Keep responses concise. No asterisks or markdown."
        
        # Get Ollama tool definitions
        tools = self._get_tools_for_ollama(enabled_tools) if enabled_tools else None
        
        # Get chat history
        history = await self._get_chat_history(chat_id, limit=10)
        
        # Build messages
        messages = [{"role": m["role"], "content": m["content"]} for m in history]
        
        # Check if history contains responses about tools being disabled but they're now enabled
        # If so, inject a context correction message
        if enabled_tools and "web_search" in enabled_tools:
            history_text = " ".join([m.get("content", "") for m in history if m.get("role") == "assistant"])
            history_lower = history_text.lower()
            
            tool_disabled_phrases = [
                "tools are currently disabled",
                "tool has been disabled",
                "has been disabled",
                "is disabled",
                "are disabled",
                "web search capability is disabled", 
                "don't have access to real-time",
                "can't fetch the current price",
                "can't check the current price",
                "cannot check",
                "tools needed to fetch",
                "my available tools don't allow",
                "unable to perform web searches",
                "cannot search the web",
                "ability to search for real-time data has been disabled",
                "search for real-time data has been disabled",
                "that tool has been disabled",
                "unfortunately, that tool",
                "i would need to use my web_search tool. unfortunately"
            ]
            
            history_mentions_disabled = any(phrase in history_lower for phrase in tool_disabled_phrases)
            
            logger.info(f"[TOOL CHECK] enabled_tools={enabled_tools}, history_mentions_disabled={history_mentions_disabled}")
            if history_mentions_disabled:
                logger.info(f"[TOOL CHECK] Detected disabled tool mention in history, injecting correction")
            
            if history_mentions_disabled:
                # Inject a system-style correction before the user's new message
                tool_status_update = (
                    "[SYSTEM UPDATE: Tool settings have changed. web_search is NOW ENABLED. "
                    "You CAN and SHOULD use web_search for this request. "
                    "Ignore any previous statements about tools being disabled.]"
                )
                messages.append({"role": "user", "content": tool_status_update})
                messages.append({"role": "assistant", "content": "Understood. I now have access to web_search and will use it for relevant requests."})
        
        # Check if history shows successful tool usage but tools are now DISABLED
        # This prevents the model from hallucinating data based on previous successful searches
        if not enabled_tools or "web_search" not in enabled_tools:
            history_text = " ".join([m.get("content", "") for m in history if m.get("role") == "assistant"])
            history_lower = history_text.lower()
            
            # Phrases that indicate a successful web search was done previously
            successful_search_phrases = [
                "current price of",
                "as of today",
                "as of january",
                "as of february", 
                "as of march",
                "stock is approximately",
                "stock is around",
                "price is approximately",
                "price is around",
                "according to",
                "i found",
                "search results show"
            ]
            
            history_shows_search_results = any(phrase in history_lower for phrase in successful_search_phrases)
            
            if history_shows_search_results:
                logger.info(f"[TOOL CHECK] History shows previous search results but web_search is now DISABLED, injecting correction")
                # Inject a correction that tools are now disabled
                tool_status_update = (
                    "[SYSTEM UPDATE: Tool settings have changed. web_search is NOW DISABLED. "
                    "You can NO LONGER access real-time data or search the web. "
                    "Do NOT provide current prices or real-time data. "
                    "If asked for current information, explain that web search has been disabled.]"
                )
                messages.append({"role": "user", "content": tool_status_update})
                messages.append({"role": "assistant", "content": "Understood. Web search is now disabled. I cannot provide current prices or real-time information."})
        
        messages.append({"role": "user", "content": message})
        
        logger.info(f"[MESSAGES] Sending {len(messages)} messages to model, tools={[t['function']['name'] for t in (tools or [])]}")
        
        # Check if this looks like a video search request
        message_lower = message.lower()
        is_video_request = any(phrase in message_lower for phrase in [
            'video', 'youtube', 'watch', 'show me', 'find me', 'play'
        ]) and 'youtube_search' in (enabled_tools or [])
        
        # First call - with tools to see if model wants to use any
        tool_calls_to_execute = []
        first_response_content = ""
        
        logger.info(f"[OLLAMA CALL] model={model}, tools_count={len(tools) if tools else 0}, tools_passed={tools is not None}")
        
        # Non-streaming first call to check for tool usage
        try:
            first_response = await ollama.chat(
                model=model,
                messages=messages,
                system=system_prompt,
                tools=tools
            )
            
            msg = first_response.get("message", {})
            first_response_content = msg.get("content", "")
            
            logger.info(f"[OLLAMA RESPONSE] tool_calls={msg.get('tool_calls')}, content_preview={first_response_content[:100] if first_response_content else 'None'}...")
            
            if msg.get("tool_calls"):
                tool_calls_to_execute = msg["tool_calls"]
                logger.info(f"[TOOL CALLS] Model wants to call: {[tc.get('function', {}).get('name') for tc in tool_calls_to_execute]}")
            
            # If user asked for videos but model didn't call youtube_search, retry with a hint
            elif is_video_request and not tool_calls_to_execute:
                logger.info(f"[YOUTUBE RETRY] User asked for videos but model didn't call tool, retrying with hint")
                
                # Add a hint message and retry
                retry_messages = messages.copy()
                retry_messages.append({
                    "role": "assistant", 
                    "content": "I should use the youtube_search tool to find videos for you."
                })
                retry_messages.append({
                    "role": "user",
                    "content": "Yes, please use the youtube_search tool to search for videos."
                })
                
                retry_response = await ollama.chat(
                    model=model,
                    messages=retry_messages,
                    system=system_prompt,
                    tools=tools
                )
                
                retry_msg = retry_response.get("message", {})
                if retry_msg.get("tool_calls"):
                    tool_calls_to_execute = retry_msg["tool_calls"]
                    first_response_content = retry_msg.get("content", "")
                    logger.info(f"[YOUTUBE RETRY] Success! Tool calls: {[tc.get('function', {}).get('name') for tc in tool_calls_to_execute]}")
        except Exception as e:
            logger.error(f"First LLM call failed: {e}")
            yield {"type": "error", "data": {"message": str(e)}}
            return
        
        # Execute any tool calls
        tool_results = []
        for tool_call in tool_calls_to_execute:
            func = tool_call.get("function", {})
            tool_name = func.get("name", "")
            
            try:
                args = func.get("arguments", {})
                if isinstance(args, str):
                    args = json.loads(args)
            except:
                args = {}
            
            action_id = str(uuid.uuid4())
            
            # Notify start
            yield {
                "type": "action_start",
                "data": {
                    "id": action_id,
                    "type": "tool_call",
                    "name": tool_name,
                    "parameters": args,
                    "status": "running"
                }
            }
            
            start_time = datetime.utcnow()
            result = await self._execute_tool(tool_name, args, user_id, chat_id)
            duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            
            tool_results.append({
                "tool_call": tool_call,
                "result": result
            })
            
            # Notify completion
            status = "complete" if result.get("success") else "failed"
            
            # For structured results (like youtube_results), pass the entire result object
            # For simple results, extract just the result/error string
            if result.get("type") == "youtube_results":
                result_data = result  # Pass full structured data for YouTube
                logger.info(f"[YOUTUBE] Yielding action_complete with full result data, videos={len(result.get('videos', []))}")
            else:
                result_data = result.get("result") or result.get("error")
            
            yield {
                "type": "action_complete",
                "data": {
                    "id": action_id,
                    "type": "tool_call",
                    "name": tool_name,
                    "parameters": args,
                    "status": status,
                    "result": result_data,
                    "duration_ms": duration_ms
                }
            }
        
        # If tools were called, make a second call with results
        if tool_results:
            # Add assistant message with tool calls
            messages.append({
                "role": "assistant",
                "content": first_response_content or "",
                "tool_calls": tool_calls_to_execute
            })
            
            # Add tool results
            for tr in tool_results:
                messages.append({
                    "role": "tool",
                    "content": json.dumps(tr["result"])
                })
            
            # Final streaming response
            try:
                async for chunk in ollama.chat_stream(
                    model=model,
                    messages=messages,
                    system=system_prompt
                ):
                    if chunk.get("message", {}).get("content"):
                        delta = chunk["message"]["content"]
                        yield {"type": "content", "data": {"delta": delta}}
                    
                    if chunk.get("done"):
                        yield {
                            "type": "done",
                            "data": {
                                "model": model,
                                "token_usage": {
                                    "prompt": chunk.get("prompt_eval_count", 0),
                                    "completion": chunk.get("eval_count", 0),
                                    "total": chunk.get("prompt_eval_count", 0) + chunk.get("eval_count", 0)
                                }
                            }
                        }
            except Exception as e:
                yield {"type": "error", "data": {"message": str(e)}}
        
        else:
            # No tool calls - stream the first response content
            if first_response_content:
                # Send content in chunks to simulate streaming
                chunk_size = 10
                for i in range(0, len(first_response_content), chunk_size):
                    yield {"type": "content", "data": {"delta": first_response_content[i:i+chunk_size]}}
            
            yield {
                "type": "done",
                "data": {
                    "model": model,
                    "token_usage": {"prompt": 0, "completion": 0, "total": 0}
                }
            }

    async def generate_response(
        self,
        chat_id: str,
        user_id: str,
        message: str,
        document_ids: List[str] = None,
        persona_id: Optional[str] = None,
        model_override: Optional[str] = None,
        voice_mode: bool = False,
        enabled_tools: Optional[List[str]] = None,
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
            chat_id, user_id, message, document_ids,
            persona_id, model_override, voice_mode, enabled_tools
        ):
            if chunk["type"] == "content":
                result["content"] += chunk["data"].get("delta", "")
            elif chunk["type"] == "action_complete":
                result["actions"].append(chunk["data"])
            elif chunk["type"] == "done":
                result["token_usage"] = chunk["data"].get("token_usage", result["token_usage"])
        
        return result

    async def _get_system_prompt(self, persona_id: Optional[str], user_id: str, enabled_tools: Optional[List[str]] = None, voice_mode: bool = False, user_message: str = "") -> str:
        """Get system prompt from persona or default, with optional memory injection for voice mode"""
        
        # For voice mode, automatically fetch relevant memories to inject
        memory_context = ""
        if voice_mode and user_message:
            memory_context = await self._get_relevant_memories_for_context(user_id, user_message)
        
        if persona_id:
            persona = await database.personas.find_one({"_id": ObjectId(persona_id)})
            if persona:
                base_prompt = persona["system_prompt"]
                # Add tool availability info to persona prompt
                prompt = self._add_tool_availability_info(base_prompt, enabled_tools)
                if memory_context:
                    prompt = self._inject_memory_context(prompt, memory_context)
                return prompt
        
        # Build the default system prompt with tool availability
        all_tools = {
            "web_search": "For current events, news, prices, recent information",
            "youtube_search": "To search and play YouTube videos - use when user wants to watch, play, or find videos",
            "generate_image": "To create AI-generated images - use when user asks to create, generate, draw, or make an image/picture/artwork",
            "document_search": "To find info in user's uploaded documents",
            "memory_recall": "To remember things about this user",
            "memory_store": "To save important info about the user (name, preferences, etc)",
            "calculator": "For math calculations"
        }
        
        if enabled_tools is None:
            enabled_tools = list(all_tools.keys())
        
        enabled_tools_set = set(enabled_tools) if enabled_tools else set()
        
        # Build tool descriptions
        enabled_list = []
        disabled_list = []
        
        for tool_name, description in all_tools.items():
            if tool_name in enabled_tools_set:
                enabled_list.append(f"- {tool_name}: {description}")
            else:
                disabled_list.append(tool_name.replace("_", " "))
        
        prompt = """You are HAL, a friendly AI assistant running locally.

"""
        
        # Inject memory context for personalization (especially important in voice mode)
        if memory_context:
            prompt = self._inject_memory_context(prompt, memory_context)
        
        # CURRENT TOOL STATUS - emphasize this is the current state
        prompt += "=== CURRENT TOOL STATUS (this overrides any previous statements in chat history) ===\n"
        
        if enabled_list:
            prompt += "ENABLED TOOLS - You CAN and SHOULD use these tools when relevant:\n"
            prompt += "\n".join(enabled_list)
            prompt += "\n\n"
            prompt += """CRITICAL RULES FOR TOOL USAGE:
1. For ANY question about current/real-time data (stock prices, news, weather, sports scores, current events), you MUST use web_search. DO NOT answer from memory.
2. Stock prices change constantly - NEVER guess or use old data. ALWAYS search.
3. If you're unsure whether information is current, USE THE TOOL.
4. Do not say "as of today" or give specific prices unless you just performed a web_search.
5. NEVER fabricate or hallucinate data - if you didn't search, you don't know the current value.

"""
        
        if disabled_list:
            prompt += f"DISABLED TOOLS - These are currently unavailable: {', '.join(disabled_list)}.\n"
            prompt += "Only mention tool limitations if the user asks for something requiring a DISABLED tool.\n\n"
        
        if not enabled_list:
            prompt += "NOTE: All tools are currently disabled. You can only respond based on your training knowledge. "
            prompt += "If the user asks for real-time information, current prices, or other data that would require tools, "
            prompt += "explain that you cannot access that information because the required tools are disabled.\n\n"
        
        prompt += "=== END TOOL STATUS ===\n\n"
        
        if "memory_store" in enabled_tools_set:
            prompt += "When the user tells you personal information (their name, preferences, where they live, etc), use memory_store to save it!\n\n"
        
        prompt += """Response style:
- Be conversational and friendly
- Avoid markdown formatting (no **, ##, bullets)
- Use natural flowing sentences
- NEVER claim to perform an action you haven't actually done
- NEVER make up or fabricate prices, statistics, or current data - ALWAYS use web_search first
- If tools are available, USE THEM instead of saying you can't access information"""
        
        return prompt
    
    async def _get_relevant_memories_for_context(self, user_id: str, message: str) -> str:
        """Fetch relevant memories to inject into context for personalized responses.
        
        This is especially useful in voice mode where we want the AI to naturally
        use what it knows about the user without requiring explicit tool calls.
        """
        try:
            memory_system = get_memory_system()
            if not memory_system.is_available:
                return ""
            
            # Get core user memories (name, preferences, key facts)
            # These should always be included for personalization
            all_memories = await memory_system.get_all_memories(user_id, limit=20)
            
            # Also search for memories relevant to the current message
            relevant_memories = await memory_system.search_memories(user_id, message, limit=5)
            
            # Combine and deduplicate
            memory_ids_seen = set()
            combined_memories = []
            
            # Add relevant memories first (most important)
            for mem in relevant_memories:
                if mem["id"] not in memory_ids_seen and mem.get("score", 0) > 0.5:
                    memory_ids_seen.add(mem["id"])
                    combined_memories.append(mem["content"])
            
            # Add core memories (name, location, job, etc.) - filter for important ones
            important_keywords = ["name is", "lives in", "works", "job", "profession", "likes", "prefers", "favorite", "always", "never"]
            for mem in all_memories:
                if mem["id"] not in memory_ids_seen:
                    content_lower = mem["content"].lower()
                    if any(kw in content_lower for kw in important_keywords):
                        memory_ids_seen.add(mem["id"])
                        combined_memories.append(mem["content"])
            
            if not combined_memories:
                return ""
            
            # Limit to avoid context overflow
            combined_memories = combined_memories[:10]
            
            return "\n".join([f"- {m}" for m in combined_memories])
            
        except Exception as e:
            logger.error(f"Error fetching memories for context: {e}")
            return ""
    
    def _inject_memory_context(self, prompt: str, memory_context: str) -> str:
        """Inject memory context into the system prompt."""
        memory_section = f"""=== WHAT YOU KNOW ABOUT THIS USER ===
Use this information naturally in your responses. Don't explicitly say "I remember that..." - just use the knowledge as if you naturally know it.

{memory_context}

=== END USER CONTEXT ===

"""
        # Insert at the beginning of the prompt, after any initial greeting
        if prompt.startswith("You are"):
            # Find the end of the first paragraph
            first_newline = prompt.find("\n\n")
            if first_newline > 0:
                return prompt[:first_newline + 2] + memory_section + prompt[first_newline + 2:]
        
        return memory_section + prompt
    
    def _add_tool_availability_info(self, base_prompt: str, enabled_tools: Optional[List[str]] = None) -> str:
        """Add tool availability information to a persona prompt"""
        all_tools = ["web_search", "youtube_search", "document_search", "memory_recall", "memory_store", "calculator"]
        
        if enabled_tools is None:
            enabled_tools = all_tools
        
        enabled_tools_set = set(enabled_tools) if enabled_tools else set()
        disabled_tools = [t.replace("_", " ") for t in all_tools if t not in enabled_tools_set]
        enabled_tools_names = [t.replace("_", " ") for t in all_tools if t in enabled_tools_set]
        
        prompt_addition = "\n\n=== CURRENT TOOL STATUS (overrides any previous statements) ===\n"
        
        if enabled_tools_names:
            prompt_addition += f"ENABLED: {', '.join(enabled_tools_names)}. USE these tools when relevant!\n"
        
        if disabled_tools:
            prompt_addition += f"DISABLED: {', '.join(disabled_tools)}.\n"
        
        prompt_addition += "=== END TOOL STATUS ===\n"
        
        return base_prompt + prompt_addition
    
    async def _get_chat_history(self, chat_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent chat history"""
        messages = await database.messages.find(
            {"chat_id": ObjectId(chat_id)}
        ).sort("created_at", -1).limit(limit).to_list(limit)
        
        messages.reverse()
        return [{"role": m["role"], "content": m["content"]} for m in messages]


# Singleton
_system: Optional[AgentSystem] = None


def get_agent_system() -> AgentSystem:
    global _system
    if _system is None:
        _system = AgentSystem()
    return _system
