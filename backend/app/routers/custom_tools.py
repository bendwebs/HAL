"""Custom Tools Router - Admin tool builder API"""

from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, List, Optional
import asyncio
import traceback
import time
import uuid
import re

from app.database import database
from app.auth import get_current_user
from app.config import settings
from app.models.custom_tool import (
    CustomToolCreate,
    CustomToolUpdate,
    CustomToolResponse,
    CustomToolListResponse,
    ToolParameter,
    ToolStatus,
    ToolTestRequest,
    ToolTestResponse,
    TestRun,
    AIToolGenerateRequest,
    AIToolGenerateResponse,
)

router = APIRouter(prefix="/admin/custom-tools", tags=["Admin Custom Tools"])


def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Require admin role"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def tool_doc_to_response(doc: Dict[str, Any]) -> CustomToolResponse:
    """Convert MongoDB document to response model"""
    return CustomToolResponse(
        id=str(doc["_id"]),
        name=doc["name"],
        display_name=doc["display_name"],
        description=doc["description"],
        parameters=[ToolParameter(**p) for p in doc.get("parameters", [])],
        code=doc["code"],
        status=ToolStatus(doc["status"]),
        created_by=str(doc["created_by"]),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
        version=doc.get("version", 1),
        test_results=[TestRun(**t) for t in doc.get("test_results", [])[-10:]]  # Last 10 tests
    )


