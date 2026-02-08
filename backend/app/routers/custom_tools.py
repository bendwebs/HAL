"""Custom Tools Router - Admin tool builder API"""

from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime
from typing import Dict, Any, List, Optional
import asyncio
import traceback
import time
import uuid
import re
import json

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
    ValidationTestCase,
    ValidationTestResult,
    RunValidationTestsResponse,
    AutonomousBuildRequest,
    AutonomousBuildStatus,
    AutonomousBuildSession,
    AutonomousBuildIteration,
    AutonomousBuildEvent,
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
        test_results=[TestRun(**t) for t in doc.get("test_results", [])[-10:]],  # Last 10 tests
        validation_tests=[ValidationTestCase(**v) for v in doc.get("validation_tests", [])],
        autonomous_build_session=doc.get("autonomous_build_session"),
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
        "validation_tests": [v.model_dump() for v in tool.validation_tests],
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
    
    if "validation_tests" in update_data:
        update_data["validation_tests"] = [v.model_dump() if hasattr(v, 'model_dump') else v for v in update_data["validation_tests"]]
    
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
            "timestamp": datetime.utcnow().isoformat() + "Z",  # ISO format with Z suffix for UTC
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
            "timestamp": datetime.utcnow().isoformat() + "Z",  # ISO format with Z suffix for UTC
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
    
    # Modules BLOCKED in the sandbox (dangerous/system-access modules)
    # Everything else is allowed — this avoids whack-a-mole with internal deps
    _blocked_modules = {
        'os', 'sys', 'subprocess', 'shutil', 'pathlib', 'glob',
        'socket', 'http', 'ftplib', 'smtplib', 'imaplib', 'poplib',
        'telnetlib', 'xmlrpc', 'multiprocessing', 'threading',
        'signal', 'ctypes', 'importlib', 'runpy', 'code', 'codeop',
        'compile', 'compileall', 'py_compile', 'zipimport',
        'pkgutil', 'modulefinder', 'dis', 'pickletools',
        'pickle', 'shelve', 'marshal', 'dbm', 'sqlite3',
        'webbrowser', 'turtle', 'tkinter', 'cmd', 'pdb',
        'profile', 'cProfile', 'trace', 'gc', 'inspect',
        'resource', 'pty', 'fcntl', 'termios', 'mmap',
        'tempfile', 'io',  # io is borderline but safer to block
    }
    
    # User-facing modules (documented in prompts — these are pre-loaded in namespace)
    _user_modules = {
        'json', 're', 'math', 'random', 'urllib', 'httpx', 'asyncio',
        'datetime', 'hashlib', 'base64', 'html', 'collections', 'itertools',
        'functools', 'string', 'textwrap', 'decimal', 'fractions',
    }
    
    # Controlled __import__ that blocks dangerous modules but allows everything else
    # Many stdlib functions internally call __import__ (e.g. datetime.now() imports time),
    # so we must provide it but restrict dangerous system-access modules.
    import builtins as _builtins
    def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
        root = name.split('.')[0]
        if root in _blocked_modules:
            raise ImportError(f"Import of '{name}' is not allowed in sandbox. Use pre-loaded modules: {', '.join(sorted(_user_modules))}")
        return _builtins.__import__(name, globals, locals, fromlist, level)
    
    # Allowed imports and builtins
    allowed_builtins = {
        'print': custom_print,
        '__import__': _safe_import,
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
    
    # Allow common safe imports — all pre-loaded into the namespace
    try:
        import json as _json
        import re as _re
        import math as _math
        import random as _random
        import urllib.parse
        import httpx as _httpx
        import datetime as _datetime
        import hashlib as _hashlib
        import base64 as _base64
        import html as _html
        
        namespace['json'] = _json
        namespace['re'] = _re
        namespace['math'] = _math
        namespace['random'] = _random
        namespace['urllib'] = urllib
        namespace['httpx'] = _httpx
        namespace['datetime'] = _datetime
        namespace['hashlib'] = _hashlib
        namespace['base64'] = _base64
        namespace['html'] = _html
    except ImportError:
        pass
    
    # Strip import statements from code and silently allow them
    # (since the modules are already in the namespace)
    # This prevents the common LLM failure of generating "from datetime import datetime"
    import_pattern = _re.compile(r'^(?:from\s+(\w+)(?:\.\w+)*\s+import\s+.+|import\s+(\w+(?:\.\w+)*)(?:\s+as\s+\w+)?)\s*$', _re.MULTILINE)
    
    available_modules = _user_modules
    
    def _check_and_strip_imports(code_text: str) -> str:
        """Strip import statements for available modules, error on unknown ones."""
        lines = code_text.split('\n')
        cleaned = []
        for line in lines:
            stripped = line.strip()
            match = import_pattern.match(stripped)
            if match:
                mod_name = match.group(1) or match.group(2)
                # Get the root module name (e.g., 'urllib' from 'urllib.parse')
                root_mod = mod_name.split('.')[0] if mod_name else ''
                if root_mod in available_modules:
                    # Silently strip — module is already in namespace
                    # But handle "from datetime import datetime" by adding the sub-import
                    if stripped.startswith('from '):
                        # e.g. "from datetime import datetime, timedelta"
                        from_match = _re.match(r'from\s+(\w+(?:\.\w+)*)\s+import\s+(.+)', stripped)
                        if from_match:
                            mod = from_match.group(1)
                            imports = [s.strip().split(' as ') for s in from_match.group(2).split(',')]
                            for imp in imports:
                                name = imp[0].strip()
                                alias = imp[-1].strip()
                                # Add the imported name to namespace
                                root = mod.split('.')[0]
                                if root in namespace:
                                    try:
                                        obj = namespace[root]
                                        for part in mod.split('.')[1:]:
                                            obj = getattr(obj, part)
                                        attr = getattr(obj, name, None)
                                        if attr is not None:
                                            namespace[alias] = attr
                                    except (AttributeError, TypeError):
                                        pass
                    continue  # Strip the import line either way
                else:
                    raise ValueError(
                        f"Import of '{root_mod}' is not allowed in tool code. "
                        f"Available modules: {', '.join(sorted(available_modules))}. "
                        f"These are pre-imported — use them directly without import statements."
                    )
            cleaned.append(line)
        return '\n'.join(cleaned)
    
    code = _check_and_strip_imports(code)
    
    # Execute the code to define the function
    exec(code, namespace)
    
    # Get the execute function
    if 'execute' not in namespace:
        raise ValueError("Tool code must define an 'execute' function")
    
    execute_func = namespace['execute']
    
    # Inspect the function signature to handle param mismatches gracefully
    import inspect
    try:
        sig = inspect.signature(execute_func)
        func_params = sig.parameters
        
        # Filter params to only those the function accepts
        # This prevents "missing required argument" when tests pass 'input'
        # but the function takes no params, and vice versa
        has_var_keyword = any(
            p.kind == inspect.Parameter.VAR_KEYWORD 
            for p in func_params.values()
        )
        
        if has_var_keyword:
            # Function accepts **kwargs, pass everything
            filtered_params = params
        else:
            # Only pass params that the function actually accepts
            accepted_names = set(func_params.keys())
            filtered_params = {k: v for k, v in params.items() if k in accepted_names}
    except (ValueError, TypeError):
        # If we can't inspect, pass as-is
        filtered_params = params
    
    # Call the function
    if asyncio.iscoroutinefunction(execute_func):
        result = await execute_func(**filtered_params)
    else:
        result = execute_func(**filtered_params)
    
    return result


def compare_outputs(actual: Any, expected: Any, match_type: str, input_params: Any = None) -> tuple[bool, str]:
    """Compare actual output with expected output based on match type"""
    # Convert actual to string representation for comparison if needed
    actual_str = str(actual) if not isinstance(actual, str) else actual
    
    # Handle expression match type FIRST (before other string checks)
    if match_type == "expression":
        # Dynamic expression validation
        # expected should be a string expression like "int(output) <= 6"
        # Variables available: output, actual, input, result, and any keys from output/input dicts
        try:
            if isinstance(expected, dict) and "expr" in expected:
                expr = expected["expr"]
                extra_vars = expected.get("vars", {})
            else:
                expr = str(expected)
                extra_vars = {}
            
            # Build evaluation context
            eval_context = {
                "output": actual,
                "actual": actual,
                "input": input_params if input_params else {},
                **extra_vars
            }
            
            # Add common output fields directly to context for convenience
            if isinstance(actual, dict):
                for k, v in actual.items():
                    if k not in eval_context:
                        eval_context[k] = v
                    # Also add as 'result' alias if there's an 'output' key
                    if k == 'output' and 'result' not in eval_context:
                        eval_context['result'] = v
            
            # If actual is a simple value, make it available as 'result' too
            if not isinstance(actual, dict):
                eval_context['result'] = actual
            
            # Add input fields directly if input is a dict
            if isinstance(input_params, dict):
                for k, v in input_params.items():
                    if k not in eval_context:
                        eval_context[k] = v
                
                # Try to parse dice notation from input (e.g., "2D6" -> num_dice=2, die_sides=6)
                input_str = input_params.get('input', '')
                if isinstance(input_str, str):
                    dice_match = re.match(r'(\d+)[dD](\d+)', input_str)
                    if dice_match:
                        if 'num_dice' not in eval_context:
                            eval_context['num_dice'] = int(dice_match.group(1))
                        if 'die_sides' not in eval_context:
                            eval_context['die_sides'] = int(dice_match.group(2))
            
            # Safe eval with limited builtins
            safe_builtins = {
                "int": int, "float": float, "str": str, "bool": bool,
                "len": len, "abs": abs, "min": min, "max": max,
                "sum": sum, "round": round, "isinstance": isinstance,
                "True": True, "False": False, "None": None,
            }
            
            eval_result = eval(expr, {"__builtins__": safe_builtins}, eval_context)
            
            if eval_result:
                return True, f"Expression passed: {expr}"
            else:
                # Provide helpful debug info
                debug_vars = {k: v for k, v in eval_context.items() if k not in ['output', 'actual', 'input']}
                return False, f"Expression failed: {expr} | Variables: {debug_vars}"
        except Exception as e:
            return False, f"Expression error: {str(e)}"
    
    # If expected is a simple string and not expression type, try to find it in the actual output
    if isinstance(expected, str):
        # Check in string representation of actual
        if expected in actual_str:
            return True, f"Found '{expected}' in output"
        # Also check if actual dict has a value matching expected
        if isinstance(actual, dict):
            for v in actual.values():
                if str(v) == expected or expected in str(v):
                    return True, f"Found '{expected}' in output value"
        return False, f"Expected '{expected}' not found in output: {actual_str[:200]}"
    
    if match_type == "exact":
        if actual == expected:
            return True, "Exact match"
        # Also try string comparison
        if actual_str == str(expected):
            return True, "Exact string match"
        return False, f"Expected exact match. Expected: {expected}, Got: {actual}"
    
    elif match_type == "contains":
        # For dicts, check if expected keys exist with matching values
        if isinstance(expected, dict) and isinstance(actual, dict):
            for key, value in expected.items():
                if key not in actual:
                    return False, f"Missing expected key: {key}"
                if actual[key] != value:
                    return False, f"Key '{key}' mismatch. Expected: {value}, Got: {actual[key]}"
            return True, "All expected keys found with matching values"
        
        # For strings, check if expected is contained in actual
        if isinstance(expected, str) and isinstance(actual, str):
            if expected in actual:
                return True, "Expected string found in output"
            return False, f"Expected string '{expected}' not found in output"
        
        # For lists, check if expected items exist in actual
        if isinstance(expected, list) and isinstance(actual, list):
            for item in expected:
                if item not in actual:
                    return False, f"Expected item not found: {item}"
            return True, "All expected items found"
        
        # Fallback to equality
        if actual == expected:
            return True, "Values match"
        return False, f"Expected: {expected}, Got: {actual}"
    
    elif match_type == "type_only":
        if type(actual).__name__ == type(expected).__name__:
            return True, f"Type match: {type(actual).__name__}"
        # Also check if expected is a string type name
        if isinstance(expected, str):
            if type(actual).__name__ == expected:
                return True, f"Type match: {expected}"
        return False, f"Type mismatch. Expected: {type(expected).__name__}, Got: {type(actual).__name__}"
    
    return False, f"Unknown match type: {match_type}"


def normalize_test_input(input_value: Any) -> Dict[str, Any]:
    """Normalize test input to a dict for function execution.
    
    Returns {} for empty/None inputs so parameterless functions work.
    Returns {"input": value} for simple string inputs.
    Returns the dict as-is for dict inputs.
    """
    if isinstance(input_value, dict):
        return input_value
    # Empty or None input → no params (allows parameterless execute())
    if not input_value and input_value != 0 and input_value is not False:
        return {}
    # If it's a simple string, wrap it as 'input' parameter
    return {"input": str(input_value)}


@router.post("/{tool_id}/run-validation-tests", response_model=RunValidationTestsResponse)
async def run_validation_tests(
    tool_id: str,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """Run all validation tests for a tool"""
    doc = await database.custom_tools.find_one({"_id": ObjectId(tool_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Tool not found")
    
    validation_tests = doc.get("validation_tests", [])
    if not validation_tests:
        raise HTTPException(status_code=400, detail="No validation tests defined")
    
    results = []
    for test_case in validation_tests:
        if not test_case.get("enabled", True):
            continue
        
        logs = []
        start_time = time.time()
        
        try:
            # Normalize input - can be a simple string or a dict
            input_params = normalize_test_input(test_case["input_params"])
            actual_output = await execute_tool_code(doc["code"], input_params, logs)
            duration_ms = int((time.time() - start_time) * 1000)
            
            # Compare outputs
            success, match_desc = compare_outputs(
                actual_output,
                test_case["expected_output"],
                test_case.get("match_type", "contains"),
                input_params  # Pass input for expression evaluation
            )
            
            results.append(ValidationTestResult(
                test_case_id=test_case["id"],
                test_name=test_case["name"],
                success=success,
                input_params=test_case["input_params"],
                expected_output=test_case["expected_output"],
                actual_output=actual_output,
                match_description=match_desc,
                duration_ms=duration_ms,
            ))
            
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            results.append(ValidationTestResult(
                test_case_id=test_case["id"],
                test_name=test_case["name"],
                success=False,
                input_params=test_case["input_params"],
                expected_output=test_case["expected_output"],
                actual_output=None,
                error=f"{type(e).__name__}: {str(e)}",
                match_description="Execution failed",
                duration_ms=duration_ms,
            ))
    
    passed = sum(1 for r in results if r.success)
    failed = len(results) - passed
    
    return RunValidationTestsResponse(
        total=len(results),
        passed=passed,
        failed=failed,
        results=results,
        all_passed=failed == 0,
    )


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

Available imports in the sandbox: json, re, math, random, urllib, httpx, asyncio, datetime, hashlib, base64, html

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


class AIChatRequest(BaseModel):
    prompt: str


class AIChatResponse(BaseModel):
    action: Optional[str] = None
    code: Optional[str] = None
    validation_tests: Optional[List[Dict[str, Any]]] = None
    explanation: Optional[str] = None


@router.post("/ai-chat", response_model=AIChatResponse)
async def ai_chat(
    request: AIChatRequest,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """AI chat endpoint for tool assistant - handles various request types"""
    import ollama
    
    try:
        client = ollama.Client(host=settings.ollama_base_url)
        response = client.chat(
            model=settings.default_chat_model,
            messages=[{"role": "user", "content": request.prompt}],
            options={"temperature": 0.3}
        )
        
        response_text = response['message']['content'].strip()
        
        # Try to extract JSON from response
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            try:
                data = json.loads(json_match.group())
                return AIChatResponse(
                    action=data.get("action"),
                    code=data.get("code"),
                    validation_tests=data.get("validation_tests"),
                    explanation=data.get("explanation", "")
                )
            except json.JSONDecodeError:
                pass
        
        # If no valid JSON, return as explanation (discussion response)
        return AIChatResponse(
            action="discuss",
            explanation=response_text
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI chat failed: {str(e)}")


def _analyze_test_signatures(validation_tests: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze test cases to infer parameter names, types, and tool behavior.
    
    Returns a dict with:
      - param_names: list of inferred parameter names
      - param_types: dict of name -> type
      - input_style: 'simple_string' | 'named_params' | 'empty'
      - output_style: 'string_contains' | 'dict_contains' | 'expression'
      - examples: formatted examples for the prompt
    """
    param_names = set()
    param_types: Dict[str, str] = {}
    input_style = "empty"
    output_style = "string_contains"
    has_expression = False
    examples = []
    
    for tc in validation_tests:
        inp = tc.get("input_params", "")
        exp = tc.get("expected_output", "")
        match_type = tc.get("match_type", "contains")
        
        # Determine input style
        if isinstance(inp, dict) and inp:
            input_style = "named_params"
            for k, v in inp.items():
                param_names.add(k)
                if isinstance(v, bool):
                    param_types[k] = "boolean"
                elif isinstance(v, int):
                    param_types[k] = "integer"
                elif isinstance(v, float):
                    param_types[k] = "number"
                elif isinstance(v, list):
                    param_types[k] = "array"
                elif isinstance(v, dict):
                    param_types[k] = "object"
                else:
                    param_types[k] = "string"
        elif isinstance(inp, str) and inp:
            if input_style != "named_params":
                input_style = "simple_string"
            param_names.add("input")
            param_types["input"] = "string"
        
        # Determine output style
        if match_type == "expression":
            has_expression = True
        elif isinstance(exp, dict) and exp:
            output_style = "dict_contains"
        
        # Build example line
        if isinstance(inp, str):
            inp_show = f'input="{inp}"' if inp else 'input=""'
        elif isinstance(inp, dict):
            inp_show = ", ".join(f'{k}={json.dumps(v)}' for k, v in inp.items())
        else:
            inp_show = ""
        
        if match_type == "expression":
            exp_show = f"EXPRESSION: {exp if isinstance(exp, str) else json.dumps(exp)}"
        elif isinstance(exp, str):
            exp_show = f'output must contain "{exp}"'
        else:
            exp_show = f"output must contain {json.dumps(exp)}"
        
        examples.append(f"  execute({inp_show})  →  {exp_show}")
    
    if has_expression:
        output_style = "expression"
    
    if not param_names:
        param_names = {"input"}
        param_types["input"] = "string"
        input_style = "simple_string"
    
    return {
        "param_names": sorted(param_names),
        "param_types": param_types,
        "input_style": input_style,
        "output_style": output_style,
        "examples": "\n".join(examples),
    }


def _build_parameter_spec(analysis: Dict[str, Any]) -> str:
    """Build the parameter JSON spec for the generation prompt."""
    params = []
    for name in analysis["param_names"]:
        ptype = analysis["param_types"].get(name, "string")
        params.append(f'{{"name": "{name}", "type": "{ptype}", "description": "The {name} parameter", "required": true}}')
    return ",\n        ".join(params)


def _build_function_signature(analysis: Dict[str, Any]) -> str:
    """Build the expected function signature."""
    return ", ".join(analysis["param_names"])


async def ai_generate_tool_with_tests(
    prompt: str,
    validation_tests: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Generate tool code that should pass the given validation tests.
    
    Uses a two-phase approach:
    1. Analyze test signatures to understand parameters and expected behavior
    2. Generate code with concrete examples showing exactly what's expected
    """
    import ollama
    
    analysis = _analyze_test_signatures(validation_tests)
    param_spec = _build_parameter_spec(analysis)
    func_sig = _build_function_signature(analysis)
    
    # Build detailed test table
    test_table_rows = []
    for i, tc in enumerate(validation_tests):
        inp = tc['input_params']
        exp = tc['expected_output']
        match = tc.get('match_type', 'contains')
        
        if isinstance(inp, str):
            inp_display = f'"{inp}"'
            call_display = f'execute(input="{inp}")'
        elif isinstance(inp, dict):
            inp_display = json.dumps(inp)
            args = ", ".join(f'{k}={json.dumps(v)}' for k, v in inp.items())
            call_display = f'execute({args})'
        else:
            inp_display = '""'
            call_display = 'execute(input="")'
        
        if match == "expression":
            exp_display = f'EXPRESSION CHECK: {exp}'
            rule = f'The expression `{exp}` must evaluate to True when `output` is the return value'
        elif isinstance(exp, str):
            exp_display = f'"{exp}"'
            rule = f'The string "{exp}" must appear somewhere in str(return_value)'
        elif isinstance(exp, dict):
            exp_display = json.dumps(exp)
            rule = f'Return dict must contain keys {list(exp.keys())} with matching values'
        else:
            exp_display = json.dumps(exp)
            rule = f'Return value must contain {exp_display}'
        
        test_table_rows.append(
            f"  Test {i+1}: \"{tc['name']}\"\n"
            f"    Call:     {call_display}\n"
            f"    Expected: {exp_display}  (match_type: {match})\n"
            f"    Rule:     {rule}"
        )
    
    test_table = "\n".join(test_table_rows)
    
    # Explain match semantics
    match_explanation = """MATCH SEMANTICS (how tests are validated):
- "contains": If expected is a string, it must appear in str(output). If expected is a dict, each key/value must exist in the output dict.
- "exact": Output must equal expected exactly.
- "expression": The expected value is a Python expression string. Variables available: output (the return value), plus any keys from the output dict. Must evaluate to True."""

    gen_prompt = f"""/no_think
You are a Python code generator. Your job is to write ONE Python async function that passes ALL of the test cases below.

TASK DESCRIPTION:
{prompt}

FUNCTION CONTRACT:
- Function name: execute
- Function signature: async def execute({func_sig})
- Must return a Python dict
- The dict values will be checked against expected outputs

{match_explanation}

TEST CASES (the function must pass ALL of these):
{test_table}

SANDBOX RULES:
- Do NOT write import statements — all modules are already pre-loaded in the global scope
- Available modules: json, re, math, random, urllib, httpx, asyncio, datetime, hashlib, base64, html
- For dates/times: use datetime.datetime.now(), datetime.timedelta(), etc. (the datetime MODULE is available, not the class directly)
- Use httpx for HTTP requests: response = await httpx.AsyncClient().get(url)
- Use print() for debug logging
- Must handle edge cases without crashing

STEP-BY-STEP:
1. Look at the test inputs and expected outputs
2. Figure out what transformation/logic maps each input to its expected output
3. Write the code that performs that transformation
4. Make sure the return dict contains the expected values

RESPONSE FORMAT — respond with ONLY this JSON, no other text, no markdown:
{{
    "name": "tool_name_snake_case",
    "display_name": "Human Readable Name",
    "description": "What this tool does",
    "parameters": [
        {param_spec}
    ],
    "code": "async def execute({func_sig}):\\n    # your implementation\\n    return {{\\"result\\": value}}",
    "explanation": "Brief explanation of the logic"
}}

CRITICAL: The "code" field must be a valid Python string with \\n for newlines. The function must be named `execute` and be async. Output ONLY the JSON object."""

    client = ollama.Client(host=settings.ollama_base_url)
    response = client.chat(
        model=settings.default_chat_model,
        messages=[{"role": "user", "content": gen_prompt}],
        options={"temperature": 0.2, "num_predict": 4096}
    )
    
    response_text = response['message']['content'].strip()
    
    # Strip thinking tags if present (qwen3 /no_think sometimes still emits them)
    response_text = re.sub(r'<think>[\s\S]*?</think>', '', response_text).strip()
    
    # Extract JSON from response (handle markdown wrapping)
    json_match = re.search(r'\{[\s\S]*\}', response_text)
    if json_match:
        response_text = json_match.group()
    
    try:
        result = json.loads(response_text)
    except json.JSONDecodeError:
        # Try to fix common JSON issues: unescaped newlines in code string
        cleaned = re.sub(r'(?<!\\)\n', '\\n', response_text)
        result = json.loads(cleaned)
    
    # Validate the code field contains an execute function
    code = result.get("code", "")
    if "def execute" not in code:
        raise ValueError(f"Generated code missing 'execute' function. Got: {code[:200]}")
    
    # Ensure parameters match what tests expect
    if not result.get("parameters"):
        result["parameters"] = [
            {"name": n, "type": analysis["param_types"].get(n, "string"),
             "description": f"The {n} parameter", "required": True}
            for n in analysis["param_names"]
        ]
    
    return result


async def ai_fix_tool_code(
    current_code: str,
    description: str,
    parameters: List[Dict[str, Any]],
    failed_tests: List[Dict[str, Any]],
    passing_tests: List[Dict[str, Any]] = None,
) -> str:
    """Ask AI to fix the tool code based on failed test results.
    
    Provides the AI with a structured diagnosis of each failure and
    concrete examples of what the output should look like.
    """
    import ollama
    
    # Build a structured diagnosis for each failure
    diagnosis_parts = []
    for i, ft in enumerate(failed_tests):
        input_val = ft['input_params']
        expected_val = ft['expected_output']
        actual_val = ft.get('actual_output')
        error = ft.get('error', '')
        match_desc = ft.get('match_description', '')
        match_type = ft.get('match_type', 'contains')
        
        if isinstance(input_val, str):
            call_display = f'execute(input="{input_val}")'
        elif isinstance(input_val, dict):
            args = ", ".join(f'{k}={json.dumps(v)}' for k, v in input_val.items())
            call_display = f'execute({args})'
        else:
            call_display = 'execute()'
        
        diagnosis = f"FAILURE {i+1}: \"{ft['test_name']}\"\n"
        diagnosis += f"  Call:     {call_display}\n"
        diagnosis += f"  Expected: {json.dumps(expected_val)}  (match: {match_type})\n"
        diagnosis += f"  Actual:   {json.dumps(actual_val)}\n"
        
        if error:
            # Extract the key error line (not the full traceback)
            error_lines = error.strip().split('\n')
            key_error = error_lines[0] if error_lines else error
            diagnosis += f"  Error:    {key_error}\n"
            
            # Classify the error type for better hints
            if "NameError" in error:
                diagnosis += f"  Hint:     A variable or function is not defined. No imports allowed — use pre-loaded modules.\n"
            elif "TypeError" in error:
                diagnosis += f"  Hint:     Wrong argument type or count. Check the function signature matches the call.\n"
            elif "KeyError" in error:
                diagnosis += f"  Hint:     A dictionary key is missing. Check the input parameter names.\n"
            elif "SyntaxError" in error:
                diagnosis += f"  Hint:     Python syntax error in the code. Check string escaping and indentation.\n"
            elif "ValueError" in error and "import" in error.lower():
                diagnosis += f"  Hint:     Import statements are NOT allowed. Modules json, re, math, random, httpx, asyncio are already in scope.\n"
        else:
            diagnosis += f"  Issue:    {match_desc}\n"
            # Add concrete hint about what the output needs
            if match_type == "contains" and isinstance(expected_val, str):
                diagnosis += f"  Hint:     The string \"{expected_val}\" must appear in str(return_value). Consider returning {{\"{expected_val.split()[0] if ' ' in expected_val else 'result'}\": \"{expected_val}\"}} or similar.\n"
        
        diagnosis_parts.append(diagnosis)
    
    diagnoses = "\n".join(diagnosis_parts)
    
    # Show passing tests to avoid regressions
    passing_note = ""
    if passing_tests:
        passing_lines = []
        for pt in passing_tests[:5]:  # Show max 5 passing examples
            inp = pt.get('input_params', '')
            if isinstance(inp, str):
                passing_lines.append(f"  ✓ execute(input=\"{inp}\") → {json.dumps(pt.get('actual_output', '?'))}")
            elif isinstance(inp, dict):
                args = ", ".join(f'{k}={json.dumps(v)}' for k, v in inp.items())
                passing_lines.append(f"  ✓ execute({args}) → {json.dumps(pt.get('actual_output', '?'))}")
        if passing_lines:
            passing_note = "\nPASSING TESTS (do NOT break these):\n" + "\n".join(passing_lines) + "\n"
    
    fix_prompt = f"""/no_think
You are fixing a Python function. Read the diagnosis below carefully, then output ONLY the corrected code.

TOOL DESCRIPTION: {description}

CURRENT CODE:
```python
{current_code}
```

FAILURE DIAGNOSIS:
{diagnoses}
{passing_note}
RULES:
- Must be an async function named 'execute'
- Do NOT write import statements — modules are already in scope: json, re, math, random, httpx, asyncio, datetime, hashlib, base64, html
- For dates: use datetime.datetime.now() (the datetime MODULE is in scope, not the class)
- Return a dict
- Fix ALL failures without breaking passing tests

Output ONLY the Python function code. No markdown backticks, no explanation, no comments outside the function."""

    client = ollama.Client(host=settings.ollama_base_url)
    response = client.chat(
        model=settings.default_chat_model,
        messages=[{"role": "user", "content": fix_prompt}],
        options={"temperature": 0.15, "num_predict": 4096}
    )
    
    code = response['message']['content'].strip()
    
    # Strip thinking tags if present
    code = re.sub(r'<think>[\s\S]*?</think>', '', code).strip()
    
    # Remove markdown code blocks if present
    code = re.sub(r'^```(?:python)?\s*', '', code)
    code = re.sub(r'\s*```$', '', code)
    code = code.strip()
    
    # Validate we got an execute function
    if "def execute" not in code:
        raise ValueError(f"AI fix did not produce an execute function. Got: {code[:200]}")
    
    return code


@router.post("/autonomous-build")
async def autonomous_build(
    request: AutonomousBuildRequest,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """Start an autonomous build that generates code and iterates until tests pass"""
    
    async def event_generator():
        """Generate SSE events for the build process"""
        session_id = str(uuid.uuid4())
        iterations = []
        
        def emit_event(event_type: str, data: Dict[str, Any]):
            event = AutonomousBuildEvent(
                event_type=event_type,
                timestamp=datetime.utcnow(),
                data=data
            )
            return f"data: {json.dumps(event.model_dump(), default=str)}\n\n"
        
        try:
            # Emit start event
            yield emit_event("status", {
                "session_id": session_id,
                "status": "generating",
                "message": "Starting autonomous build...",
            })
            
            validation_tests = [v.model_dump() for v in request.validation_tests]
            
            # Initial generation
            yield emit_event("status", {
                "status": "generating",
                "message": "Generating initial tool code...",
                "iteration": 1,
            })
            
            try:
                generated = await ai_generate_tool_with_tests(request.prompt, validation_tests)
            except Exception as e:
                yield emit_event("error", {"error": f"Failed to generate initial code: {str(e)}"})
                return
            
            current_code = generated["code"]
            current_params = generated["parameters"]
            tool_name = generated["name"]
            display_name = generated["display_name"]
            description = generated["description"]
            
            yield emit_event("code_update", {
                "code": current_code,
                "iteration": 1,
                "name": tool_name,
                "display_name": display_name,
                "description": description,
                "parameters": current_params,
            })
            
            # Iterate: test and fix
            for iteration in range(1, request.max_iterations + 1):
                yield emit_event("status", {
                    "status": "testing",
                    "message": f"Running validation tests...",
                    "iteration": iteration,
                    "phase": "testing",
                })
                
                # Run tests - emit each test result as it completes
                test_results = []
                all_passed = True
                
                for tc_idx, tc in enumerate(validation_tests):
                    if not tc.get("enabled", True):
                        continue
                    
                    # Emit that we're running this specific test
                    yield emit_event("test_running", {
                        "iteration": iteration,
                        "test_name": tc["name"],
                        "test_index": tc_idx + 1,
                        "total_tests": len(validation_tests),
                        "input": tc["input_params"],
                    })
                    
                    logs = []
                    start_time = time.time()
                    
                    try:
                        # Normalize input - can be a simple string or a dict
                        input_params = normalize_test_input(tc["input_params"])
                        actual_output = await execute_tool_code(current_code, input_params, logs)
                        duration_ms = int((time.time() - start_time) * 1000)
                        
                        success, match_desc = compare_outputs(
                            actual_output,
                            tc["expected_output"],
                            tc.get("match_type", "contains"),
                            input_params  # Pass input for expression evaluation
                        )
                        
                        result = {
                            "test_case_id": tc["id"],
                            "test_name": tc["name"],
                            "success": success,
                            "input_params": tc["input_params"],
                            "expected_output": tc["expected_output"],
                            "actual_output": actual_output,
                            "match_description": match_desc,
                            "duration_ms": duration_ms,
                            "logs": logs,
                        }
                        test_results.append(result)
                        
                        # Emit individual test result
                        yield emit_event("test_complete", {
                            "iteration": iteration,
                            "result": result,
                            "tests_completed": len(test_results),
                            "total_tests": len(validation_tests),
                        })
                        
                        if not success:
                            all_passed = False
                            
                    except Exception as e:
                        duration_ms = int((time.time() - start_time) * 1000)
                        result = {
                            "test_case_id": tc["id"],
                            "test_name": tc["name"],
                            "success": False,
                            "input_params": tc["input_params"],
                            "expected_output": tc["expected_output"],
                            "actual_output": None,
                            "error": f"{type(e).__name__}: {str(e)}",
                            "match_description": "Execution failed",
                            "duration_ms": duration_ms,
                            "logs": logs,
                        }
                        test_results.append(result)
                        
                        # Emit individual test result (failure)
                        yield emit_event("test_complete", {
                            "iteration": iteration,
                            "result": result,
                            "tests_completed": len(test_results),
                            "total_tests": len(validation_tests),
                        })
                        
                        all_passed = False
                
                # Emit summary of all test results
                passed = sum(1 for r in test_results if r["success"])
                failed = len(test_results) - passed
                
                yield emit_event("test_result", {
                    "iteration": iteration,
                    "passed": passed,
                    "failed": failed,
                    "total": len(test_results),
                    "results": test_results,
                    "all_passed": all_passed,
                })
                
                # Record iteration
                iterations.append({
                    "iteration": iteration,
                    "timestamp": datetime.utcnow().isoformat(),
                    "action": "test",
                    "code_snapshot": current_code,
                    "test_results": test_results,
                    "status": "success" if all_passed else "failed",
                })
                
                if all_passed:
                    yield emit_event("complete", {
                        "status": "completed",
                        "message": f"All tests passed! Build completed in {iteration} iteration(s).",
                        "iterations": iteration,
                        "code": current_code,
                        "name": tool_name,
                        "display_name": display_name,
                        "description": description,
                        "parameters": current_params,
                        "passed": passed,
                        "total": len(test_results),
                    })
                    return
                
                # Check if we've exceeded max iterations
                if iteration >= request.max_iterations:
                    yield emit_event("complete", {
                        "status": "max_iterations",
                        "message": f"Max iterations ({request.max_iterations}) reached. {passed}/{len(test_results)} tests passing.",
                        "iterations": iteration,
                        "code": current_code,
                        "name": tool_name,
                        "display_name": display_name,
                        "description": description,
                        "parameters": current_params,
                        "passed": passed,
                        "failed": failed,
                        "total": len(test_results),
                    })
                    return
                
                # Fix failing tests
                failed_tests = [r for r in test_results if not r["success"]]
                passing_tests = [r for r in test_results if r["success"]]
                
                # Enrich failed tests with match_type from the original test case
                for ft in failed_tests:
                    for tc in validation_tests:
                        if tc["id"] == ft["test_case_id"]:
                            ft["match_type"] = tc.get("match_type", "contains")
                            break
                
                # Emit details about what we're fixing
                yield emit_event("status", {
                    "status": "fixing",
                    "message": f"Analyzing {len(failed_tests)} failing test(s) and generating fix...",
                    "iteration": iteration + 1,
                    "phase": "fixing",
                    "failed_tests": [{"name": ft["test_name"], "error": ft.get("error") or ft.get("match_description")} for ft in failed_tests],
                })
                
                try:
                    fixed_code = await ai_fix_tool_code(
                        current_code,
                        description,
                        current_params,
                        failed_tests,
                        passing_tests=passing_tests,
                    )
                    current_code = fixed_code
                    
                    yield emit_event("code_update", {
                        "code": current_code,
                        "iteration": iteration + 1,
                        "action": "fix",
                        "message": f"Generated fix for {len(failed_tests)} failing test(s)",
                    })
                    
                except Exception as e:
                    yield emit_event("error", {
                        "error": f"Failed to fix code: {str(e)}",
                        "code": current_code,
                    })
                    return
            
        except Exception as e:
            yield emit_event("error", {"error": str(e), "traceback": traceback.format_exc()})
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


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
