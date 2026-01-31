"""Custom Tools Models - For admin-created tools"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from enum import Enum


class ToolStatus(str, Enum):
    DRAFT = "draft"
    TESTING = "testing"
    RELEASED = "released"
    DISABLED = "disabled"


class ToolParameterType(str, Enum):
    STRING = "string"
    INTEGER = "integer"
    NUMBER = "number"
    BOOLEAN = "boolean"
    ARRAY = "array"
    OBJECT = "object"


class ToolParameter(BaseModel):
    """Definition of a tool parameter"""
    name: str
    type: ToolParameterType = ToolParameterType.STRING
    description: str
    required: bool = True
    default: Optional[Any] = None
    enum: Optional[List[str]] = None  # For string enums


class ValidationTestCase(BaseModel):
    """A test case for validating tool behavior"""
    id: str = Field(default_factory=lambda: str(__import__('uuid').uuid4()))
    name: str = Field(..., description="Name/description of the test case")
    input_params: Union[str, Dict[str, Any]] = Field(default="", description="Input value or parameters for the test")
    expected_output: Union[str, Any] = Field(..., description="Expected output (can be exact match or partial)")
    match_type: str = Field(default="contains", description="How to match: 'exact', 'contains', 'type_only'")
    enabled: bool = True


class TestRun(BaseModel):
    """Record of a tool test execution"""
    id: str
    timestamp: datetime
    input_params: Dict[str, Any]
    output: Optional[Any] = None
    error: Optional[str] = None
    duration_ms: int
    success: bool
    # For validation test runs
    test_case_id: Optional[str] = None
    expected_output: Optional[Any] = None
    match_result: Optional[str] = None  # Description of match/mismatch


class AutonomousBuildStatus(str, Enum):
    """Status of an autonomous build session"""
    IDLE = "idle"
    GENERATING = "generating"  # AI is generating initial code
    TESTING = "testing"  # Running validation tests
    FIXING = "fixing"  # AI is fixing issues
    COMPLETED = "completed"
    FAILED = "failed"


class AutonomousBuildIteration(BaseModel):
    """Record of a single iteration in autonomous build"""
    iteration: int
    timestamp: datetime
    action: str  # 'generate', 'test', 'fix'
    code_snapshot: Optional[str] = None
    test_results: List[Dict[str, Any]] = Field(default_factory=list)
    ai_response: Optional[str] = None
    status: str  # 'success', 'partial', 'failed'
    error: Optional[str] = None


class AutonomousBuildSession(BaseModel):
    """Record of an autonomous build session"""
    id: str
    tool_id: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: AutonomousBuildStatus = AutonomousBuildStatus.IDLE
    max_iterations: int = 5
    current_iteration: int = 0
    iterations: List[AutonomousBuildIteration] = Field(default_factory=list)
    final_code: Optional[str] = None
    total_tests_passed: int = 0
    total_tests_failed: int = 0


class CustomToolCreate(BaseModel):
    """Create a new custom tool"""
    name: str = Field(..., pattern=r'^[a-z][a-z0-9_]*$', description="Internal name (lowercase, underscores)")
    display_name: str
    description: str
    parameters: List[ToolParameter] = Field(default_factory=list)
    code: str = Field(default="async def execute(**kwargs):\n    # Your tool code here\n    return {\"result\": \"success\"}")
    validation_tests: List[ValidationTestCase] = Field(default_factory=list)


class CustomToolUpdate(BaseModel):
    """Update an existing custom tool"""
    display_name: Optional[str] = None
    description: Optional[str] = None
    parameters: Optional[List[ToolParameter]] = None
    code: Optional[str] = None
    status: Optional[ToolStatus] = None
    validation_tests: Optional[List[ValidationTestCase]] = None


class CustomToolResponse(BaseModel):
    """Custom tool response"""
    id: str
    name: str
    display_name: str
    description: str
    parameters: List[ToolParameter]
    code: str
    status: ToolStatus
    created_by: str
    created_at: datetime
    updated_at: datetime
    version: int
    test_results: List[TestRun] = Field(default_factory=list)
    validation_tests: List[ValidationTestCase] = Field(default_factory=list)
    autonomous_build_session: Optional[AutonomousBuildSession] = None


class CustomToolListResponse(BaseModel):
    """List of custom tools"""
    tools: List[CustomToolResponse]
    total: int


class ToolTestRequest(BaseModel):
    """Request to test a tool"""
    parameters: Dict[str, Any] = Field(default_factory=dict)


class ToolTestResponse(BaseModel):
    """Response from tool test"""
    success: bool
    output: Optional[Any] = None
    error: Optional[str] = None
    duration_ms: int
    logs: List[str] = Field(default_factory=list)


class ValidationTestResult(BaseModel):
    """Result of running a validation test"""
    test_case_id: str
    test_name: str
    success: bool
    input_params: Union[str, Dict[str, Any]]
    expected_output: Any
    actual_output: Optional[Any] = None
    error: Optional[str] = None
    match_description: str
    duration_ms: int


class RunValidationTestsResponse(BaseModel):
    """Response from running all validation tests"""
    total: int
    passed: int
    failed: int
    results: List[ValidationTestResult]
    all_passed: bool


class AIToolGenerateRequest(BaseModel):
    """Request AI to generate a tool"""
    prompt: str = Field(..., description="Describe what the tool should do")


class AIToolGenerateResponse(BaseModel):
    """AI-generated tool definition"""
    name: str
    display_name: str
    description: str
    parameters: List[ToolParameter]
    code: str
    explanation: str


class AutonomousBuildRequest(BaseModel):
    """Request to start an autonomous build"""
    prompt: str = Field(..., description="Describe what the tool should do")
    validation_tests: List[ValidationTestCase] = Field(..., min_length=3, description="At least 3 test cases required")
    max_iterations: int = Field(default=5, ge=1, le=10, description="Max attempts to fix failing tests")


class AutonomousBuildEvent(BaseModel):
    """Event during autonomous build (for streaming)"""
    event_type: str  # 'status', 'iteration', 'test_result', 'code_update', 'complete', 'error'
    timestamp: datetime
    data: Dict[str, Any]