@router.get("", response_model=CustomToolListResponse)
async def list_custom_tools(
    status_filter: Optional[ToolStatus] = None,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """List all custom tools"""
    query = {}
    if status_filter:
        query["status"] = status_filter.value
    
    docs = await database.custom_tools.find(query).sort("created_at", -1).to_list(100)
    
    return CustomToolListResponse(
        tools=[tool_doc_to_response(doc) for doc in docs],
        total=len(docs)
    )


@router.post("", response_model=CustomToolResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_tool(
    tool: CustomToolCreate,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """Create a new custom tool"""
    # Check for duplicate name
    existing = await database.custom_tools.find_one({"name": tool.name})
    if existing:
        raise HTTPException(status_code=400, detail=f"Tool with name '{tool.name}' already exists")
    
    now = datetime.utcnow()
    doc = {
        "name": tool.name,
        "display_name": tool.display_name,
        "description": tool.description,
        "parameters": [p.model_dump() for p in tool.parameters],
        "code": tool.code,
        "status": ToolStatus.DRAFT.value,
        "created_by": ObjectId(current_user["_id"]),
        "created_at": now,
        "updated_at": now,
        "version": 1,
        "test_results": [],
    }
    
    result = await database.custom_tools.insert_one(doc)
    doc["_id"] = result.inserted_id
    
    return tool_doc_to_response(doc)


@router.get("/{tool_id}", response_model=CustomToolResponse)
async def get_custom_tool(
    tool_id: str,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """Get a specific custom tool"""
    doc = await database.custom_tools.find_one({"_id": ObjectId(tool_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Tool not found")
    
    return tool_doc_to_response(doc)


@router.put("/{tool_id}", response_model=CustomToolResponse)
async def update_custom_tool(
    tool_id: str,
    update: CustomToolUpdate,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """Update a custom tool"""
    doc = await database.custom_tools.find_one({"_id": ObjectId(tool_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Tool not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if "parameters" in update_data:
        update_data["parameters"] = [p.model_dump() if hasattr(p, 'model_dump') else p for p in update_data["parameters"]]
    
    if "status" in update_data:
        update_data["status"] = update_data["status"].value if hasattr(update_data["status"], 'value') else update_data["status"]
    
    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        update_data["version"] = doc.get("version", 1) + 1
        
        await database.custom_tools.update_one(
            {"_id": ObjectId(tool_id)},
            {"$set": update_data}
        )
    
    updated_doc = await database.custom_tools.find_one({"_id": ObjectId(tool_id)})
    return tool_doc_to_response(updated_doc)


@router.delete("/{tool_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_tool(
    tool_id: str,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """Delete a custom tool"""
    result = await database.custom_tools.delete_one({"_id": ObjectId(tool_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tool not found")


@router.post("/{tool_id}/test", response_model=ToolTestResponse)
async def test_custom_tool(
    tool_id: str,
    request: ToolTestRequest,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """Test a custom tool with given parameters"""
    doc = await database.custom_tools.find_one({"_id": ObjectId(tool_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Tool not found")
    
    logs = []
    start_time = time.time()
    
    try:
        # Create a sandboxed execution environment
        result = await execute_tool_code(doc["code"], request.parameters, logs)
        duration_ms = int((time.time() - start_time) * 1000)
        
        # Record test result
        test_run = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow(),
            "input_params": request.parameters,
            "output": result,
            "error": None,
            "duration_ms": duration_ms,
            "success": True,
        }
        
        await database.custom_tools.update_one(
            {"_id": ObjectId(tool_id)},
            {"$push": {"test_results": test_run}}
        )
        
        return ToolTestResponse(
            success=True,
            output=result,
            duration_ms=duration_ms,
            logs=logs
        )
        
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        error_msg = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
        
        # Record failed test
        test_run = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow(),
            "input_params": request.parameters,
            "output": None,
            "error": error_msg,
            "duration_ms": duration_ms,
            "success": False,
        }
        
        await database.custom_tools.update_one(
            {"_id": ObjectId(tool_id)},
            {"$push": {"test_results": test_run}}
        )
        
        return ToolTestResponse(
            success=False,
            error=error_msg,
            duration_ms=duration_ms,
            logs=logs
        )


async def execute_tool_code(code: str, params: Dict[str, Any], logs: List[str]) -> Any:
    """Execute tool code in a sandboxed environment"""
    
    # Create a custom print function that captures output
    def custom_print(*args, **kwargs):
        logs.append(" ".join(str(a) for a in args))
    
    # Allowed imports and builtins
    allowed_builtins = {
        'print': custom_print,
        'len': len,
        'str': str,
        'int': int,
        'float': float,
        'bool': bool,
        'list': list,
        'dict': dict,
        'tuple': tuple,
        'set': set,
        'range': range,
        'enumerate': enumerate,
        'zip': zip,
        'map': map,
        'filter': filter,
        'sorted': sorted,
        'min': min,
        'max': max,
        'sum': sum,
        'abs': abs,
        'round': round,
        'isinstance': isinstance,
        'hasattr': hasattr,
        'getattr': getattr,
        'setattr': setattr,
        'None': None,
        'True': True,
        'False': False,
        'Exception': Exception,
        'ValueError': ValueError,
        'TypeError': TypeError,
        'KeyError': KeyError,
    }
    
    # Create execution namespace
    namespace = {
        '__builtins__': allowed_builtins,
        'asyncio': asyncio,
    }
    
    # Allow common safe imports
    try:
        import json
        import re
        import math
        import random
        import urllib.parse
        import httpx
        
        namespace['json'] = json
        namespace['re'] = re
        namespace['math'] = math
        namespace['random'] = random
        namespace['urllib'] = urllib
        namespace['httpx'] = httpx
    except ImportError:
        pass
    
    # Execute the code to define the function
    exec(code, namespace)
    
    # Get the execute function
    if 'execute' not in namespace:
        raise ValueError("Tool code must define an 'execute' function")
    
    execute_func = namespace['execute']
    
    # Call the function
    if asyncio.iscoroutinefunction(execute_func):
        result = await execute_func(**params)
    else:
        result = execute_func(**params)
    
    return result


@router.post("/{tool_id}/release", response_model=CustomToolResponse)
async def release_custom_tool(
    tool_id: str,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """Release a tool to make it available to users"""
    doc = await database.custom_tools.find_one({"_id": ObjectId(tool_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Tool not found")
    
    # Check if tool has been tested successfully
    test_results = doc.get("test_results", [])
    if not test_results:
        raise HTTPException(status_code=400, detail="Tool must be tested before release")
    
    last_test = test_results[-1]
    if not last_test.get("success"):
        raise HTTPException(status_code=400, detail="Last test must be successful before release")
    
    await database.custom_tools.update_one(
        {"_id": ObjectId(tool_id)},
        {"$set": {"status": ToolStatus.RELEASED.value, "updated_at": datetime.utcnow()}}
    )
    
    updated_doc = await database.custom_tools.find_one({"_id": ObjectId(tool_id)})
    return tool_doc_to_response(updated_doc)


@router.post("/{tool_id}/disable", response_model=CustomToolResponse)
async def disable_custom_tool(
    tool_id: str,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """Disable a released tool"""
    doc = await database.custom_tools.find_one({"_id": ObjectId(tool_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Tool not found")
    
    await database.custom_tools.update_one(
        {"_id": ObjectId(tool_id)},
        {"$set": {"status": ToolStatus.DISABLED.value, "updated_at": datetime.utcnow()}}
    )
    
    updated_doc = await database.custom_tools.find_one({"_id": ObjectId(tool_id)})
    return tool_doc_to_response(updated_doc)


@router.post("/generate", response_model=AIToolGenerateResponse)
async def ai_generate_tool(
    request: AIToolGenerateRequest,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """Use AI to generate a tool definition from a description"""
    import ollama
    
    prompt = f"""You are a tool generator for an AI assistant system. Generate a Python tool based on this description:

"{request.prompt}"

You must respond with ONLY valid JSON in this exact format (no markdown, no explanation):
{{
    "name": "tool_name_lowercase_underscores",
    "display_name": "Human Readable Name",
    "description": "What this tool does - this is shown to the AI when deciding to use tools",
    "parameters": [
        {{"name": "param_name", "type": "string", "description": "What this parameter is for", "required": true}},
        {{"name": "optional_param", "type": "integer", "description": "Optional parameter", "required": false, "default": 10}}
    ],
    "code": "async def execute(param_name, optional_param=10):\\n    # Tool implementation\\n    return {{\\"result\\": \\"value\\"}}",
    "explanation": "Brief explanation of how to use this tool"
}}

Parameter types can be: string, integer, number, boolean, array, object

The code should:
1. Be an async function named 'execute'
2. Have parameters matching the parameters list
3. Return a dictionary with results
4. Use httpx for HTTP requests (available as 'httpx')
5. Use print() for debug logging
6. Handle errors gracefully

Available imports in the sandbox: json, re, math, random, urllib, httpx, asyncio

RESPOND WITH ONLY THE JSON, NO OTHER TEXT."""

    try:
        client = ollama.Client(host=settings.ollama_base_url)
        response = client.chat(
            model=settings.default_chat_model,
            messages=[{"role": "user", "content": prompt}],
            options={"temperature": 0.3}
        )
        
        response_text = response['message']['content'].strip()
        
        # Try to extract JSON from response
        # Sometimes models wrap in ```json ... ```
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            response_text = json_match.group()
        
        import json
        data = json.loads(response_text)
        
        return AIToolGenerateResponse(
            name=data["name"],
            display_name=data["display_name"],
            description=data["description"],
            parameters=[ToolParameter(**p) for p in data["parameters"]],
            code=data["code"],
            explanation=data.get("explanation", "")
        )
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"AI generated invalid JSON: {str(e)}\nResponse: {response_text[:500]}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate tool: {str(e)}")


@router.get("/released/list")
async def list_released_tools(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """List all released tools (available to regular users)"""
    docs = await database.custom_tools.find({"status": ToolStatus.RELEASED.value}).to_list(100)
    
    return {
        "tools": [
            {
                "name": doc["name"],
                "display_name": doc["display_name"],
                "description": doc["description"],
                "parameters": doc["parameters"],
            }
            for doc in docs
        ]
    }
