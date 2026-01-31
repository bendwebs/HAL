'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { customTools, CustomTool, ToolParameter, ValidationTestCase, ValidationTestResult, AutonomousBuildEvent } from '@/lib/api';
import { 
  ArrowLeft, 
  Plus, 
  Wrench, 
  Play, 
  Rocket, 
  Trash2,
  Sparkles,
  Code,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Ban,
  Edit3,
  Save,
  X,
  Zap,
  FlaskConical,
  CircleDot,
  AlertCircle,
  Send
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  draft: 'bg-gray-500/20 text-gray-400',
  testing: 'bg-yellow-500/20 text-yellow-400',
  released: 'bg-green-500/20 text-green-400',
  disabled: 'bg-red-500/20 text-red-400',
};

const STATUS_ICONS = {
  draft: Edit3,
  testing: Play,
  released: CheckCircle,
  disabled: Ban,
};

interface AutoBuildLogEntry {
  timestamp: Date;
  type: 'status' | 'test_running' | 'test_complete' | 'code_update' | 'error' | 'info';
  message: string;
  details?: any;
  success?: boolean;
}

interface AutoBuildState {
  isRunning: boolean;
  status: string;
  message: string;
  iteration: number;
  maxIterations: number;
  testResults: ValidationTestResult[];
  passed: number;
  failed: number;
  total: number;
  code: string;
  generatedTool: {
    name: string;
    display_name: string;
    description: string;
    parameters: ToolParameter[];
  } | null;
  error: string | null;
  completed: boolean;
  log: AutoBuildLogEntry[];
}

