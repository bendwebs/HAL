'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  type: 'status' | 'test_running' | 'test_complete' | 'code_update' | 'error' | 'info' | 'iteration' | 'test_result' | 'complete';
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

const INITIAL_AUTO_BUILD_STATE: AutoBuildState = {
  isRunning: false, status: 'idle', message: '', iteration: 0, maxIterations: 5,
  testResults: [], passed: 0, failed: 0, total: 0, code: '', generatedTool: null,
  error: null, completed: false, log: [],
};

function makeDefaultTests(): ValidationTestCase[] {
  return [
    { id: crypto.randomUUID(), name: 'Test 1', input_params: {}, expected_output: {}, match_type: 'contains', enabled: true },
    { id: crypto.randomUUID(), name: 'Test 2', input_params: {}, expected_output: {}, match_type: 'contains', enabled: true },
    { id: crypto.randomUUID(), name: 'Test 3', input_params: {}, expected_output: {}, match_type: 'contains', enabled: true },
  ];
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
  // Mobile sidebar toggle
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  
  // Autonomous Build — inline mode (replaces modal)
  const [autoBuildMode, setAutoBuildMode] = useState(false);
  const [autoBuildPrompt, setAutoBuildPrompt] = useState('');
  const [autoBuildTests, setAutoBuildTests] = useState<ValidationTestCase[]>(makeDefaultTests());
  const [autoBuildMaxIterations, setAutoBuildMaxIterations] = useState(5);
  const [autoBuildState, setAutoBuildState] = useState<AutoBuildState>(INITIAL_AUTO_BUILD_STATE);
  const [autoBuildTestsCollapsed, setAutoBuildTestsCollapsed] = useState(false);
  const autoBuildLogRef = useRef<HTMLDivElement>(null);
  
  // AI Assistant state
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string, id?: number}>>([]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  // Validation tests tab state
  const [showValidationTests, setShowValidationTests] = useState(false);
  const [isRunningValidation, setIsRunningValidation] = useState(false);
  const [validationResults, setValidationResults] = useState<{
    total: number; passed: number; failed: number;
    results: ValidationTestResult[]; all_passed: boolean;
  } | null>(null);
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '', display_name: '', description: '',
    parameters: [] as ToolParameter[], code: '',
    validation_tests: [] as ValidationTestCase[],
  });

  // Auto-scroll effects
  useEffect(() => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [aiChatMessages, isAiThinking]);
  useEffect(() => {
    if (autoBuildLogRef.current) autoBuildLogRef.current.scrollTop = autoBuildLogRef.current.scrollHeight;
  }, [autoBuildState]);

  useEffect(() => {
    if (user?.role !== 'admin') { router.push('/chat'); return; }
    loadTools();
  }, [user, router]);

  const loadTools = async () => {
    try { setIsLoading(true); const data = await customTools.list(); setTools(data?.tools || []); }
    catch { toast.error('Failed to load tools'); setTools([]); }
    finally { setIsLoading(false); }
  };

  const handleSelectTool = (tool: CustomTool) => {
    setSelectedTool(tool);
    setAutoBuildMode(false);
    setEditForm({ name: tool.name, display_name: tool.display_name, description: tool.description, parameters: tool.parameters, code: tool.code, validation_tests: tool.validation_tests || [] });
    setIsEditing(false); setTestResult(null); setValidationResults(null); setShowValidationTests(false);
    const params: Record<string, any> = {};
    tool.parameters.forEach(p => {
      if (p.default !== undefined) params[p.name] = p.default;
      else if (p.type === 'boolean') params[p.name] = false;
      else if (p.type === 'integer' || p.type === 'number') params[p.name] = 0;
      else params[p.name] = '';
    });
    setTestParams(params);
    setShowMobileSidebar(false);
  };

  const handleCreateBlankTool = async () => {
    try {
      const newTool = await customTools.create({
        name: `new_tool_${Date.now()}`, display_name: 'New Tool', description: 'Describe what this tool does',
        parameters: [], validation_tests: [],
        code: `async def execute(**kwargs):\n    """Your tool code here."""\n    return {"result": "success"}`,
      });
      toast.success('New tool created'); loadTools(); handleSelectTool(newTool); setIsEditing(true);
    } catch (err: any) { toast.error(err.message || 'Failed to create tool'); }
  };

  const handleSaveTool = async () => {
    if (!selectedTool) return;
    try {
      const updated = await customTools.update(selectedTool.id, { display_name: editForm.display_name, description: editForm.description, parameters: editForm.parameters, code: editForm.code, validation_tests: editForm.validation_tests });
      toast.success('Tool saved'); setSelectedTool(updated); setIsEditing(false); loadTools();
    } catch (err: any) { toast.error(err.message || 'Failed to save tool'); }
  };

  const handleTestTool = async () => {
    if (!selectedTool) return;
    setIsTesting(true); setTestResult(null);
    try {
      const result = await customTools.test(selectedTool.id, testParams);
      setTestResult(result);
      result.success ? toast.success(`Test passed in ${result.duration_ms}ms`) : toast.error('Test failed');
      setSelectedTool(await customTools.get(selectedTool.id));
    } catch (err: any) { toast.error(err.message || 'Test failed'); }
    finally { setIsTesting(false); }
  };

  const handleRunValidationTests = async () => {
    if (!selectedTool) return;
    setIsRunningValidation(true); setValidationResults(null);
    try {
      const result = await customTools.runValidationTests(selectedTool.id);
      setValidationResults(result);
      result.all_passed ? toast.success(`All ${result.total} validation tests passed!`) : toast.error(`${result.failed}/${result.total} tests failed`);
    } catch (err: any) { toast.error(err.message || 'Failed to run validation tests'); }
    finally { setIsRunningValidation(false); }
  };

  const handleReleaseTool = async () => { if (!selectedTool) return; try { const u = await customTools.release(selectedTool.id); toast.success('Tool released!'); setSelectedTool(u); loadTools(); } catch (err: any) { toast.error(err.message || 'Failed to release'); } };
  const handleDisableTool = async () => { if (!selectedTool) return; try { const u = await customTools.disable(selectedTool.id); toast.success('Tool disabled'); setSelectedTool(u); loadTools(); } catch (err: any) { toast.error(err.message || 'Failed to disable'); } };
  const handleDeleteTool = async () => { if (!selectedTool) return; if (!confirm(`Delete "${selectedTool.display_name}"?`)) return; try { await customTools.delete(selectedTool.id); toast.success('Tool deleted'); setSelectedTool(null); loadTools(); } catch (err: any) { toast.error(err.message || 'Failed to delete'); } };

  const handleAIGenerate = async () => {
    if (!generatePrompt.trim()) return; setIsGenerating(true);
    try {
      const gen = await customTools.aiGenerate(generatePrompt);
      const newTool = await customTools.create({ name: gen.name, display_name: gen.display_name, description: gen.description, parameters: gen.parameters, code: gen.code });
      toast.success('Tool generated!'); setShowGenerateModal(false); loadTools(); handleSelectTool(newTool); setIsEditing(true);
    } catch (err: any) { toast.error(err.message || 'Failed to generate'); }
    finally { setIsGenerating(false); }
  };

  // Autonomous Build helpers
  const addAutoBuildTest = () => { setAutoBuildTests(prev => [...prev, { id: crypto.randomUUID(), name: `Test ${prev.length + 1}`, input_params: {}, expected_output: {}, match_type: 'contains', enabled: true }]); };
  const updateAutoBuildTest = (i: number, field: keyof ValidationTestCase, value: any) => { setAutoBuildTests(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t)); };
  const removeAutoBuildTest = (i: number) => { if (autoBuildTests.length <= 3) { toast.error('Minimum 3 tests'); return; } setAutoBuildTests(prev => prev.filter((_, idx) => idx !== i)); };

  const enterAutoBuildMode = () => {
    setSelectedTool(null);
    setAutoBuildPrompt('');
    setAutoBuildTests(makeDefaultTests());
    setAutoBuildState(INITIAL_AUTO_BUILD_STATE);
    setAutoBuildTestsCollapsed(false);
    setAutoBuildMode(true);
    setShowMobileSidebar(false);
  };

  const handleStartAutonomousBuild = async () => {
    if (!autoBuildPrompt.trim()) { toast.error('Please provide a tool description'); return; }
    const validTests = autoBuildTests.filter(t => t.enabled);
    if (validTests.length < 3) { toast.error('At least 3 enabled test cases required'); return; }
    
    setAutoBuildState({ ...INITIAL_AUTO_BUILD_STATE, isRunning: true, status: 'starting', message: 'Starting autonomous build...', maxIterations: autoBuildMaxIterations, log: [{ timestamp: new Date(), type: 'info', message: '🚀 Starting autonomous build process...' }] });
    
    try {
      for await (const event of customTools.autonomousBuild(autoBuildPrompt, autoBuildTests, autoBuildMaxIterations)) {
        const { event_type, data } = event;
        switch (event_type) {
          case 'status':
            setAutoBuildState(prev => ({ ...prev, status: data.status, message: data.message, iteration: data.iteration || prev.iteration,
              log: [...prev.log, { timestamp: new Date(), type: 'status', message: data.phase === 'fixing' ? `🔧 Iteration ${data.iteration}: ${data.message}` : `📋 Iteration ${data.iteration || prev.iteration}: ${data.message}`, details: data.failed_tests }] }));
            break;
          case 'test_running':
            setAutoBuildState(prev => ({ ...prev, log: [...prev.log, { timestamp: new Date(), type: 'test_running', message: `  ▶ Running test ${data.test_index}/${data.total_tests}: "${data.test_name}"`, details: { input: data.input } }] }));
            break;
          case 'test_complete':
            setAutoBuildState(prev => ({ ...prev, log: [...prev.log, { timestamp: new Date(), type: 'test_complete', message: data.result.success ? `  ✅ PASS: "${data.result.test_name}" (${data.result.duration_ms}ms)` : `  ❌ FAIL: "${data.result.test_name}" - ${data.result.error || data.result.match_description}`, details: data.result, success: data.result.success }] }));
            break;
          case 'code_update':
            setAutoBuildState(prev => ({ ...prev, code: data.code, iteration: data.iteration || prev.iteration, generatedTool: data.name ? { name: data.name, display_name: data.display_name, description: data.description, parameters: data.parameters } : prev.generatedTool,
              log: [...prev.log, { timestamp: new Date(), type: 'code_update', message: data.action === 'fix' ? '💻 Code updated with fix' : '💻 Initial code generated' }] }));
            break;
          case 'test_result':
            setAutoBuildState(prev => ({ ...prev, testResults: data.results, passed: data.passed, failed: data.failed, total: data.total, iteration: data.iteration,
              log: [...prev.log, { timestamp: new Date(), type: 'info', message: data.all_passed ? `🎉 All ${data.total} tests passed!` : `📊 Results: ${data.passed}/${data.total} passed`, success: data.all_passed }] }));
            break;
          case 'complete':
            setAutoBuildState(prev => ({ ...prev, isRunning: false, status: data.status, message: data.message, code: data.code || prev.code, passed: data.passed, failed: data.failed ?? prev.failed, total: data.total, completed: true,
              generatedTool: data.name ? { name: data.name, display_name: data.display_name, description: data.description, parameters: data.parameters } : prev.generatedTool,
              log: [...prev.log, { timestamp: new Date(), type: data.status === 'completed' ? 'info' : 'status', message: data.status === 'completed' ? `✨ BUILD COMPLETE after ${data.iterations} iteration(s)!` : `⚠️ BUILD FINISHED: ${data.passed}/${data.total} passing after ${data.iterations} iterations`, success: data.status === 'completed' }] }));
            data.status === 'completed' ? toast.success('Build completed!') : toast.success(`Build finished: ${data.passed}/${data.total} passing`);
            break;
          case 'error':
            setAutoBuildState(prev => ({ ...prev, isRunning: false, status: 'error', error: data.error, completed: true,
              log: [...prev.log, { timestamp: new Date(), type: 'error', message: `🚨 ERROR: ${data.error}` }] }));
            toast.error(`Build error: ${data.error}`);
            break;
        }
      }
    } catch (err: any) {
      setAutoBuildState(prev => ({ ...prev, isRunning: false, status: 'error', error: err.message, completed: true, log: [...prev.log, { timestamp: new Date(), type: 'error', message: `🚨 ERROR: ${err.message}` }] }));
      toast.error(err.message || 'Build failed');
    }
  };

  const handleSaveAutoBuildResult = async () => {
    if (!autoBuildState.generatedTool || !autoBuildState.code) { toast.error('No generated tool to save'); return; }
    try {
      const newTool = await customTools.create({ name: autoBuildState.generatedTool.name, display_name: autoBuildState.generatedTool.display_name, description: autoBuildState.generatedTool.description, parameters: autoBuildState.generatedTool.parameters, code: autoBuildState.code, validation_tests: autoBuildTests });
      toast.success('Tool saved as draft!'); setAutoBuildMode(false); loadTools(); handleSelectTool(newTool);
    } catch (err: any) { toast.error(err.message || 'Failed to save'); }
  };

  // AI Chat handlers
  const sendAIMessage = (message: string) => { if (!selectedTool || isAiThinking) return; handleAIChatSendWithMessage(message); };

  const handleAIChatSendWithMessage = async (directMessage?: string) => {
    const userMessage = directMessage || aiChatInput.trim();
    if (!userMessage || !selectedTool || isAiThinking) return;
    setAiChatMessages(prev => [...prev, { role: 'user', content: userMessage }]); setAiChatInput(''); setIsAiThinking(true);
    const activityLog: string[] = [];
    const logActivity = (action: string) => { activityLog.push(`[${new Date().toLocaleTimeString()}] ${action}`); setAiChatMessages(prev => { const n = [...prev]; const last = n[n.length - 1]; if (last?.role === 'assistant' && last.id) last.content = activityLog.join('\n'); return n; }); };
    const thinkingMsgId = Date.now();
    setAiChatMessages(prev => [...prev, { role: 'assistant', content: '⏳ Starting...', id: thinkingMsgId }]);
    try {
      const currentCode = isEditing ? editForm.code : selectedTool.code;
      const currentTests = isEditing ? editForm.validation_tests : (selectedTool.validation_tests || []);
      const currentParams = isEditing ? editForm.parameters : selectedTool.parameters;
      const lower = userMessage.toLowerCase();
      logActivity('📝 Parsing request...');
      const isValidationReq = lower.includes('validation') || (lower.includes('run') && lower.includes('test') && !lower.match(/\d+\s*time/));
      const isManualReq = lower.includes('test the tool') || lower.includes('try the tool') || !!lower.match(/test.*\d+\s*time/);
      
      if (isValidationReq && !isManualReq) {
        logActivity('🧪 Running validation tests...');
        const saved = selectedTool.validation_tests || [];
        if (saved.length === 0) { setAiChatMessages(prev => [...prev.filter(m => m.id !== thinkingMsgId), { role: 'assistant', content: '📋 No validation tests defined.' }]); setIsAiThinking(false); return; }
        if (isEditing) { setAiChatMessages(prev => [...prev.filter(m => m.id !== thinkingMsgId), { role: 'assistant', content: '⚠️ Save your changes first, then run tests.' }]); setIsAiThinking(false); return; }
        try {
          setIsRunningValidation(true); setShowValidationTests(true);
          logActivity(`🔄 Executing ${saved.filter(t => t.enabled).length} tests...`);
          const result = await customTools.runValidationTests(selectedTool.id); setValidationResults(result);
          logActivity(`✅ Tests complete: ${result.passed}/${result.total} passed`);
          setAiChatMessages(prev => prev.filter(m => m.id !== thinkingMsgId));
          if (result.all_passed) { setAiChatMessages(prev => [...prev, { role: 'assistant', content: `✅ All ${result.total} tests passed! Ready to release.` }]); }
          else { const fails = result.results.filter(r => !r.success).map(f => `• ${f.test_name}: ${f.error || f.match_description}`).join('\n'); setAiChatMessages(prev => [...prev, { role: 'assistant', content: `❌ ${result.failed}/${result.total} failed:\n${fails}\n\n💡 Say "fix it" to update the code.` }]); }
        } catch (err: any) { setAiChatMessages(prev => [...prev.filter(m => m.id !== thinkingMsgId), { role: 'assistant', content: `❌ Error: ${err.message}` }]); }
        finally { setIsRunningValidation(false); }
        setIsAiThinking(false); return;
      }
      
      if (isManualReq) {
        const times = parseInt(lower.match(/(\d+)\s*time/)?.[1] || '1');
        logActivity(`🎯 Running manual test${times > 1 ? `s (${times}x)` : ''}...`);
        const results: any[] = [];
        for (let i = 0; i < times; i++) {
          logActivity(`🔄 Run ${i + 1}/${times}...`);
          try { const r = await customTools.test(selectedTool.id, testParams); results.push(r); logActivity(`${r.success ? '✅' : '❌'} Run ${i + 1}: ${r.success ? 'Passed' : 'Failed'} (${r.duration_ms}ms)`); setSelectedTool(await customTools.get(selectedTool.id)); }
          catch (err: any) { results.push({ success: false, output: null, error: err.message, duration_ms: 0 }); logActivity(`❌ Run ${i + 1}: ${err.message}`); }
          if (i < times - 1) await new Promise(r => setTimeout(r, 200));
        }
        setAiChatMessages(prev => prev.filter(m => m.id !== thinkingMsgId));
        const passed = results.filter(r => r.success).length;
        const summary = results.map((r, i) => `• Run ${i + 1}: ${r.success ? '✅' : '❌'} (${r.duration_ms}ms)${r.success ? ` → ${JSON.stringify(r.output)}` : ` → ${r.error}`}`).join('\n');
        setAiChatMessages(prev => [...prev, { role: 'assistant', content: `🧪 ${passed}/${times} passed\n\n${summary}` }]);
        setIsAiThinking(false); return;
      }

      // General AI request
      logActivity('🧠 Sending to AI...');
      const testsText = currentTests.length > 0 ? currentTests.map((t, i) => `Test ${i+1}: "${t.name}" | Input: ${JSON.stringify(t.input_params)} | Expected: ${JSON.stringify(t.expected_output)} | Match: ${t.match_type}`).join('\n') : 'No tests';
      const lastTest = selectedTool.test_results[selectedTool.test_results.length - 1];
      const lastError = lastTest && !lastTest.success ? lastTest.error : '';
      const lastValErrors = validationResults && !validationResults.all_passed ? validationResults.results.filter(r => !r.success).map(r => `${r.test_name}: ${r.error || r.match_description}`).join('\n') : '';
      
      const prompt = `You are an AI assistant helping with a tool.\n\nTOOL: ${selectedTool.display_name}\nDescription: ${selectedTool.description}\nParameters: ${JSON.stringify(currentParams, null, 2)}\n\nCODE:\n\`\`\`python\n${currentCode}\n\`\`\`\n\nTESTS:\n${testsText}${lastError ? `\n\nLAST ERROR:\n${lastError}` : ''}${lastValErrors ? `\n\nFAILING TESTS:\n${lastValErrors}` : ''}\n\nUSER: ${userMessage}\n\nINSTRUCTIONS:\n- To MODIFY: {"action":"modify","code":"...","validation_tests":[...],"explanation":"..."}\n- To DISCUSS: {"action":"discuss","explanation":"..."}\nCode must be async execute. Do NOT use import statements — these modules are pre-loaded in scope: json, re, math, random, urllib, httpx, asyncio, datetime, hashlib, base64, html. For dates use datetime.datetime.now(). Return dict. JSON only.`;

      logActivity('⏳ Waiting...');
      const response = await Promise.race([customTools.aiChat(prompt), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Timed out')), 30000))]);
      logActivity('📥 Response received');
      setAiChatMessages(prev => prev.filter(m => m.id !== thinkingMsgId));

      if (response.action === 'discuss' || (!response.code && !response.validation_tests)) {
        setAiChatMessages(prev => [...prev, { role: 'assistant', content: response.explanation || "Not sure how to help. Could you clarify?" }]);
      } else {
        const hasCode = response.code && response.code !== currentCode;
        const hasTests = response.validation_tests && JSON.stringify(response.validation_tests) !== JSON.stringify(currentTests);
        if (hasCode || hasTests) {
          logActivity('📝 Applying changes...');
          if (!isEditing) { setIsEditing(true); setEditForm({ name: selectedTool.name, display_name: selectedTool.display_name, description: selectedTool.description, parameters: selectedTool.parameters, code: response.code || selectedTool.code, validation_tests: response.validation_tests || selectedTool.validation_tests || [] }); }
          else { setEditForm(prev => ({ ...prev, code: response.code || prev.code, validation_tests: response.validation_tests || prev.validation_tests })); }
          const changes: string[] = []; if (hasCode) changes.push('code'); if (hasTests) changes.push(`tests (${response.validation_tests?.length || 0})`);
          setAiChatMessages(prev => [...prev, { role: 'assistant', content: `✅ Updated ${changes.join(' and ')}\n\n${response.explanation || ''}\n\nSave then "run tests" to verify.` }]);
        } else { setAiChatMessages(prev => [...prev, { role: 'assistant', content: response.explanation || 'No changes needed.' }]); }
      }
    } catch (err: any) { setAiChatMessages(prev => [...prev.filter(m => m.id !== thinkingMsgId), { role: 'assistant', content: `❌ Error: ${err.message}` }]); }
    finally { setIsAiThinking(false); }
  };
  const handleAIChatSend = () => handleAIChatSendWithMessage();

  // Parameter / validation test helpers
  const addParameter = () => { setEditForm(prev => ({ ...prev, parameters: [...prev.parameters, { name: 'new_param', type: 'string', description: '', required: true }] })); };
  const updateParameter = (i: number, field: keyof ToolParameter, value: any) => { setEditForm(prev => ({ ...prev, parameters: prev.parameters.map((p, idx) => idx === i ? { ...p, [field]: value } : p) })); };
  const removeParameter = (i: number) => { setEditForm(prev => ({ ...prev, parameters: prev.parameters.filter((_, idx) => idx !== i) })); };
  const addValidationTest = () => { setEditForm(prev => ({ ...prev, validation_tests: [...prev.validation_tests, { id: crypto.randomUUID(), name: `Test ${prev.validation_tests.length + 1}`, input_params: {}, expected_output: {}, match_type: 'contains', enabled: true }] })); };
  const updateValidationTest = (i: number, field: keyof ValidationTestCase, value: any) => { setEditForm(prev => ({ ...prev, validation_tests: prev.validation_tests.map((t, idx) => idx === i ? { ...t, [field]: value } : t) })); };
  const removeValidationTest = (i: number) => { setEditForm(prev => ({ ...prev, validation_tests: prev.validation_tests.filter((_, idx) => idx !== i) })); };

  if (user?.role !== 'admin') return null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button onClick={() => router.push('/admin')} className="p-2 hover:bg-surface rounded-lg transition-colors flex-shrink-0">
              <ArrowLeft className="w-5 h-5 text-text-muted" />
            </button>
            <Wrench className="w-5 h-5 sm:w-6 sm:h-6 text-accent flex-shrink-0" />
            <h1 className="text-lg sm:text-xl font-bold text-text-primary truncate">Tool Builder</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Mobile: show sidebar toggle */}
            <button onClick={() => setShowMobileSidebar(!showMobileSidebar)} className="md:hidden p-2 hover:bg-surface rounded-lg transition-colors">
              <Code className="w-4 h-4" />
            </button>
            <button onClick={enterAutoBuildMode}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-2 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 text-purple-400 rounded-lg transition-all border border-purple-500/30 text-sm">
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">Autonomous Build</span>
              <span className="sm:hidden">Auto</span>
            </button>
            <button onClick={() => { setGeneratePrompt(''); setShowGenerateModal(true); }}
              className="hidden sm:flex items-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors text-sm">
              <Sparkles className="w-4 h-4" />AI Generate
            </button>
            <button onClick={handleCreateBlankTool}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors text-sm">
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">New Tool</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile sidebar overlay */}
        {showMobileSidebar && <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setShowMobileSidebar(false)} />}

        {/* Tool List Sidebar */}
        <div className={`
          md:w-64 lg:w-72 md:relative md:translate-x-0 md:z-auto
          fixed left-0 top-0 h-full w-72 z-40 bg-bg-primary
          transition-transform duration-200
          ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          border-r border-border overflow-y-auto
        `}>
          {isLoading ? (
            <div className="p-4 space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-surface animate-pulse rounded-lg" />)}</div>
          ) : !tools || tools.length === 0 ? (
            <div className="p-4 text-center text-text-muted">
              <Wrench className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>No custom tools yet</p><p className="text-sm mt-1">Create one to get started</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {tools.map(tool => (
                <button key={tool.id} onClick={() => handleSelectTool(tool)}
                  className={`w-full p-3 rounded-lg text-left transition-colors ${selectedTool?.id === tool.id && !autoBuildMode ? 'bg-accent/20 border border-accent' : 'hover:bg-surface border border-transparent'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text-primary truncate">{tool.display_name}</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${STATUS_COLORS[tool.status]}`}>{tool.status}</span>
                  </div>
                  <p className="text-sm text-text-muted truncate mt-1">{tool.description}</p>
                  {tool.validation_tests && tool.validation_tests.length > 0 && (
                    <p className="text-xs text-text-muted mt-1 flex items-center gap-1"><FlaskConical className="w-3 h-3" />{tool.validation_tests.length} tests</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto">
          {autoBuildMode ? (
            /* ====== AUTONOMOUS BUILD - INLINE ====== */
            <div className="h-full flex flex-col">
              {/* Tool Description - top area */}
              <div className="p-3 sm:p-4 border-b border-border flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-purple-400" />
                    <h2 className="font-semibold text-text-primary">Autonomous Tool Builder</h2>
                  </div>
                  {!autoBuildState.isRunning && (
                    <button onClick={() => setAutoBuildMode(false)} className="p-1.5 hover:bg-surface rounded text-text-muted"><X className="w-4 h-4" /></button>
                  )}
                </div>
                <textarea value={autoBuildPrompt} onChange={e => setAutoBuildPrompt(e.target.value)} disabled={autoBuildState.isRunning}
                  placeholder="Describe what the tool should do in detail. Example: A tool that converts temperatures between Fahrenheit and Celsius. Input is a string like '100F' or '37C'. Returns the converted value with the unit." className="w-full p-2.5 bg-surface border border-border rounded-lg text-text-primary text-sm resize-none disabled:opacity-50" rows={3} />
                {!autoBuildState.isRunning && !autoBuildState.completed && (
                  <p className="text-xs text-text-muted mt-1.5">💡 Tip: Be specific about input format, output format, and edge cases. The builder infers parameters from your test cases.</p>
                )}
              </div>

              {/* Test Cases - collapsible */}
              <div className="border-b border-border flex-shrink-0">
                <button onClick={() => setAutoBuildTestsCollapsed(!autoBuildTestsCollapsed)} className="w-full px-3 sm:px-4 py-2 flex items-center justify-between hover:bg-surface/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-medium">Test Cases ({autoBuildTests.length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!autoBuildState.isRunning && !autoBuildTestsCollapsed && (
                      <span onClick={e => { e.stopPropagation(); addAutoBuildTest(); }} className="text-xs text-accent hover:text-accent-hover cursor-pointer">+ Add</span>
                    )}
                    {autoBuildTestsCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>
                {!autoBuildTestsCollapsed && (
                  <div className="px-3 sm:px-4 pb-3 space-y-2 max-h-[40vh] overflow-y-auto">
                    {autoBuildTests.map((test, idx) => (
                      <div key={test.id} className="p-2 bg-surface rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-mono text-purple-400 font-bold">#{idx + 1}</span>
                          <input value={test.name} onChange={e => updateAutoBuildTest(idx, 'name', e.target.value)} disabled={autoBuildState.isRunning}
                            className="flex-1 min-w-0 px-2 py-1 bg-bg-tertiary border border-border rounded text-sm disabled:opacity-50" placeholder="Test name" />
                          <select value={test.match_type} onChange={e => updateAutoBuildTest(idx, 'match_type', e.target.value as any)} disabled={autoBuildState.isRunning}
                            className="px-2 py-1 bg-bg-tertiary border border-border rounded text-xs disabled:opacity-50 flex-shrink-0">
                            <option value="exact">Exact</option><option value="contains">Contains</option><option value="expression">Expression</option>
                          </select>
                          {autoBuildTests.length > 3 && !autoBuildState.isRunning && (
                            <button onClick={() => removeAutoBuildTest(idx)} className="p-1 text-red-400 hover:bg-red-500/20 rounded flex-shrink-0"><X className="w-3 h-3" /></button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <label className="text-xs text-text-muted w-14 flex-shrink-0">Input:</label>
                            <input type="text" value={typeof test.input_params === 'string' ? test.input_params : (typeof test.input_params === 'object' && test.input_params !== null ? (test.input_params.input !== undefined ? test.input_params.input : JSON.stringify(test.input_params)) : '')} onChange={e => {
                              const val = e.target.value;
                              // Try to parse as JSON object for named params
                              if (val.startsWith('{')) {
                                try { updateAutoBuildTest(idx, 'input_params', JSON.parse(val)); return; } catch {}
                              }
                              updateAutoBuildTest(idx, 'input_params', val);
                            }} disabled={autoBuildState.isRunning}
                              className="flex-1 min-w-0 px-2 py-1 bg-bg-tertiary border border-border rounded text-sm disabled:opacity-50" placeholder='Test input (string or {"key": "val"})' />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <label className="text-xs text-text-muted w-14 flex-shrink-0">{test.match_type === 'expression' ? 'Expr:' : 'Expected:'}</label>
                            <input type="text" value={typeof test.expected_output === 'string' ? test.expected_output : (typeof test.expected_output === 'object' && test.expected_output !== null ? JSON.stringify(test.expected_output) : '')} onChange={e => {
                              const val = e.target.value;
                              // For expression type, keep as string
                              if (test.match_type === 'expression') {
                                updateAutoBuildTest(idx, 'expected_output', val);
                                return;
                              }
                              // Try JSON parse for dict expected values
                              if (val.startsWith('{') || val.startsWith('[')) {
                                try { updateAutoBuildTest(idx, 'expected_output', JSON.parse(val)); return; } catch {}
                              }
                              updateAutoBuildTest(idx, 'expected_output', val);
                            }} disabled={autoBuildState.isRunning}
                              className="flex-1 min-w-0 px-2 py-1 bg-bg-tertiary border border-border rounded text-sm disabled:opacity-50" placeholder={test.match_type === 'expression' ? 'e.g. int(result) > 0' : 'Expected output'} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Build log / start area - fills remaining space */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Status bar */}
                {(autoBuildState.isRunning || autoBuildState.completed) && (
                  <div className={`px-3 py-2 border-b border-border flex items-center gap-3 flex-shrink-0 ${autoBuildState.status === 'error' ? 'bg-red-500/10' : autoBuildState.status === 'completed' ? 'bg-green-500/10' : 'bg-blue-500/10'}`}>
                    {autoBuildState.isRunning ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : autoBuildState.status === 'completed' ? <CheckCircle className="w-4 h-4 text-green-400" /> : autoBuildState.status === 'error' ? <XCircle className="w-4 h-4 text-red-400" /> : <CircleDot className="w-4 h-4 text-yellow-400" />}
                    <span className="text-sm font-medium">{autoBuildState.isRunning ? `Iteration ${autoBuildState.iteration}/${autoBuildState.maxIterations}` : autoBuildState.status === 'completed' ? 'Build Complete' : 'Build Finished'}</span>
                    {autoBuildState.total > 0 && <span className="text-xs text-text-muted">({autoBuildState.passed}/{autoBuildState.total} passing)</span>}
                  </div>
                )}

                {/* Log area */}
                <div className="flex-1 overflow-y-auto p-3 font-mono text-xs" ref={autoBuildLogRef}>
                  {!autoBuildState.isRunning && !autoBuildState.completed ? (
                    <div className="h-full flex flex-col items-center justify-center text-text-muted gap-4">
                      <Zap className="w-12 h-12 opacity-20" />
                      <div className="text-center font-sans">
                        <p className="text-sm">Configure your tool and tests above</p>
                        <p className="text-xs mt-1 text-text-muted">then click "Start Build"</p>
                      </div>
                      <div className="flex items-center gap-3 font-sans">
                        <label className="text-xs text-text-muted">Max Iterations: {autoBuildMaxIterations}</label>
                        <input type="range" min="1" max="10" value={autoBuildMaxIterations} onChange={e => setAutoBuildMaxIterations(parseInt(e.target.value))} className="w-32" />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {autoBuildState.log.map((entry, idx) => (
                        <div key={idx} className={`py-0.5 px-1 rounded ${entry.type === 'error' ? 'bg-red-500/10 text-red-400' : entry.type === 'test_complete' && entry.success === false ? 'text-red-400' : entry.type === 'test_complete' && entry.success === true ? 'text-green-400' : entry.type === 'info' && entry.success === true ? 'bg-green-500/10 text-green-400' : entry.type === 'status' ? 'text-blue-400 font-semibold mt-2' : entry.type === 'code_update' ? 'text-purple-400' : 'text-text-secondary'}`}>
                          {entry.message}
                        </div>
                      ))}
                      {autoBuildState.isRunning && <div className="py-0.5 px-1 text-text-muted flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /><span>Working...</span></div>}
                    </div>
                  )}
                </div>

                {/* Generated code preview */}
                {autoBuildState.code && (
                  <div className="border-t border-border flex-shrink-0">
                    <details className="group">
                      <summary className="px-3 py-2 cursor-pointer hover:bg-surface/50 flex items-center gap-2 text-sm font-medium text-text-secondary">
                        <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />View Generated Code
                      </summary>
                      <div className="max-h-[30vh] overflow-auto"><pre className="p-2 bg-bg-tertiary text-xs font-mono text-text-primary">{autoBuildState.code}</pre></div>
                    </details>
                  </div>
                )}
              </div>

              {/* Bottom action bar */}
              <div className="p-3 border-t border-border flex justify-between flex-shrink-0">
                <button onClick={() => setAutoBuildMode(false)} disabled={autoBuildState.isRunning} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 text-sm">Cancel</button>
                <div className="flex gap-2">
                  {autoBuildState.completed && autoBuildState.code && (
                    <>
                      <button onClick={() => {
                        setAutoBuildState({ ...INITIAL_AUTO_BUILD_STATE });
                      }} className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface-hover text-text-secondary rounded-lg transition-colors text-sm">
                        <Zap className="w-4 h-4" />Retry
                      </button>
                      <button onClick={handleSaveAutoBuildResult} className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm"><Save className="w-4 h-4" />Save as Draft</button>
                    </>
                  )}
                  {!autoBuildState.completed && (
                    <button onClick={handleStartAutonomousBuild} disabled={autoBuildState.isRunning || !autoBuildPrompt.trim() || autoBuildTests.filter(t => t.enabled).length < 3}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-lg transition-all disabled:opacity-50 text-sm">
                      {autoBuildState.isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      {autoBuildState.isRunning ? 'Building...' : 'Start Build'}
                    </button>
                  )}
                </div>
              </div>
            </div>

          ) : !selectedTool ? (
            /* ====== EMPTY STATE ====== */
            <div className="h-full flex items-center justify-center text-text-muted p-4">
              <div className="text-center">
                <Code className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">Select a tool to edit</p>
                <p className="text-sm mt-2">Or create a new one to get started</p>
              </div>
            </div>
          ) : (
            /* ====== TOOL EDITOR ====== */
            <div className="p-4 sm:p-6 max-w-4xl">
              {/* Tool Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <>
                      <input value={editForm.display_name} onChange={e => setEditForm(prev => ({ ...prev, display_name: e.target.value }))}
                        className="text-xl sm:text-2xl font-bold text-text-primary bg-transparent border-b-2 border-accent focus:outline-none w-full" placeholder="Display Name" />
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-3 py-1 text-sm rounded-full ${STATUS_COLORS[selectedTool.status]}`}>{selectedTool.status}</span>
                        <span className="text-text-muted">v{selectedTool.version}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-xl sm:text-2xl font-bold text-text-primary">{selectedTool.display_name}</h2>
                        <span className={`px-3 py-1 text-sm rounded-full ${STATUS_COLORS[selectedTool.status]}`}>{selectedTool.status}</span>
                      </div>
                      <p className="text-text-muted mt-1 text-sm">v{selectedTool.version} • {selectedTool.name}</p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!isEditing ? (
                    <>
                      <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-3 py-2 bg-surface hover:bg-surface-hover rounded-lg transition-colors text-sm"><Edit3 className="w-4 h-4" />Edit</button>
                      {selectedTool.status === 'released' ? (
                        <button onClick={handleDisableTool} className="flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors text-sm"><Ban className="w-4 h-4" />Disable</button>
                      ) : (
                        <button onClick={handleReleaseTool} className="flex items-center gap-2 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors text-sm"><Rocket className="w-4 h-4" />Release</button>
                      )}
                      <button onClick={handleDeleteTool} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setIsEditing(false)} className="flex items-center gap-2 px-3 py-2 bg-surface hover:bg-surface-hover rounded-lg transition-colors text-sm"><X className="w-4 h-4" />Cancel</button>
                      <button onClick={handleSaveTool} className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors text-sm"><Save className="w-4 h-4" />Save</button>
                    </>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-text-secondary mb-2">Description</label>
                {isEditing ? (
                  <textarea value={editForm.description} onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))} className="w-full p-3 bg-surface border border-border rounded-lg text-text-primary resize-none" rows={2} />
                ) : ( <p className="text-text-primary">{selectedTool.description}</p> )}
              </div>

              {/* Parameters */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-text-secondary">Parameters</label>
                  {isEditing && <button onClick={addParameter} className="text-sm text-accent hover:text-accent-hover">+ Add Parameter</button>}
                </div>
                <div className="space-y-2">
                  {(isEditing ? editForm.parameters : selectedTool.parameters).map((param, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 bg-surface rounded-lg">
                      {isEditing ? (
                        <>
                          <input value={param.name} onChange={e => updateParameter(idx, 'name', e.target.value)} className="w-full sm:w-32 px-2 py-1 bg-bg-tertiary border border-border rounded text-sm" placeholder="name" />
                          <select value={param.type} onChange={e => updateParameter(idx, 'type', e.target.value)} className="px-2 py-1 bg-bg-tertiary border border-border rounded text-sm">
                            <option value="string">string</option><option value="integer">integer</option><option value="number">number</option><option value="boolean">boolean</option>
                          </select>
                          <input value={param.description} onChange={e => updateParameter(idx, 'description', e.target.value)} className="flex-1 min-w-0 px-2 py-1 bg-bg-tertiary border border-border rounded text-sm" placeholder="description" />
                          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={param.required} onChange={e => updateParameter(idx, 'required', e.target.checked)} />Req</label>
                          <button onClick={() => removeParameter(idx)} className="p-1 text-red-400 hover:bg-red-500/20 rounded"><X className="w-4 h-4" /></button>
                        </>
                      ) : (
                        <>
                          <code className="px-2 py-1 bg-bg-tertiary rounded text-accent">{param.name}</code>
                          <span className="text-text-muted text-sm">{param.type}</span>
                          <span className="flex-1 text-text-secondary text-sm min-w-0 truncate">{param.description}</span>
                          {param.required && <span className="text-xs text-red-400">required</span>}
                        </>
                      )}
                    </div>
                  ))}
                  {(isEditing ? editForm.parameters : selectedTool.parameters).length === 0 && <p className="text-text-muted text-sm p-3">No parameters</p>}
                </div>
              </div>

              {/* Code Editor */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-text-secondary mb-2">Code</label>
                <textarea value={isEditing ? editForm.code : selectedTool.code} onChange={e => setEditForm(prev => ({ ...prev, code: e.target.value }))} disabled={!isEditing}
                  className="w-full p-4 bg-bg-tertiary border border-border rounded-lg font-mono text-sm text-text-primary resize-none" rows={12} spellCheck={false} />
              </div>

              {/* AI Assistant */}
              <div className="mb-6 border border-purple-500/30 rounded-lg bg-purple-500/5">
                <button onClick={() => setShowAIAssistant(!showAIAssistant)} className="w-full p-3 flex items-center justify-between hover:bg-purple-500/10 transition-colors rounded-t-lg">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" /><span className="font-medium text-purple-300">AI Assistant</span>
                    {aiChatMessages.length > 0 && <span className="text-xs bg-purple-500/30 px-2 py-0.5 rounded-full text-purple-300">{aiChatMessages.length}</span>}
                  </div>
                  {showAIAssistant ? <ChevronDown className="w-5 h-5 text-purple-400" /> : <ChevronRight className="w-5 h-5 text-purple-400" />}
                </button>
                {showAIAssistant && (
                  <div className="border-t border-purple-500/30">
                    <div className="p-2 border-b border-purple-500/20 flex flex-wrap gap-1.5 sm:gap-2">
                      {[['🧪 Run Tests','run validation tests'],['🔄 Test 3x','test the tool 3 times'],['🔧 Fix Code','fix the failing tests'],['➕ Add Tests','create validation tests for edge cases']].map(([label, msg]) => (
                        <button key={label} onClick={() => sendAIMessage(msg)} disabled={isAiThinking} className="text-xs px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded transition-colors disabled:opacity-50">{label}</button>
                      ))}
                      {aiChatMessages.length > 0 && <button onClick={() => setAiChatMessages([])} className="text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors ml-auto">Clear</button>}
                    </div>
                    <div ref={chatContainerRef} className="max-h-72 overflow-y-auto p-3 space-y-2">
                      {aiChatMessages.length === 0 ? (
                        <div className="text-center text-purple-300/50 text-sm py-4">
                          <p className="mb-2">I can help you:</p>
                          <ul className="text-xs space-y-1"><li>• Run & analyze tests</li><li>• Fix code</li><li>• Create tests</li><li>• Explain & improve</li></ul>
                        </div>
                      ) : aiChatMessages.map((msg, idx) => (
                        <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] p-2 rounded-lg text-sm ${msg.role === 'user' ? 'bg-purple-500 text-white' : 'bg-surface border border-border text-text-primary'}`}>
                            {msg.id && isAiThinking ? <pre className="whitespace-pre-wrap font-mono text-xs text-purple-300">{msg.content}</pre> : <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-3 border-t border-purple-500/20 flex gap-2">
                      <input type="text" value={aiChatInput} onChange={e => setAiChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAIChatSend(); } }}
                        placeholder="Ask anything..." className="flex-1 px-3 py-2 bg-surface border border-border rounded text-sm text-text-primary" disabled={isAiThinking} />
                      <button onClick={handleAIChatSend} disabled={isAiThinking || !aiChatInput.trim()} className="px-3 sm:px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-2">
                        {isAiThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Validation Tests */}
              <div className="mb-6 border border-border rounded-lg">
                <button onClick={() => setShowValidationTests(!showValidationTests)} className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-surface/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-5 h-5 text-purple-400" /><span className="font-medium text-text-primary">Validation Tests</span>
                    <span className="text-sm text-text-muted">({(isEditing ? editForm.validation_tests : selectedTool.validation_tests || []).length})</span>
                  </div>
                  {showValidationTests ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </button>
                {showValidationTests && (
                  <div className="p-3 sm:p-4 border-t border-border space-y-4">
                    {isEditing && <button onClick={addValidationTest} className="text-sm text-accent hover:text-accent-hover">+ Add Test</button>}
                    <div className="space-y-3">
                      {(isEditing ? editForm.validation_tests : selectedTool.validation_tests || []).map((test, idx) => (
                        <div key={test.id} className="p-3 bg-surface rounded-lg space-y-2">
                          {isEditing ? (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <input value={test.name} onChange={e => updateValidationTest(idx, 'name', e.target.value)} className="flex-1 min-w-0 px-2 py-1 bg-bg-tertiary border border-border rounded text-sm font-medium" placeholder="Test name" />
                                <select value={test.match_type} onChange={e => updateValidationTest(idx, 'match_type', e.target.value)} className="px-2 py-1 bg-bg-tertiary border border-border rounded text-sm">
                                  <option value="exact">Exact</option><option value="contains">Contains</option><option value="type_only">Type Only</option><option value="expression">Expression</option>
                                </select>
                                <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={test.enabled} onChange={e => updateValidationTest(idx, 'enabled', e.target.checked)} />On</label>
                                <button onClick={() => removeValidationTest(idx)} className="p-1 text-red-400 hover:bg-red-500/20 rounded"><X className="w-4 h-4" /></button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div><label className="text-xs text-text-muted">Input</label><textarea value={typeof test.input_params === 'string' ? test.input_params : JSON.stringify(test.input_params, null, 2)} onChange={e => { try { updateValidationTest(idx, 'input_params', JSON.parse(e.target.value.trim())); } catch { updateValidationTest(idx, 'input_params', e.target.value.trim()); } }} className="w-full p-2 bg-bg-tertiary border border-border rounded text-xs font-mono" rows={2} /></div>
                                <div><label className="text-xs text-text-muted">{test.match_type === 'expression' ? 'Expression' : 'Expected'}</label><textarea value={typeof test.expected_output === 'string' ? test.expected_output : JSON.stringify(test.expected_output, null, 2)} onChange={e => { if (test.match_type === 'expression') { updateValidationTest(idx, 'expected_output', e.target.value.trim()); } else { try { updateValidationTest(idx, 'expected_output', JSON.parse(e.target.value.trim())); } catch { updateValidationTest(idx, 'expected_output', e.target.value.trim()); } } }} className="w-full p-2 bg-bg-tertiary border border-border rounded text-xs font-mono" rows={2} /></div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center justify-between"><span className="font-medium text-text-primary">{test.name}</span><div className="flex items-center gap-2"><span className="text-xs px-2 py-0.5 bg-bg-tertiary rounded">{test.match_type}</span>{!test.enabled && <span className="text-xs text-red-400">disabled</span>}</div></div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div><span className="text-text-muted">Input:</span><pre className="bg-bg-tertiary p-2 rounded mt-1 overflow-auto">{JSON.stringify(test.input_params, null, 2)}</pre></div>
                                <div><span className="text-text-muted">Expected:</span><pre className="bg-bg-tertiary p-2 rounded mt-1 overflow-auto">{JSON.stringify(test.expected_output, null, 2)}</pre></div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    {!isEditing && (selectedTool.validation_tests || []).length > 0 && (
                      <button onClick={handleRunValidationTests} disabled={isRunningValidation} className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50 text-sm">
                        {isRunningValidation ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}Run All
                      </button>
                    )}
                    {validationResults && (
                      <div className="mt-4 space-y-2 p-3 bg-surface rounded-lg border border-border" id="validation-results">
                        <div className="flex items-center gap-4 text-sm font-medium"><span className="text-green-400">✓ {validationResults.passed}</span><span className="text-red-400">✗ {validationResults.failed}</span><span className="text-text-muted">({validationResults.total})</span></div>
                        {validationResults.results.map(r => (
                          <div key={r.test_case_id} className={`p-2 rounded text-sm ${r.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                            <div className="flex items-center gap-2">{r.success ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}<span className="font-medium">{r.test_name}</span>{(r.duration_ms||0) > 0 && <span className="text-text-muted">({r.duration_ms}ms)</span>}</div>
                            {r.input_params !== undefined && <p className="text-text-muted text-xs mt-1 ml-6"><span className="text-text-secondary">Input:</span> <code className="bg-bg-tertiary px-1 rounded">{typeof r.input_params === 'string' ? r.input_params : JSON.stringify(r.input_params)}</code></p>}
                            {r.actual_output !== undefined && <p className="text-text-muted text-xs mt-1 ml-6"><span className="text-text-secondary">Output:</span> <code className="bg-bg-tertiary px-1 rounded">{typeof r.actual_output === 'string' ? r.actual_output : JSON.stringify(r.actual_output)}</code></p>}
                            {!r.success && r.error && <p className="text-red-400 text-xs mt-1 ml-6">{r.error}</p>}
                            {!r.success && r.match_description && !r.error && <p className="text-red-400 text-xs mt-1 ml-6">{r.match_description}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Manual Test */}
              <div className="border-t border-border pt-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2"><Play className="w-5 h-5" />Test Tool</h3>
                {selectedTool.parameters.length > 0 ? (
                  <div className="mb-4 space-y-3">
                    {selectedTool.parameters.map(param => (
                      <div key={param.name} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                        <label className="sm:w-32 text-sm text-text-secondary flex items-center gap-1">{param.name}{param.required && <span className="text-red-400">*</span>}</label>
                        {param.type === 'boolean' ? (
                          <input type="checkbox" checked={testParams[param.name] || false} onChange={e => setTestParams(prev => ({ ...prev, [param.name]: e.target.checked }))} />
                        ) : param.type === 'integer' || param.type === 'number' ? (
                          <input type="number" value={testParams[param.name] || ''} onChange={e => setTestParams(prev => ({ ...prev, [param.name]: param.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value) }))} className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg" />
                        ) : (
                          <input type="text" value={testParams[param.name] || ''} onChange={e => setTestParams(prev => ({ ...prev, [param.name]: e.target.value }))} className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg" placeholder={`Enter ${param.name}...`} />
                        )}
                      </div>
                    ))}
                  </div>
                ) : <p className="text-text-muted text-sm mb-4">No parameters. Click Run Test to execute.</p>}

                {(() => { const missing = selectedTool.parameters.filter(p => p.required).some(p => { const v = testParams[p.name]; return v === undefined || v === '' || v === null; }); return (
                  <button onClick={handleTestTool} disabled={isTesting || missing} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                    {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}Run Test
                  </button>
                ); })()}

                {testResult && (
                  <div className={`mt-4 p-4 rounded-lg border ${testResult.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                    <div className="flex items-center gap-2 mb-2">{testResult.success ? <CheckCircle className="w-5 h-5 text-green-400" /> : <XCircle className="w-5 h-5 text-red-400" />}<span className={testResult.success ? 'text-green-400' : 'text-red-400'}>{testResult.success ? 'Passed' : 'Failed'}</span><span className="text-text-muted text-sm">({testResult.duration_ms}ms)</span></div>
                    {testResult.logs?.length > 0 && <div className="mb-2"><p className="text-xs text-text-muted mb-1">Logs:</p><pre className="text-sm bg-bg-tertiary p-2 rounded overflow-auto max-h-32">{testResult.logs.join('\n')}</pre></div>}
                    {testResult.success ? <div><p className="text-xs text-text-muted mb-1">Output:</p><pre className="text-sm bg-bg-tertiary p-2 rounded overflow-auto max-h-48">{JSON.stringify(testResult.output, null, 2)}</pre></div>
                      : <div><p className="text-xs text-text-muted mb-1">Error:</p><pre className="text-sm text-red-400 bg-bg-tertiary p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap">{testResult.error}</pre></div>}
                  </div>
                )}

                {selectedTool.test_results.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-text-secondary mb-2">Recent ({selectedTool.test_results.length})</h4>
                    <div className="space-y-2">
                      {selectedTool.test_results.slice(-5).reverse().map(test => {
                        const ms = Date.now() - new Date(test.timestamp).getTime();
                        const ago = ms < 60000 ? 'just now' : ms < 3600000 ? `${Math.floor(ms/60000)}m ago` : ms < 86400000 ? `${Math.floor(ms/3600000)}h ago` : `${Math.floor(ms/86400000)}d ago`;
                        return (
                          <div key={test.id} className={`p-2 rounded text-sm ${test.success ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                            <div className="flex items-center gap-3">{test.success ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}<span className={test.success ? 'text-green-400' : 'text-red-400'}>{test.success ? 'Passed' : 'Failed'}</span>{(test.duration_ms||0) > 0 && <span className="text-text-muted">{test.duration_ms}ms</span>}<span className="text-text-muted text-xs">{ago}</span></div>
                            {test.input_params && <p className="text-text-muted text-xs mt-1 ml-7">Input: <code className="bg-bg-tertiary px-1 rounded">{typeof test.input_params === 'string' ? test.input_params : JSON.stringify(test.input_params)}</code></p>}
                            {test.error ? <p className="text-red-400 text-xs mt-1 ml-7 truncate">{test.error.split('\n')[0]}</p> : test.output !== undefined && <p className="text-text-muted text-xs mt-1 ml-7">Output: <code className="bg-bg-tertiary px-1 rounded">{typeof test.output === 'string' ? test.output : JSON.stringify(test.output)}</code></p>}
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

      {/* AI Generate Modal - kept as modal since it's quick */}
      {showGenerateModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowGenerateModal(false)} />
          <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[600px] bg-bg-elevated border border-border rounded-xl z-50 flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-400" /><h3 className="font-semibold text-text-primary">AI Generate Tool</h3></div>
              <button onClick={() => setShowGenerateModal(false)} className="p-1 hover:bg-surface rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              <p className="text-text-muted mb-4 text-sm">Describe what you want the tool to do.</p>
              <textarea value={generatePrompt} onChange={e => setGeneratePrompt(e.target.value)} placeholder="Example: A tool that fetches current weather for a given city" className="w-full p-3 bg-surface border border-border rounded-lg text-text-primary resize-none" rows={4} />
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowGenerateModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
              <button onClick={handleAIGenerate} disabled={isGenerating || !generatePrompt.trim()} className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50">
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Generate
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