export default function ToolBuilderPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [tools, setTools] = useState<CustomTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTool, setSelectedTool] = useState<CustomTool | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testParams, setTestParams] = useState<Record<string, any>>({});
  const [testResult, setTestResult] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  
  // Autonomous Build state
  const [showAutoBuildModal, setShowAutoBuildModal] = useState(false);
  const [autoBuildPrompt, setAutoBuildPrompt] = useState('');
  const [autoBuildTests, setAutoBuildTests] = useState<ValidationTestCase[]>([
    { id: crypto.randomUUID(), name: 'Test 1', input_params: {}, expected_output: {}, match_type: 'contains', enabled: true },
    { id: crypto.randomUUID(), name: 'Test 2', input_params: {}, expected_output: {}, match_type: 'contains', enabled: true },
    { id: crypto.randomUUID(), name: 'Test 3', input_params: {}, expected_output: {}, match_type: 'contains', enabled: true },
  ]);
  const [autoBuildMaxIterations, setAutoBuildMaxIterations] = useState(5);
  const [autoBuildState, setAutoBuildState] = useState<AutoBuildState>({
    isRunning: false,
    status: 'idle',
    message: '',
    iteration: 0,
    maxIterations: 5,
    testResults: [],
    passed: 0,
    failed: 0,
    total: 0,
    code: '',
    generatedTool: null,
    error: null,
    completed: false,
    log: [],
  });
  const autoBuildLogRef = useRef<HTMLDivElement>(null);
  
  // AI Assistant state (integrated into tool editor)
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string, id?: number}>>([]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  // Validation tests tab state
  const [showValidationTests, setShowValidationTests] = useState(false);
  const [isRunningValidation, setIsRunningValidation] = useState(false);
  const [validationResults, setValidationResults] = useState<{
    total: number;
    passed: number;
    failed: number;
    results: ValidationTestResult[];
    all_passed: boolean;
  } | null>(null);
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    display_name: '',
    description: '',
    parameters: [] as ToolParameter[],
    code: '',
    validation_tests: [] as ValidationTestCase[],
  });
  
  // Auto-scroll effects
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [aiChatMessages, isAiThinking]);
  
  useEffect(() => {
    if (autoBuildLogRef.current) {
      autoBuildLogRef.current.scrollTop = autoBuildLogRef.current.scrollHeight;
    }
  }, [autoBuildState]);

  useEffect(() => {
    if (user?.role !== 'admin') {
      router.push('/chat');
      return;
    }
    loadTools();
  }, [user, router]);

  const loadTools = async () => {
    try {
      setIsLoading(true);
      const data = await customTools.list();
      setTools(data?.tools || []);
    } catch (err) {
      toast.error('Failed to load tools');
      setTools([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTool = (tool: CustomTool) => {
    setSelectedTool(tool);
    setEditForm({
      name: tool.name,
      display_name: tool.display_name,
      description: tool.description,
      parameters: tool.parameters,
      code: tool.code,
      validation_tests: tool.validation_tests || [],
    });
    setIsEditing(false);
    setTestResult(null);
    setValidationResults(null);
    setShowValidationTests(false);
    const params: Record<string, any> = {};
    tool.parameters.forEach(p => {
      if (p.default !== undefined) {
        params[p.name] = p.default;
      } else if (p.type === 'boolean') {
        params[p.name] = false;
      } else if (p.type === 'integer' || p.type === 'number') {
        params[p.name] = 0;
      } else {
        params[p.name] = '';
      }
    });
    setTestParams(params);
  };

  const handleCreateBlankTool = async () => {
    try {
      const timestamp = Date.now();
      const newTool = await customTools.create({
        name: `new_tool_${timestamp}`,
        display_name: 'New Tool',
        description: 'Describe what this tool does',
        parameters: [],
        code: `async def execute(**kwargs):
    """
    Your tool code here.
    
    Available imports: json, re, math, random, urllib, httpx, asyncio
    Use print() for debug logging.
    Return a dictionary with results.
    """
    return {"result": "success"}`,
        validation_tests: [],
      });
      toast.success('New tool created');
      loadTools();
      handleSelectTool(newTool);
      setIsEditing(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create tool');
    }
  };

  const handleSaveTool = async () => {
    if (!selectedTool) return;
    try {
      const updated = await customTools.update(selectedTool.id, {
        display_name: editForm.display_name,
        description: editForm.description,
        parameters: editForm.parameters,
        code: editForm.code,
        validation_tests: editForm.validation_tests,
      });
      toast.success('Tool saved');
      setSelectedTool(updated);
      setIsEditing(false);
      loadTools();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save tool');
    }
  };

  const handleTestTool = async () => {
    if (!selectedTool) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await customTools.test(selectedTool.id, testParams);
      setTestResult(result);
      if (result.success) {
        toast.success(`Test passed in ${result.duration_ms}ms`);
      } else {
        toast.error('Test failed');
      }
      const updated = await customTools.get(selectedTool.id);
      setSelectedTool(updated);
    } catch (err: any) {
      toast.error(err.message || 'Test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleRunValidationTests = async () => {
    if (!selectedTool) return;
    setIsRunningValidation(true);
    setValidationResults(null);
    try {
      const result = await customTools.runValidationTests(selectedTool.id);
      setValidationResults(result);
      if (result.all_passed) {
        toast.success(`All ${result.total} validation tests passed!`);
      } else {
        toast.error(`${result.failed}/${result.total} tests failed`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to run validation tests');
    } finally {
      setIsRunningValidation(false);
    }
  };

  const handleReleaseTool = async () => {
    if (!selectedTool) return;
    try {
      const updated = await customTools.release(selectedTool.id);
      toast.success('Tool released!');
      setSelectedTool(updated);
      loadTools();
    } catch (err: any) {
      toast.error(err.message || 'Failed to release tool');
    }
  };

  const handleDisableTool = async () => {
    if (!selectedTool) return;
    try {
      const updated = await customTools.disable(selectedTool.id);
      toast.success('Tool disabled');
      setSelectedTool(updated);
      loadTools();
    } catch (err: any) {
      toast.error(err.message || 'Failed to disable tool');
    }
  };

  const handleDeleteTool = async () => {
    if (!selectedTool) return;
    if (!confirm(`Delete tool "${selectedTool.display_name}"? This cannot be undone.`)) return;
    try {
      await customTools.delete(selectedTool.id);
      toast.success('Tool deleted');
      setSelectedTool(null);
      loadTools();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete tool');
    }
  };

  const handleAIGenerate = async () => {
    if (!generatePrompt.trim()) return;
    setIsGenerating(true);
    try {
      const generated = await customTools.aiGenerate(generatePrompt);
      const newTool = await customTools.create({
        name: generated.name,
        display_name: generated.display_name,
        description: generated.description,
        parameters: generated.parameters,
        code: generated.code,
      });
      toast.success('Tool generated and saved as draft!');
      setShowGenerateModal(false);
      loadTools();
      handleSelectTool(newTool);
      setIsEditing(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate tool');
    } finally {
      setIsGenerating(false);
    }
  };

  // Autonomous Build functions
  const addAutoBuildTest = () => {
    setAutoBuildTests(prev => [...prev, {
      id: crypto.randomUUID(),
      name: `Test ${prev.length + 1}`,
      input_params: {},
      expected_output: {},
      match_type: 'contains',
      enabled: true,
    }]);
  };

  const updateAutoBuildTest = (index: number, field: keyof ValidationTestCase, value: any) => {
    setAutoBuildTests(prev => prev.map((t, i) => 
      i === index ? { ...t, [field]: value } : t
    ));
  };

  const removeAutoBuildTest = (index: number) => {
    if (autoBuildTests.length <= 3) {
      toast.error('Minimum 3 test cases required');
      return;
    }
    setAutoBuildTests(prev => prev.filter((_, i) => i !== index));
  };

  const handleStartAutonomousBuild = async () => {
    if (!autoBuildPrompt.trim()) {
      toast.error('Please provide a tool description');
      return;
    }
    
    const validTests = autoBuildTests.filter(t => t.enabled);
    if (validTests.length < 3) {
      toast.error('At least 3 enabled test cases are required');
      return;
    }
    
    const addLog = (type: AutoBuildLogEntry['type'], message: string, details?: any, success?: boolean) => {
      setAutoBuildState(prev => ({
        ...prev,
        log: [...prev.log, { timestamp: new Date(), type, message, details, success }],
      }));
    };
    
    setAutoBuildState({
      isRunning: true,
      status: 'starting',
      message: 'Starting autonomous build...',
      iteration: 0,
      maxIterations: autoBuildMaxIterations,
      testResults: [],
      passed: 0,
      failed: 0,
      total: 0,
      code: '',
      generatedTool: null,
      error: null,
      completed: false,
      log: [{ timestamp: new Date(), type: 'info', message: '🚀 Starting autonomous build process...' }],
    });
    
    try {
      for await (const event of customTools.autonomousBuild(
        autoBuildPrompt,
        autoBuildTests,
        autoBuildMaxIterations
      )) {
        const { event_type, data } = event;
        
        switch (event_type) {
          case 'status':
            setAutoBuildState(prev => ({
              ...prev,
              status: data.status,
              message: data.message,
              iteration: data.iteration || prev.iteration,
              log: [...prev.log, { 
                timestamp: new Date(), 
                type: 'status', 
                message: data.phase === 'fixing' 
                  ? `🔧 Iteration ${data.iteration}: ${data.message}`
                  : `📋 Iteration ${data.iteration || prev.iteration}: ${data.message}`,
                details: data.failed_tests,
              }],
            }));
            break;
          
          case 'test_running':
            setAutoBuildState(prev => ({
              ...prev,
              log: [...prev.log, { 
                timestamp: new Date(), 
                type: 'test_running', 
                message: `  ▶ Running test ${data.test_index}/${data.total_tests}: "${data.test_name}"`,
                details: { input: data.input },
              }],
            }));
            break;
          
          case 'test_complete':
            setAutoBuildState(prev => ({
              ...prev,
              log: [...prev.log, { 
                timestamp: new Date(), 
                type: 'test_complete', 
                message: data.result.success 
                  ? `  ✅ PASS: "${data.result.test_name}" (${data.result.duration_ms}ms)`
                  : `  ❌ FAIL: "${data.result.test_name}" - ${data.result.error || data.result.match_description}`,
                details: data.result,
                success: data.result.success,
              }],
            }));
            break;
            
          case 'code_update':
            setAutoBuildState(prev => ({
              ...prev,
              code: data.code,
              iteration: data.iteration || prev.iteration,
              generatedTool: data.name ? {
                name: data.name,
                display_name: data.display_name,
                description: data.description,
                parameters: data.parameters,
              } : prev.generatedTool,
              log: [...prev.log, { 
                timestamp: new Date(), 
                type: 'code_update', 
                message: data.action === 'fix' 
                  ? `💻 Code updated with fix for failing tests`
                  : `💻 Initial code generated`,
              }],
            }));
            break;
            
          case 'test_result':
            setAutoBuildState(prev => ({
              ...prev,
              testResults: data.results,
              passed: data.passed,
              failed: data.failed,
              total: data.total,
              iteration: data.iteration,
              log: [...prev.log, { 
                timestamp: new Date(), 
                type: 'info', 
                message: data.all_passed 
                  ? `🎉 All ${data.total} tests passed!`
                  : `📊 Test results: ${data.passed}/${data.total} passed, ${data.failed} failed`,
                success: data.all_passed,
              }],
            }));
            break;
            
          case 'complete':
            setAutoBuildState(prev => ({
              ...prev,
              isRunning: false,
              status: data.status,
              message: data.message,
              code: data.code || prev.code,
              passed: data.passed,
              failed: data.failed ?? prev.failed,
              total: data.total,
              completed: true,
              generatedTool: data.name ? {
                name: data.name,
                display_name: data.display_name,
                description: data.description,
                parameters: data.parameters,
              } : prev.generatedTool,
              log: [...prev.log, { 
                timestamp: new Date(), 
                type: data.status === 'completed' ? 'info' : 'status', 
                message: data.status === 'completed'
                  ? `✨ BUILD COMPLETE: All tests passing after ${data.iterations} iteration(s)!`
                  : `⚠️ BUILD FINISHED: ${data.passed}/${data.total} tests passing after ${data.iterations} iterations`,
                success: data.status === 'completed',
              }],
            }));
            
            if (data.status === 'completed') {
              toast.success('Autonomous build completed successfully!');
            } else {
              toast.success(`Build finished: ${data.passed}/${data.total} tests passing`);
            }
            break;
            
          case 'error':
            setAutoBuildState(prev => ({
              ...prev,
              isRunning: false,
              status: 'error',
              error: data.error,
              completed: true,
              log: [...prev.log, { 
                timestamp: new Date(), 
                type: 'error', 
                message: `🚨 ERROR: ${data.error}`,
              }],
            }));
            toast.error(`Build error: ${data.error}`);
            break;
        }
      }
    } catch (err: any) {
      setAutoBuildState(prev => ({
        ...prev,
        isRunning: false,
        status: 'error',
        error: err.message,
        completed: true,
        log: [...prev.log, { 
          timestamp: new Date(), 
          type: 'error', 
          message: `🚨 ERROR: ${err.message}`,
        }],
      }));
      toast.error(err.message || 'Autonomous build failed');
    }
  };

  const handleSaveAutoBuildResult = async () => {
    if (!autoBuildState.generatedTool || !autoBuildState.code) {
      toast.error('No generated tool to save');
      return;
    }
    
    try {
      const newTool = await customTools.create({
        name: autoBuildState.generatedTool.name,
        display_name: autoBuildState.generatedTool.display_name,
        description: autoBuildState.generatedTool.description,
        parameters: autoBuildState.generatedTool.parameters,
        code: autoBuildState.code,
        validation_tests: autoBuildTests,
      });
      
      toast.success('Tool saved as draft!');
      setShowAutoBuildModal(false);
      loadTools();
      handleSelectTool(newTool);
      
      setAutoBuildState({
        isRunning: false,
        status: 'idle',
        message: '',
        iteration: 0,
        maxIterations: 5,
        testResults: [],
        passed: 0,
        failed: 0,
        total: 0,
        code: '',
        generatedTool: null,
        error: null,
        completed: false,
        log: [],
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to save tool');
    }
  };

  // Quick action helper - sends a message directly without needing state update
  const sendAIMessage = (message: string) => {
    if (!selectedTool || isAiThinking) return;
    setAiChatInput('');
    // Temporarily set the input and trigger send
    const fakeEvent = { trim: () => message } as any;
    handleAIChatSendWithMessage(message);
  };

  const handleAIChatSendWithMessage = async (directMessage?: string) => {
    const userMessage = directMessage || aiChatInput.trim();
    if (!userMessage || !selectedTool || isAiThinking) return;
    
    setAiChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setAiChatInput('');
    setIsAiThinking(true);
    
    // Activity log helper - shows real-time what the AI is doing
    const activityLog: string[] = [];
    const logActivity = (action: string) => {
      const timestamp = new Date().toLocaleTimeString();
      activityLog.push(`[${timestamp}] ${action}`);
      setAiChatMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.id) {
          lastMsg.content = activityLog.join('\n');
        }
        return newMessages;
      });
    };
    
    const thinkingMsgId = Date.now();
    setAiChatMessages(prev => [...prev, { 
      role: 'assistant', 
      content: '⏳ Starting...',
      id: thinkingMsgId,
    }]);
    
    try {
      const currentCode = isEditing ? editForm.code : selectedTool.code;
      const currentTests = isEditing ? editForm.validation_tests : (selectedTool.validation_tests || []);
      const currentParams = isEditing ? editForm.parameters : selectedTool.parameters;
      const lowerMessage = userMessage.toLowerCase();
      
      logActivity('📝 Parsing request...');
      
      // Detect different request types
      const isValidationTestRequest = lowerMessage.includes('validation') || 
        (lowerMessage.includes('run') && lowerMessage.includes('test') && !lowerMessage.match(/\d+\s*time/));
      const isManualTestRequest = lowerMessage.includes('test the tool') || 
        lowerMessage.includes('try the tool') ||
        lowerMessage.match(/test.*\d+\s*time/);
      const isFixRequest = lowerMessage.includes('fix') || lowerMessage.includes('repair') || lowerMessage.includes('debug');
      const isCreateTestRequest = lowerMessage.includes('create') && lowerMessage.includes('test');
      
      // If user wants to fix/update test inputs, let it go to the AI (don't block it)
      // The AI will handle updating the validation_tests
      
      // Handle validation test requests
      if (isValidationTestRequest && !isManualTestRequest) {
        logActivity('🧪 Running validation tests...');
        
        const savedTests = selectedTool.validation_tests || [];
        
        if (savedTests.length === 0) {
          setAiChatMessages(prev => prev.filter(m => m.id !== thinkingMsgId));
          setAiChatMessages(prev => [...prev, { 
            role: 'assistant', 
            content: "📋 No validation tests defined. Would you like me to create some tests for this tool?"
          }]);
          setIsAiThinking(false);
          return;
        }
        
        if (isEditing) {
          setAiChatMessages(prev => prev.filter(m => m.id !== thinkingMsgId));
          setAiChatMessages(prev => [...prev, { 
            role: 'assistant', 
            content: "⚠️ You're in edit mode. Please **Save** your changes first, then I can run the tests."
          }]);
          setIsAiThinking(false);
          return;
        }
        
        try {
          setIsRunningValidation(true);
          setShowValidationTests(true);
          
          logActivity(`🔄 Executing ${savedTests.filter(t => t.enabled).length} tests...`);
          const result = await customTools.runValidationTests(selectedTool.id);
          setValidationResults(result);
          
          logActivity(`✅ Tests complete: ${result.passed}/${result.total} passed`);
          
          setTimeout(() => {
            document.getElementById('validation-results')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
          
          setAiChatMessages(prev => prev.filter(m => m.id !== thinkingMsgId));
          
          if (result.all_passed) {
            setAiChatMessages(prev => [...prev, { 
              role: 'assistant', 
              content: `✅ **All ${result.total} validation tests passed!**\n\nThe tool is ready for release.`
            }]);
          } else {
            const failedTests = result.results.filter(r => !r.success);
            const failedSummary = failedTests.map(f => 
              `• **${f.test_name}**: ${f.error || f.match_description}${f.actual_output ? `\n  Got: \`${JSON.stringify(f.actual_output)}\`` : ''}`
            ).join('\n');
            setAiChatMessages(prev => [...prev, { 
              role: 'assistant', 
              content: `❌ **${result.failed}/${result.total} tests failed:**\n\n${failedSummary}\n\n💡 Say "fix it" and I'll update the code to pass these tests.`
            }]);
          }
        } catch (err: any) {
          setAiChatMessages(prev => prev.filter(m => m.id !== thinkingMsgId));
          setAiChatMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `❌ **Error:** ${err.message}`
          }]);
        } finally {
          setIsRunningValidation(false);
        }
        setIsAiThinking(false);
        return;
      }
      
      // Handle manual test requests (e.g., "test the tool 2 times")
      if (isManualTestRequest) {
        const timesMatch = lowerMessage.match(/(\d+)\s*time/);
        const times = timesMatch ? parseInt(timesMatch[1]) : 1;
        
        logActivity(`🎯 Running manual test${times > 1 ? `s (${times}x)` : ''}...`);
        
        const results: Array<{success: boolean; output: any; error?: string; duration_ms: number}> = [];
        
        for (let i = 0; i < times; i++) {
          logActivity(`🔄 Test run ${i + 1}/${times}...`);
          
          try {
            const result = await customTools.test(selectedTool.id, testParams);
            results.push(result);
            logActivity(`${result.success ? '✅' : '❌'} Run ${i + 1}: ${result.success ? 'Passed' : 'Failed'} (${result.duration_ms}ms)`);
            
            // Reload tool to get updated test history
            const updatedTool = await customTools.get(selectedTool.id);
            setSelectedTool(updatedTool);
          } catch (err: any) {
            results.push({ success: false, output: null, error: err.message, duration_ms: 0 });
            logActivity(`❌ Run ${i + 1}: Error - ${err.message}`);
          }
          
          // Small delay between tests
          if (i < times - 1) {
            await new Promise(r => setTimeout(r, 200));
          }
        }
        
        setAiChatMessages(prev => prev.filter(m => m.id !== thinkingMsgId));
        
        const passed = results.filter(r => r.success).length;
        const summary = results.map((r, i) => 
          `• Run ${i + 1}: ${r.success ? '✅ Passed' : '❌ Failed'} (${r.duration_ms}ms)${r.success ? `\n  Output: \`${JSON.stringify(r.output)}\`` : `\n  Error: ${r.error}`}`
        ).join('\n');
        
        setAiChatMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `🧪 **Manual Test Results: ${passed}/${times} passed**\n\n${summary}`
        }]);
        
        setIsAiThinking(false);
        return;
      }
      
      // For all other requests, send to AI
      logActivity('🧠 Sending to AI model...');
      
      const testsText = currentTests.length > 0 
        ? currentTests.map((t, i) => 
            `Test ${i+1}: "${t.name}" | Input: ${JSON.stringify(t.input_params)} | Expected: ${JSON.stringify(t.expected_output)} | Match: ${t.match_type}`
          ).join('\n')
        : 'No tests defined';
      
      const lastTest = selectedTool.test_results[selectedTool.test_results.length - 1];
      const lastError = lastTest && !lastTest.success ? lastTest.error : '';
      const lastValidationErrors = validationResults && !validationResults.all_passed
        ? validationResults.results.filter(r => !r.success).map(r => `${r.test_name}: ${r.error || r.match_description}`).join('\n')
        : '';
      
      const improvePrompt = `You are an AI assistant helping with a tool for an AI system.

TOOL: ${selectedTool.display_name}
Description: ${selectedTool.description}
Parameters: ${JSON.stringify(currentParams, null, 2)}

CURRENT CODE:
\`\`\`python
${currentCode}
\`\`\`

VALIDATION TESTS:
${testsText}
${lastError ? `\nLAST MANUAL TEST ERROR:\n${lastError}` : ''}
${lastValidationErrors ? `\nFAILING VALIDATION TESTS:\n${lastValidationErrors}` : ''}

USER REQUEST: ${userMessage}

INSTRUCTIONS:
- If the user asks to MODIFY/FIX code or tests, respond with JSON:
{
    "action": "modify",
    "code": "async def execute(input):\\n    ...",
    "validation_tests": [{"id": "test-1", "name": "Test name", "input_params": "value", "expected_output": "expected", "match_type": "contains", "enabled": true}],
    "explanation": "What was changed and why"
}

- If user asks a QUESTION or wants DISCUSSION, respond with JSON:
{
    "action": "discuss",
    "explanation": "Your helpful response"
}

- If user asks to CREATE tests, include validation_tests in your response

CODE RULES (if modifying):
1. Code MUST be async function named 'execute'
2. NO import statements - pre-imported: json, re, math, random, urllib, httpx, asyncio
3. Return a dict with the result
4. Handle errors gracefully

Respond with ONLY valid JSON, no markdown.`;

      logActivity('⏳ Waiting for AI response...');
      
      // Add timeout to AI call (30 seconds)
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('AI request timed out after 30 seconds')), 30000)
      );
      
      const response = await Promise.race([
        customTools.aiChat(improvePrompt),
        timeoutPromise
      ]);
      logActivity('📥 Response received');
      
      setAiChatMessages(prev => prev.filter(m => m.id !== thinkingMsgId));
      
      // Handle response
      if (response.action === 'discuss' || (!response.code && !response.validation_tests)) {
        setAiChatMessages(prev => [...prev, { 
          role: 'assistant', 
          content: response.explanation || "I'm not sure how to help with that. Could you clarify?"
        }]);
      } else {
        const hasCodeChange = response.code && response.code !== currentCode;
        const hasTestsChange = response.validation_tests && JSON.stringify(response.validation_tests) !== JSON.stringify(currentTests);
        
        if (hasCodeChange || hasTestsChange) {
          logActivity('📝 Applying changes...');
          
          if (!isEditing) {
            setIsEditing(true);
            setEditForm({
              name: selectedTool.name,
              display_name: selectedTool.display_name,
              description: selectedTool.description,
              parameters: selectedTool.parameters,
              code: response.code || selectedTool.code,
              validation_tests: response.validation_tests || selectedTool.validation_tests || [],
            });
          } else {
            setEditForm(prev => ({
              ...prev,
              code: response.code || prev.code,
              validation_tests: response.validation_tests || prev.validation_tests,
            }));
          }
          
          const changes: string[] = [];
          if (hasCodeChange) changes.push('code');
          if (hasTestsChange) changes.push(`tests (${response.validation_tests?.length || 0})`);
          
          setAiChatMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `✅ **Applied changes to ${changes.join(' and ')}**\n\n${response.explanation || ''}\n\n_Changes are in edit mode. Click **Save** to persist, then say "run tests" to verify._`
          }]);
        } else {
          setAiChatMessages(prev => [...prev, { 
            role: 'assistant', 
            content: response.explanation || "No changes were needed."
          }]);
        }
      }
    } catch (err: any) {
      setAiChatMessages(prev => prev.filter(m => m.id !== thinkingMsgId));
      setAiChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `❌ Error: ${err.message}`
      }]);
    } finally {
      setIsAiThinking(false);
    }
  };

  // Wrapper for input-based sends
  const handleAIChatSend = () => handleAIChatSendWithMessage();

  const addParameter = () => {
    setEditForm(prev => ({
      ...prev,
      parameters: [...prev.parameters, {
        name: 'new_param',
        type: 'string',
        description: '',
        required: true,
      }],
    }));
  };

  const updateParameter = (index: number, field: keyof ToolParameter, value: any) => {
    setEditForm(prev => ({
      ...prev,
      parameters: prev.parameters.map((p, i) => 
        i === index ? { ...p, [field]: value } : p
      ),
    }));
  };

  const removeParameter = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      parameters: prev.parameters.filter((_, i) => i !== index),
    }));
  };

  const addValidationTest = () => {
    setEditForm(prev => ({
      ...prev,
      validation_tests: [...prev.validation_tests, {
        id: crypto.randomUUID(),
        name: `Test ${prev.validation_tests.length + 1}`,
        input_params: {},
        expected_output: {},
        match_type: 'contains',
        enabled: true,
      }],
    }));
  };

  const updateValidationTest = (index: number, field: keyof ValidationTestCase, value: any) => {
    setEditForm(prev => ({
      ...prev,
      validation_tests: prev.validation_tests.map((t, i) =>
        i === index ? { ...t, [field]: value } : t
      ),
    }));
  };

  const removeValidationTest = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      validation_tests: prev.validation_tests.filter((_, i) => i !== index),
    }));
  };

  if (user?.role !== 'admin') return null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/admin')}
              className="p-2 hover:bg-surface rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-text-muted" />
            </button>
            <Wrench className="w-6 h-6 text-accent" />
            <h1 className="text-xl font-bold text-text-primary">Tool Builder</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setAutoBuildPrompt('');
                setAutoBuildTests([
                  { id: crypto.randomUUID(), name: 'Test 1', input_params: {}, expected_output: {}, match_type: 'contains', enabled: true },
                  { id: crypto.randomUUID(), name: 'Test 2', input_params: {}, expected_output: {}, match_type: 'contains', enabled: true },
                  { id: crypto.randomUUID(), name: 'Test 3', input_params: {}, expected_output: {}, match_type: 'contains', enabled: true },
                ]);
                setAutoBuildState({
                  isRunning: false, status: 'idle', message: '', iteration: 0, maxIterations: 5,
                  testResults: [], passed: 0, failed: 0, total: 0, code: '', generatedTool: null, error: null, completed: false, log: [],
                });
                setShowAutoBuildModal(true);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 text-purple-400 rounded-lg transition-all border border-purple-500/30"
            >
              <Zap className="w-4 h-4" />
              Autonomous Build
            </button>
            <button
              onClick={() => {
                setGeneratePrompt('');
                setShowGenerateModal(true);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              AI Generate
            </button>
            <button
              onClick={handleCreateBlankTool}
              className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Tool
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Tool List Sidebar */}
        <div className="w-72 border-r border-border overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-surface animate-pulse rounded-lg" />
              ))}
            </div>
          ) : !tools || tools.length === 0 ? (
            <div className="p-4 text-center text-text-muted">
              <Wrench className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No custom tools yet</p>
              <p className="text-sm mt-1">Create one to get started</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {tools.map(tool => (
                <button
                  key={tool.id}
                  onClick={() => handleSelectTool(tool)}
                  className={`w-full p-3 rounded-lg text-left transition-colors ${
                    selectedTool?.id === tool.id 
                      ? 'bg-accent/20 border border-accent' 
                      : 'hover:bg-surface border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text-primary truncate">{tool.display_name}</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[tool.status]}`}>
                      {tool.status}
                    </span>
                  </div>
                  <p className="text-sm text-text-muted truncate mt-1">{tool.description}</p>
                  {tool.validation_tests && tool.validation_tests.length > 0 && (
                    <p className="text-xs text-text-muted mt-1 flex items-center gap-1">
                      <FlaskConical className="w-3 h-3" />
                      {tool.validation_tests.length} tests
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto">
          {!selectedTool ? (
            <div className="h-full flex items-center justify-center text-text-muted">
              <div className="text-center">
                <Code className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">Select a tool to edit</p>
                <p className="text-sm mt-2">Or create a new one to get started</p>
              </div>
            </div>
          ) : (
            <div className="p-6 max-w-4xl">
              {/* Tool Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex-1 mr-4">
                  {isEditing ? (
                    <>
                      <input
                        value={editForm.display_name}
                        onChange={(e) => setEditForm(prev => ({ ...prev, display_name: e.target.value }))}
                        className="text-2xl font-bold text-text-primary bg-transparent border-b-2 border-accent focus:outline-none w-full"
                        placeholder="Display Name"
                      />
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-3 py-1 text-sm rounded-full ${STATUS_COLORS[selectedTool.status]}`}>
                          {selectedTool.status}
                        </span>
                        <span className="text-text-muted">v{selectedTool.version}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold text-text-primary">{selectedTool.display_name}</h2>
                        <span className={`px-3 py-1 text-sm rounded-full ${STATUS_COLORS[selectedTool.status]}`}>
                          {selectedTool.status}
                        </span>
                      </div>
                      <p className="text-text-muted mt-1">v{selectedTool.version} • {selectedTool.name}</p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!isEditing ? (
                    <>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-surface hover:bg-surface-hover rounded-lg transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                        Edit
                      </button>
                      {selectedTool.status === 'released' ? (
                        <button
                          onClick={handleDisableTool}
                          className="flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                        >
                          <Ban className="w-4 h-4" />
                          Disable
                        </button>
                      ) : (
                        <button
                          onClick={handleReleaseTool}
                          className="flex items-center gap-2 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors"
                        >
                          <Rocket className="w-4 h-4" />
                          Release
                        </button>
                      )}
                      <button
                        onClick={handleDeleteTool}
                        className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setIsEditing(false)}
                        className="flex items-center gap-2 px-3 py-2 bg-surface hover:bg-surface-hover rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveTool}
                        className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
                      >
                        <Save className="w-4 h-4" />
                        Save
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-text-secondary mb-2">Description</label>
                {isEditing ? (
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full p-3 bg-surface border border-border rounded-lg text-text-primary resize-none"
                    rows={2}
                  />
                ) : (
                  <p className="text-text-primary">{selectedTool.description}</p>
                )}
              </div>

              {/* Parameters */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-text-secondary">Parameters</label>
                  {isEditing && (
                    <button onClick={addParameter} className="text-sm text-accent hover:text-accent-hover">
                      + Add Parameter
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {(isEditing ? editForm.parameters : selectedTool.parameters).map((param, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-surface rounded-lg">
                      {isEditing ? (
                        <>
                          <input
                            value={param.name}
                            onChange={(e) => updateParameter(idx, 'name', e.target.value)}
                            className="w-32 px-2 py-1 bg-bg-tertiary border border-border rounded text-sm"
                            placeholder="name"
                          />
                          <select
                            value={param.type}
                            onChange={(e) => updateParameter(idx, 'type', e.target.value)}
                            className="px-2 py-1 bg-bg-tertiary border border-border rounded text-sm"
                          >
                            <option value="string">string</option>
                            <option value="integer">integer</option>
                            <option value="number">number</option>
                            <option value="boolean">boolean</option>
                          </select>
                          <input
                            value={param.description}
                            onChange={(e) => updateParameter(idx, 'description', e.target.value)}
                            className="flex-1 px-2 py-1 bg-bg-tertiary border border-border rounded text-sm"
                            placeholder="description"
                          />
                          <label className="flex items-center gap-1 text-sm">
                            <input
                              type="checkbox"
                              checked={param.required}
                              onChange={(e) => updateParameter(idx, 'required', e.target.checked)}
                            />
                            Required
                          </label>
                          <button onClick={() => removeParameter(idx)} className="p-1 text-red-400 hover:bg-red-500/20 rounded">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <code className="px-2 py-1 bg-bg-tertiary rounded text-accent">{param.name}</code>
                          <span className="text-text-muted text-sm">{param.type}</span>
                          <span className="flex-1 text-text-secondary text-sm">{param.description}</span>
                          {param.required && <span className="text-xs text-red-400">required</span>}
                        </>
                      )}
                    </div>
                  ))}
                  {(isEditing ? editForm.parameters : selectedTool.parameters).length === 0 && (
                    <p className="text-text-muted text-sm p-3">No parameters defined</p>
                  )}
                </div>
              </div>

              {/* Code Editor */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-text-secondary mb-2">Code</label>
                <textarea
                  value={isEditing ? editForm.code : selectedTool.code}
                  onChange={(e) => setEditForm(prev => ({ ...prev, code: e.target.value }))}
                  disabled={!isEditing}
                  className="w-full p-4 bg-bg-tertiary border border-border rounded-lg font-mono text-sm text-text-primary resize-none"
                  rows={15}
                  spellCheck={false}
                />
              </div>

              {/* AI Assistant Section - Integrated */}
              <div className="mb-6 border border-purple-500/30 rounded-lg bg-purple-500/5">
                <button
                  onClick={() => setShowAIAssistant(!showAIAssistant)}
                  className="w-full p-3 flex items-center justify-between hover:bg-purple-500/10 transition-colors rounded-t-lg"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    <span className="font-medium text-purple-300">AI Assistant</span>
                    {aiChatMessages.length > 0 && (
                      <span className="text-xs bg-purple-500/30 px-2 py-0.5 rounded-full text-purple-300">
                        {aiChatMessages.length} messages
                      </span>
                    )}
                  </div>
                  {showAIAssistant ? <ChevronDown className="w-5 h-5 text-purple-400" /> : <ChevronRight className="w-5 h-5 text-purple-400" />}
                </button>
                
                {showAIAssistant && (
                  <div className="border-t border-purple-500/30">
                    {/* Quick Actions */}
                    <div className="p-2 border-b border-purple-500/20 flex flex-wrap gap-2">
                      <button
                        onClick={() => sendAIMessage('run validation tests')}
                        disabled={isAiThinking}
                        className="text-xs px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded transition-colors disabled:opacity-50"
                      >
                        🧪 Run Tests
                      </button>
                      <button
                        onClick={() => sendAIMessage('test the tool 3 times')}
                        disabled={isAiThinking}
                        className="text-xs px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded transition-colors disabled:opacity-50"
                      >
                        🔄 Test 3x
                      </button>
                      <button
                        onClick={() => sendAIMessage('fix the failing tests')}
                        disabled={isAiThinking}
                        className="text-xs px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded transition-colors disabled:opacity-50"
                      >
                        🔧 Fix Code
                      </button>
                      <button
                        onClick={() => sendAIMessage('create validation tests for edge cases')}
                        disabled={isAiThinking}
                        className="text-xs px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded transition-colors disabled:opacity-50"
                      >
                        ➕ Add Tests
                      </button>
                      {aiChatMessages.length > 0 && (
                        <button
                          onClick={() => setAiChatMessages([])}
                          className="text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors ml-auto"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    
                    {/* Chat Messages */}
                    <div 
                      ref={chatContainerRef}
                      className="max-h-72 overflow-y-auto p-3 space-y-2"
                    >
                      {aiChatMessages.length === 0 ? (
                        <div className="text-center text-purple-300/50 text-sm py-4">
                          <p className="mb-2">I can help you:</p>
                          <ul className="text-xs space-y-1">
                            <li>• Run and analyze test results</li>
                            <li>• Fix code to pass failing tests</li>
                            <li>• Create validation tests</li>
                            <li>• Explain and improve the code</li>
                          </ul>
                        </div>
                      ) : (
                        aiChatMessages.map((msg, idx) => (
                          <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] p-2 rounded-lg text-sm ${
                              msg.role === 'user' 
                                ? 'bg-purple-500 text-white' 
                                : 'bg-surface border border-border text-text-primary'
                            }`}>
                              {msg.id && isAiThinking ? (
                                <div className="font-mono text-xs text-purple-300">
                                  <pre className="whitespace-pre-wrap">{msg.content}</pre>
                                </div>
                              ) : (
                                <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    
                    {/* Input */}
                    <div className="p-3 border-t border-purple-500/20 flex gap-2">
                      <input
                        type="text"
                        value={aiChatInput}
                        onChange={(e) => setAiChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAIChatSend();
                          }
                        }}
                        placeholder="Ask me anything... (e.g., 'fix it', 'run tests', 'test 5 times')"
                        className="flex-1 px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary"
                        disabled={isAiThinking}
                      />
                      <button
                        onClick={handleAIChatSend}
                        disabled={isAiThinking || !aiChatInput.trim()}
                        className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {isAiThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Validation Tests Section */}
              <div className="mb-6 border border-border rounded-lg">
                <button
                  onClick={() => setShowValidationTests(!showValidationTests)}
                  className="w-full p-4 flex items-center justify-between hover:bg-surface/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-5 h-5 text-purple-400" />
                    <span className="font-medium text-text-primary">Validation Tests</span>
                    <span className="text-sm text-text-muted">
                      ({(isEditing ? editForm.validation_tests : selectedTool.validation_tests || []).length} tests)
                    </span>
                  </div>
                  {showValidationTests ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </button>
                
                {showValidationTests && (
                  <div className="p-4 border-t border-border space-y-4">
                    {isEditing && (
                      <button onClick={addValidationTest} className="text-sm text-accent hover:text-accent-hover">
                        + Add Validation Test
                      </button>
                    )}
                    
                    <div className="space-y-3">
                      {(isEditing ? editForm.validation_tests : selectedTool.validation_tests || []).map((test, idx) => (
                        <div key={test.id} className="p-3 bg-surface rounded-lg space-y-2">
                          {isEditing ? (
                            <>
                              <div className="flex items-center gap-2">
                                <input
                                  value={test.name}
                                  onChange={(e) => updateValidationTest(idx, 'name', e.target.value)}
                                  className="flex-1 px-2 py-1 bg-bg-tertiary border border-border rounded text-sm font-medium"
                                  placeholder="Test name"
                                />
                                <select
                                  value={test.match_type}
                                  onChange={(e) => updateValidationTest(idx, 'match_type', e.target.value)}
                                  className="px-2 py-1 bg-bg-tertiary border border-border rounded text-sm"
                                >
                                  <option value="exact">Exact Match</option>
                                  <option value="contains">Contains</option>
                                  <option value="type_only">Type Only</option>
                                  <option value="expression">Expression</option>
                                </select>
                                <label className="flex items-center gap-1 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={test.enabled}
                                    onChange={(e) => updateValidationTest(idx, 'enabled', e.target.checked)}
                                  />
                                  Enabled
                                </label>
                                <button onClick={() => removeValidationTest(idx)} className="p-1 text-red-400 hover:bg-red-500/20 rounded">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-text-muted">Input (JSON or string)</label>
                                  <textarea
                                    value={typeof test.input_params === 'string' ? test.input_params : JSON.stringify(test.input_params, null, 2)}
                                    onChange={(e) => {
                                      const val = e.target.value.trim();
                                      // Try to parse as JSON, otherwise keep as string
                                      try { 
                                        updateValidationTest(idx, 'input_params', JSON.parse(val)); 
                                      } catch {
                                        updateValidationTest(idx, 'input_params', val);
                                      }
                                    }}
                                    className="w-full p-2 bg-bg-tertiary border border-border rounded text-xs font-mono"
                                    rows={2}
                                    placeholder={test.match_type === 'expression' ? 'e.g., "1d6" or {"input": "1d6", "die_sides": 6}' : 'e.g., "hello" or {"key": "value"}'}
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-text-muted">
                                    {test.match_type === 'expression' ? 'Expression (e.g., result <= 6)' : 'Expected Output (JSON)'}
                                  </label>
                                  <textarea
                                    value={typeof test.expected_output === 'string' ? test.expected_output : JSON.stringify(test.expected_output, null, 2)}
                                    onChange={(e) => {
                                      const val = e.target.value.trim();
                                      // For expression type, keep as string; otherwise try JSON
                                      if (test.match_type === 'expression') {
                                        updateValidationTest(idx, 'expected_output', val);
                                      } else {
                                        try { 
                                          updateValidationTest(idx, 'expected_output', JSON.parse(val)); 
                                        } catch {
                                          updateValidationTest(idx, 'expected_output', val);
                                        }
                                      }
                                    }}
                                    className="w-full p-2 bg-bg-tertiary border border-border rounded text-xs font-mono"
                                    rows={2}
                                    placeholder={test.match_type === 'expression' ? 'e.g., result <= die_sides' : 'e.g., "expected" or {"key": "value"}'}
                                  />
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-text-primary">{test.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs px-2 py-0.5 bg-bg-tertiary rounded">{test.match_type}</span>
                                  {!test.enabled && <span className="text-xs text-red-400">disabled</span>}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-text-muted">Input:</span>
                                  <pre className="bg-bg-tertiary p-2 rounded mt-1 overflow-auto">
                                    {JSON.stringify(test.input_params, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <span className="text-text-muted">Expected:</span>
                                  <pre className="bg-bg-tertiary p-2 rounded mt-1 overflow-auto">
                                    {JSON.stringify(test.expected_output, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    {!isEditing && (selectedTool.validation_tests || []).length > 0 && (
                      <div className="pt-2">
                        <button
                          onClick={handleRunValidationTests}
                          disabled={isRunningValidation}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isRunningValidation ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                          Run All Validation Tests
                        </button>
                      </div>
                    )}
                    
                    {/* Show validation results regardless of edit mode */}
                    {validationResults && (
                      <div className="mt-4 space-y-2 p-3 bg-surface rounded-lg border border-border" id="validation-results">
                        <div className="flex items-center gap-4 text-sm font-medium">
                          <span className="text-green-400">✓ {validationResults.passed} passed</span>
                          <span className="text-red-400">✗ {validationResults.failed} failed</span>
                          <span className="text-text-muted">({validationResults.total} total)</span>
                        </div>
                        {validationResults.results.map((r) => (
                          <div key={r.test_case_id} className={`p-2 rounded text-sm ${r.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                            <div className="flex items-center gap-2">
                              {r.success ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                              <span className="font-medium">{r.test_name}</span>
                              <span className="text-text-muted">({r.duration_ms}ms)</span>
                            </div>
                            {!r.success && (
                              <div className="mt-1 ml-6 text-xs">
                                <p className="text-red-400">{r.error || r.match_description}</p>
                                {r.actual_output && (
                                  <p className="text-text-muted mt-1">Got: <code className="bg-bg-tertiary px-1 rounded">{JSON.stringify(r.actual_output)}</code></p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Manual Test Section */}
              <div className="border-t border-border pt-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                  <Play className="w-5 h-5" />
                  Test Tool
                </h3>
                
                {selectedTool.parameters.length > 0 ? (
                  <div className="mb-4 space-y-3">
                    {selectedTool.parameters.map((param) => {
                      // Generate example placeholder based on type and name
                      const getPlaceholder = () => {
                        if (param.description) return `e.g., ${param.description}`;
                        switch (param.type) {
                          case 'string': 
                            if (param.name.includes('name')) return 'e.g., John Doe';
                            if (param.name.includes('email')) return 'e.g., user@example.com';
                            if (param.name.includes('url')) return 'e.g., https://example.com';
                            if (param.name === 'input') return 'e.g., hello world';
                            return `Enter ${param.name}...`;
                          case 'integer': return 'e.g., 42';
                          case 'number': return 'e.g., 3.14';
                          default: return `Enter ${param.name}...`;
                        }
                      };
                      
                      return (
                        <div key={param.name} className="flex items-center gap-3">
                          <label className="w-32 text-sm text-text-secondary flex items-center gap-1">
                            {param.name}
                            {param.required && <span className="text-red-400">*</span>}
                          </label>
                          {param.type === 'boolean' ? (
                            <input
                              type="checkbox"
                              checked={testParams[param.name] || false}
                              onChange={(e) => setTestParams(prev => ({ ...prev, [param.name]: e.target.checked }))}
                            />
                          ) : param.type === 'integer' || param.type === 'number' ? (
                            <input
                              type="number"
                              value={testParams[param.name] || ''}
                              onChange={(e) => setTestParams(prev => ({ ...prev, [param.name]: param.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value) }))}
                              className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg"
                              placeholder={getPlaceholder()}
                            />
                          ) : (
                            <input
                              type="text"
                              value={testParams[param.name] || ''}
                              onChange={(e) => setTestParams(prev => ({ ...prev, [param.name]: e.target.value }))}
                              className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg"
                              placeholder={getPlaceholder()}
                            />
                          )}
                          <span className="text-xs text-text-muted w-16">{param.type}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-text-muted text-sm mb-4">This tool has no parameters. Click Run Test to execute.</p>
                )}

                <button
                  onClick={handleTestTool}
                  disabled={isTesting}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Run Test
                </button>

                {testResult && (
                  <div className={`mt-4 p-4 rounded-lg border ${testResult.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {testResult.success ? <CheckCircle className="w-5 h-5 text-green-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
                      <span className={testResult.success ? 'text-green-400' : 'text-red-400'}>
                        {testResult.success ? 'Test Passed' : 'Test Failed'}
                      </span>
                      <span className="text-text-muted text-sm">({testResult.duration_ms}ms)</span>
                    </div>
                    
                    {testResult.logs.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs text-text-muted mb-1">Logs:</p>
                        <pre className="text-sm bg-bg-tertiary p-2 rounded overflow-auto max-h-32">{testResult.logs.join('\n')}</pre>
                      </div>
                    )}
                    
                    {testResult.success ? (
                      <div>
                        <p className="text-xs text-text-muted mb-1">Output:</p>
                        <pre className="text-sm bg-bg-tertiary p-2 rounded overflow-auto max-h-48">{JSON.stringify(testResult.output, null, 2)}</pre>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-text-muted mb-1">Error:</p>
                        <pre className="text-sm text-red-400 bg-bg-tertiary p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap">{testResult.error}</pre>
                      </div>
                    )}
                  </div>
                )}

                {selectedTool.test_results.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-text-secondary mb-2">Recent Tests ({selectedTool.test_results.length} total)</h4>
                    <div className="space-y-2">
                      {selectedTool.test_results.slice(-5).reverse().map((test) => {
                        const testDate = new Date(test.timestamp);
                        const now = new Date();
                        const diffMs = now.getTime() - testDate.getTime();
                        const diffMins = Math.floor(diffMs / 60000);
                        const diffHours = Math.floor(diffMs / 3600000);
                        const diffDays = Math.floor(diffMs / 86400000);
                        
                        let timeAgo = '';
                        if (diffMins < 1) timeAgo = 'just now';
                        else if (diffMins < 60) timeAgo = `${diffMins}m ago`;
                        else if (diffHours < 24) timeAgo = `${diffHours}h ago`;
                        else timeAgo = `${diffDays}d ago`;
                        
                        return (
                          <div key={test.id} className={`p-2 rounded text-sm ${test.success ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                            <div className="flex items-center gap-3">
                              {test.success ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                              <span className={test.success ? 'text-green-400' : 'text-red-400'}>
                                {test.success ? 'Passed' : 'Failed'}
                              </span>
                              {(test.duration_ms || 0) > 0 && (
                                <span className="text-text-muted">{test.duration_ms}ms</span>
                              )}
                              <span className="text-text-muted text-xs" title={testDate.toLocaleString()}>{timeAgo}</span>
                            </div>
                            {/* Show input */}
                            {test.input_params && (
                              <p className="text-text-muted text-xs mt-1 ml-7">
                                <span className="text-text-secondary">Input:</span> <code className="bg-bg-tertiary px-1 rounded">{typeof test.input_params === 'string' ? test.input_params : JSON.stringify(test.input_params)}</code>
                              </p>
                            )}
                            {/* Show output or error */}
                            {test.error ? (
                              <p className="text-red-400 text-xs mt-1 ml-7 truncate" title={test.error}>
                                <span className="text-red-300">Error:</span> {test.error.split('\n')[0]}
                              </p>
                            ) : test.output !== undefined && (
                              <p className="text-text-muted text-xs mt-1 ml-7">
                                <span className="text-text-secondary">Output:</span> <code className="bg-bg-tertiary px-1 rounded">{typeof test.output === 'string' ? test.output : JSON.stringify(test.output)}</code>
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Generate Modal */}
      {showGenerateModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowGenerateModal(false)} />
          <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[600px] bg-bg-elevated border border-border rounded-xl z-50 flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold text-text-primary">AI Generate Tool</h3>
              </div>
              <button onClick={() => setShowGenerateModal(false)} className="p-1 hover:bg-surface rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              <p className="text-text-muted mb-4">Describe what you want the tool to do and AI will generate the code for you.</p>
              <textarea
                value={generatePrompt}
                onChange={(e) => setGeneratePrompt(e.target.value)}
                placeholder="Example: Create a tool that fetches the current weather for a given city"
                className="w-full p-3 bg-surface border border-border rounded-lg text-text-primary resize-none"
                rows={4}
              />
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowGenerateModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAIGenerate}
                disabled={isGenerating || !generatePrompt.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Generate
              </button>
            </div>
          </div>
        </>
      )}

      {/* Autonomous Build Modal */}
      {showAutoBuildModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => !autoBuildState.isRunning && setShowAutoBuildModal(false)} />
          <div className="fixed inset-2 md:inset-4 bg-bg-elevated border border-border rounded-xl z-50 flex flex-col">
            <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold text-text-primary">Autonomous Tool Builder</h3>
              </div>
              {!autoBuildState.isRunning && (
                <button onClick={() => setShowAutoBuildModal(false)} className="p-1 hover:bg-surface rounded">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            
            <div className="flex-1 overflow-hidden flex min-h-0">
              {/* Left Panel - Configuration */}
              <div className="w-1/2 border-r border-border flex flex-col min-h-0">
                {/* Tool Description - Fixed height */}
                <div className="p-3 border-b border-border shrink-0">
                  <label className="block text-sm font-medium text-text-secondary mb-1">Tool Description *</label>
                  <textarea
                    value={autoBuildPrompt}
                    onChange={(e) => setAutoBuildPrompt(e.target.value)}
                    disabled={autoBuildState.isRunning}
                    placeholder="Describe what the tool should do..."
                    className="w-full p-2 bg-surface border border-border rounded-lg text-text-primary text-sm resize-none disabled:opacity-50"
                    rows={2}
                  />
                  <div className="flex items-center gap-4 mt-2">
                    <label className="text-xs text-text-muted">Max Iterations: {autoBuildMaxIterations}</label>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={autoBuildMaxIterations}
                      onChange={(e) => setAutoBuildMaxIterations(parseInt(e.target.value))}
                      disabled={autoBuildState.isRunning}
                      className="flex-1"
                    />
                  </div>
                </div>
                
                {/* Test Cases Header */}
                <div className="px-3 py-2 border-b border-border flex items-center justify-between shrink-0">
                  <label className="text-sm font-medium text-text-secondary">Test Cases (min 3) *</label>
                  {!autoBuildState.isRunning && (
                    <button onClick={addAutoBuildTest} className="text-sm text-accent hover:text-accent-hover">+ Add Test</button>
                  )}
                </div>
                
                {/* Test Cases - Scrollable, takes remaining height */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                  {autoBuildTests.map((test, idx) => (
                    <div key={test.id} className="p-2 bg-surface rounded-lg border border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-mono text-purple-400 font-bold">#{idx + 1}</span>
                        <input
                          value={test.name}
                          onChange={(e) => updateAutoBuildTest(idx, 'name', e.target.value)}
                          disabled={autoBuildState.isRunning}
                          className="flex-1 px-2 py-1 bg-bg-tertiary border border-border rounded text-sm disabled:opacity-50"
                          placeholder="Test name/description"
                        />
                        <select
                          value={test.match_type}
                          onChange={(e) => updateAutoBuildTest(idx, 'match_type', e.target.value as any)}
                          disabled={autoBuildState.isRunning}
                          className="px-2 py-1 bg-bg-tertiary border border-border rounded text-xs disabled:opacity-50"
                        >
                          <option value="exact">Exact</option>
                          <option value="contains">Contains</option>
                        </select>
                        {autoBuildTests.length > 3 && !autoBuildState.isRunning && (
                          <button onClick={() => removeAutoBuildTest(idx)} className="p-1 text-red-400 hover:bg-red-500/20 rounded">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-text-muted w-16 shrink-0">Input:</label>
                          <input
                            type="text"
                            value={typeof test.input_params === 'string' ? test.input_params : (test.input_params?.input || '')}
                            onChange={(e) => updateAutoBuildTest(idx, 'input_params', e.target.value)}
                            disabled={autoBuildState.isRunning}
                            className="flex-1 px-2 py-1 bg-bg-tertiary border border-border rounded text-sm disabled:opacity-50"
                            placeholder="Enter test input value"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-text-muted w-16 shrink-0">Expected:</label>
                          <input
                            type="text"
                            value={typeof test.expected_output === 'string' ? test.expected_output : (test.expected_output?.output || test.expected_output?.result || '')}
                            onChange={(e) => updateAutoBuildTest(idx, 'expected_output', e.target.value)}
                            disabled={autoBuildState.isRunning}
                            className="flex-1 px-2 py-1 bg-bg-tertiary border border-border rounded text-sm disabled:opacity-50"
                            placeholder="Enter expected output value"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Right Panel - Build Log & Progress */}
              <div className="w-1/2 flex flex-col min-h-0">
                {/* Header with status */}
                {(autoBuildState.isRunning || autoBuildState.completed) && (
                  <div className={`px-3 py-2 border-b border-border flex items-center gap-3 shrink-0 ${
                    autoBuildState.status === 'error' ? 'bg-red-500/10' :
                    autoBuildState.status === 'completed' ? 'bg-green-500/10' : 'bg-blue-500/10'
                  }`}>
                    {autoBuildState.isRunning ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> :
                     autoBuildState.status === 'completed' ? <CheckCircle className="w-4 h-4 text-green-400" /> :
                     autoBuildState.status === 'error' ? <XCircle className="w-4 h-4 text-red-400" /> :
                     <CircleDot className="w-4 h-4 text-yellow-400" />}
                    <div className="flex-1">
                      <span className="text-sm font-medium text-text-primary">
                        {autoBuildState.isRunning ? `Iteration ${autoBuildState.iteration}/${autoBuildState.maxIterations}` : 
                         autoBuildState.status === 'completed' ? 'Build Complete' : 'Build Finished'}
                      </span>
                      {autoBuildState.total > 0 && (
                        <span className="text-xs text-text-muted ml-2">
                          ({autoBuildState.passed}/{autoBuildState.total} tests passing)
                        </span>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Build Log - scrollable */}
                <div className="flex-1 overflow-y-auto p-2 font-mono text-xs" ref={autoBuildLogRef}>
                  {!autoBuildState.isRunning && !autoBuildState.completed ? (
                    <div className="h-full flex items-center justify-center text-text-muted">
                      <div className="text-center">
                        <Zap className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p className="font-sans text-sm">Configure your tool and tests</p>
                        <p className="font-sans text-xs mt-1">then click "Start Build"</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {autoBuildState.log.map((entry, idx) => (
                        <div 
                          key={idx} 
                          className={`py-0.5 px-1 rounded ${
                            entry.type === 'error' ? 'bg-red-500/10 text-red-400' :
                            entry.type === 'test_complete' && entry.success === false ? 'text-red-400' :
                            entry.type === 'test_complete' && entry.success === true ? 'text-green-400' :
                            entry.type === 'info' && entry.success === true ? 'bg-green-500/10 text-green-400' :
                            entry.type === 'status' ? 'text-blue-400 font-semibold mt-2' :
                            entry.type === 'code_update' ? 'text-purple-400' :
                            'text-text-secondary'
                          }`}
                        >
                          {entry.message}
                        </div>
                      ))}
                      {autoBuildState.isRunning && (
                        <div className="py-0.5 px-1 text-text-muted flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Working...</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Generated Code Preview - collapsible */}
                {autoBuildState.code && (
                  <div className="border-t border-border shrink-0">
                    <details className="group">
                      <summary className="px-3 py-2 cursor-pointer hover:bg-surface/50 flex items-center gap-2 text-sm font-medium text-text-secondary">
                        <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
                        View Generated Code
                      </summary>
                      <div className="max-h-[30vh] overflow-auto">
                        <pre className="p-2 bg-bg-tertiary text-xs font-mono text-text-primary">
                          {autoBuildState.code}
                        </pre>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-3 border-t border-border flex justify-between shrink-0">
              <button
                onClick={() => setShowAutoBuildModal(false)}
                disabled={autoBuildState.isRunning}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <div className="flex gap-2">
                {autoBuildState.completed && autoBuildState.code && (
                  <button
                    onClick={handleSaveAutoBuildResult}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Save as Draft
                  </button>
                )}
                {!autoBuildState.completed && (
                  <button
                    onClick={handleStartAutonomousBuild}
                    disabled={autoBuildState.isRunning || !autoBuildPrompt.trim() || autoBuildTests.filter(t => t.enabled).length < 3}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-lg transition-all disabled:opacity-50"
                  >
                    {autoBuildState.isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {autoBuildState.isRunning ? 'Building...' : 'Start Build'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
