'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { customTools, CustomTool, ToolParameter } from '@/lib/api';
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
  Clock,
  ChevronDown,
  ChevronRight,
  Loader2,
  Ban,
  Edit3,
  Save,
  X
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
  
  // AI Improve chat state
  const [showAIChat, setShowAIChat] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll chat when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [aiChatMessages, isAiThinking]);
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    display_name: '',
    description: '',
    parameters: [] as ToolParameter[],
    code: '',
  });

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
    });
    setIsEditing(false);
    setTestResult(null);
    // Initialize test params with defaults
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
      // Generate a unique name
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
      // Reload to get updated test_results
      const updated = await customTools.get(selectedTool.id);
      setSelectedTool(updated);
    } catch (err: any) {
      toast.error(err.message || 'Test failed');
    } finally {
      setIsTesting(false);
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
      
      // Auto-save as draft
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
      setIsEditing(true); // Open in edit mode so user can refine
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate tool');
    } finally {
      setIsGenerating(false);
    }
  };

  const openAIChat = () => {
    if (!selectedTool) return;
    
    // Build initial context message
    const lastTest = selectedTool.test_results[selectedTool.test_results.length - 1];
    const errorContext = lastTest && !lastTest.success 
      ? `\n\n**Last test failed with error:**\n\`\`\`\n${lastTest.error}\n\`\`\`` 
      : '';
    
    const initialMessage = `I'm here to help improve the **${selectedTool.display_name}** tool.

**Current Description:** ${selectedTool.description}

**Parameters:** ${selectedTool.parameters.length > 0 
  ? selectedTool.parameters.map(p => `\n- \`${p.name}\` (${p.type}): ${p.description}`).join('') 
  : 'None'}
${errorContext}

What would you like me to help with? You can:
- Describe the issue you're seeing
- Ask me to fix the error above
- Request new features or parameters
- Ask for code improvements`;

    setAiChatMessages([{ role: 'assistant', content: initialMessage }]);
    setAiChatInput('');
    setShowAIChat(true);
  };

  const handleAIChatSend = async () => {
    if (!aiChatInput.trim() || !selectedTool || isAiThinking) return;
    
    const userMessage = aiChatInput.trim();
    setAiChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setAiChatInput('');
    setIsAiThinking(true);
    
    try {
      const lastTest = selectedTool.test_results[selectedTool.test_results.length - 1];
      const errorContext = lastTest && !lastTest.success 
        ? `\n\nLast test error:\n${lastTest.error}` 
        : '';
      
      // Build conversation history for context
      const conversationHistory = aiChatMessages
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');
      
      const improvePrompt = `You are helping improve a tool for an AI assistant system.

CURRENT TOOL:
Name: ${selectedTool.name}
Display Name: ${selectedTool.display_name}
Description: ${selectedTool.description}
Parameters: ${JSON.stringify(selectedTool.parameters, null, 2)}

Current code:
\`\`\`python
${selectedTool.code}
\`\`\`
${errorContext}

CONVERSATION SO FAR:
${conversationHistory}

User: ${userMessage}

Based on the conversation, either:
1. If the user is asking questions or discussing the issue, respond helpfully and ask clarifying questions if needed.
2. If the user wants you to make changes, respond with the improved tool in JSON format.

If providing an improved tool, respond with ONLY this JSON (no other text):
{
    "name": "${selectedTool.name}",
    "display_name": "...",
    "description": "...",
    "parameters": [...],
    "code": "...",
    "explanation": "Brief explanation of changes made"
}

If just discussing/answering questions, respond naturally without JSON.`;

      const response = await customTools.aiGenerate(improvePrompt);
      
      // Check if response contains actual tool updates or is just conversation
      if (response.code && response.code !== selectedTool.code) {
        // AI provided updated code - ask for confirmation
        setAiChatMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `I've prepared the following changes:\n\n**${response.explanation || 'Updated the tool'}**\n\nWould you like me to apply these changes? Reply "yes" to apply, or tell me what else to modify.`
        }]);
        
        // Store pending changes
        (window as any).__pendingToolChanges = response;
      } else {
        // Just a conversational response - extract explanation as the response
        setAiChatMessages(prev => [...prev, { 
          role: 'assistant', 
          content: response.explanation || "I understand. Could you provide more details about what you'd like me to change?"
        }]);
      }
    } catch (err: any) {
      setAiChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Sorry, I encountered an error: ${err.message}. Please try again.`
      }]);
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleApplyAIChanges = async () => {
    const pending = (window as any).__pendingToolChanges;
    if (!pending || !selectedTool) return;
    
    try {
      const updated = await customTools.update(selectedTool.id, {
        display_name: pending.display_name,
        description: pending.description,
        parameters: pending.parameters,
        code: pending.code,
      });
      
      toast.success('Changes applied!');
      setSelectedTool(updated);
      setEditForm({
        name: updated.name,
        display_name: updated.display_name,
        description: updated.description,
        parameters: updated.parameters,
        code: updated.code,
      });
      loadTools();
      setShowAIChat(false);
      (window as any).__pendingToolChanges = null;
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply changes');
    }
  };

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
              {tools.map(tool => {
                const StatusIcon = STATUS_ICONS[tool.status];
                return (
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
                  </button>
                );
              })}
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
                        onClick={openAIChat}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                        AI Fix
                      </button>
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
                        onClick={openAIChat}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                        AI Improve
                      </button>
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
                    <button
                      onClick={addParameter}
                      className="text-sm text-accent hover:text-accent-hover"
                    >
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
                          <button
                            onClick={() => removeParameter(idx)}
                            className="p-1 text-red-400 hover:bg-red-500/20 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <code className="px-2 py-1 bg-bg-tertiary rounded text-accent">{param.name}</code>
                          <span className="text-text-muted text-sm">{param.type}</span>
                          <span className="flex-1 text-text-secondary text-sm">{param.description}</span>
                          {param.required && (
                            <span className="text-xs text-red-400">required</span>
                          )}
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

              {/* Test Section */}
              <div className="border-t border-border pt-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                  <Play className="w-5 h-5" />
                  Test Tool
                </h3>
                
                {/* Test Parameters */}
                {selectedTool.parameters.length > 0 && (
                  <div className="mb-4 space-y-3">
                    {selectedTool.parameters.map((param) => (
                      <div key={param.name} className="flex items-center gap-3">
                        <label className="w-32 text-sm text-text-secondary">{param.name}</label>
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
                          />
                        ) : (
                          <input
                            type="text"
                            value={testParams[param.name] || ''}
                            onChange={(e) => setTestParams(prev => ({ ...prev, [param.name]: e.target.value }))}
                            className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg"
                            placeholder={param.description}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleTestTool}
                  disabled={isTesting}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isTesting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Run Test
                </button>

                {/* Test Result */}
                {testResult && (
                  <div className={`mt-4 p-4 rounded-lg border ${
                    testResult.success 
                      ? 'bg-green-500/10 border-green-500/30' 
                      : 'bg-red-500/10 border-red-500/30'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      {testResult.success ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400" />
                      )}
                      <span className={testResult.success ? 'text-green-400' : 'text-red-400'}>
                        {testResult.success ? 'Test Passed' : 'Test Failed'}
                      </span>
                      <span className="text-text-muted text-sm">({testResult.duration_ms}ms)</span>
                    </div>
                    
                    {testResult.logs.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs text-text-muted mb-1">Logs:</p>
                        <pre className="text-sm bg-bg-tertiary p-2 rounded overflow-auto max-h-32">
                          {testResult.logs.join('\n')}
                        </pre>
                      </div>
                    )}
                    
                    {testResult.success ? (
                      <div>
                        <p className="text-xs text-text-muted mb-1">Output:</p>
                        <pre className="text-sm bg-bg-tertiary p-2 rounded overflow-auto max-h-48">
                          {JSON.stringify(testResult.output, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-text-muted mb-1">Error:</p>
                        <pre className="text-sm text-red-400 bg-bg-tertiary p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap">
                          {testResult.error}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Test History */}
                {selectedTool.test_results.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-text-secondary mb-2">Recent Tests</h4>
                    <div className="space-y-1">
                      {selectedTool.test_results.slice(-5).reverse().map((test) => (
                        <div key={test.id} className="flex items-center gap-3 text-sm">
                          {test.success ? (
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400" />
                          )}
                          <span className="text-text-muted">{new Date(test.timestamp).toLocaleString()}</span>
                          <span className="text-text-muted">{test.duration_ms}ms</span>
                        </div>
                      ))}
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
              <p className="text-text-muted mb-4">
                Describe what you want the tool to do and AI will generate the code for you.
              </p>
              <textarea
                value={generatePrompt}
                onChange={(e) => setGeneratePrompt(e.target.value)}
                placeholder="Example: Create a tool that fetches the current weather for a given city using the OpenWeatherMap API"
                className="w-full p-3 bg-surface border border-border rounded-lg text-text-primary resize-none"
                rows={4}
              />
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAIGenerate}
                disabled={isGenerating || !generatePrompt.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Generate
              </button>
            </div>
          </div>
        </>
      )}

      {/* AI Chat Modal */}
      {showAIChat && selectedTool && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowAIChat(false)} />
          <div className="fixed inset-4 md:inset-8 lg:inset-12 bg-bg-elevated border border-border rounded-xl z-50 flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold text-text-primary">AI Tool Assistant</h3>
                <span className="text-sm text-text-muted">- {selectedTool.display_name}</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Include Last Test Button */}
                {selectedTool.test_results.length > 0 && (
                  <button
                    onClick={() => {
                      const lastTest = selectedTool.test_results[selectedTool.test_results.length - 1];
                      const testInfo = lastTest.success 
                        ? `Last test PASSED (${lastTest.duration_ms}ms). Output: ${JSON.stringify(lastTest.output, null, 2)}`
                        : `Last test FAILED (${lastTest.duration_ms}ms). Error:\n${lastTest.error}`;
                      setAiChatInput(prev => prev + (prev ? '\n\n' : '') + `Here's the last test result:\n${testInfo}`);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-surface hover:bg-surface-hover border border-border rounded transition-colors"
                  >
                    {selectedTool.test_results[selectedTool.test_results.length - 1]?.success ? (
                      <CheckCircle className="w-3 h-3 text-green-400" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-400" />
                    )}
                    Include Last Test
                  </button>
                )}
                <button onClick={() => setShowAIChat(false)} className="p-1 hover:bg-surface rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Chat Messages */}
            <div 
              className="flex-1 overflow-y-auto p-4 space-y-4"
              ref={chatContainerRef}
            >
              {aiChatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-lg ${
                    msg.role === 'user' 
                      ? 'bg-accent text-white' 
                      : 'bg-surface border border-border'
                  }`}>
                    <pre className="whitespace-pre-wrap font-sans text-sm">{msg.content}</pre>
                  </div>
                </div>
              ))}
              {isAiThinking && (
                <div className="flex justify-start">
                  <div className="bg-surface border border-border p-3 rounded-lg flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                    <span className="text-sm text-text-muted">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Pending Changes Banner */}
            {(window as any).__pendingToolChanges && (
              <div className="mx-4 mb-2 p-3 bg-purple-500/20 border border-purple-500/30 rounded-lg flex items-center justify-between">
                <span className="text-purple-400 text-sm">Changes ready to apply</span>
                <button
                  onClick={handleApplyAIChanges}
                  className="px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded transition-colors"
                >
                  Apply Changes
                </button>
              </div>
            )}
            
            {/* Input */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2 items-end">
                <textarea
                  value={aiChatInput}
                  onChange={(e) => setAiChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      const input = aiChatInput.trim().toLowerCase();
                      if ((window as any).__pendingToolChanges && (input === 'yes' || input === 'y' || input === 'apply')) {
                        handleApplyAIChanges();
                        return;
                      }
                      handleAIChatSend();
                    }
                  }}
                  placeholder="Describe the issue or what you want to change... (Shift+Enter for new line)"
                  className="flex-1 px-4 py-3 bg-surface border border-border rounded-lg text-text-primary resize-none min-h-[60px] max-h-[150px]"
                  rows={2}
                  disabled={isAiThinking}
                />
                <button
                  onClick={handleAIChatSend}
                  disabled={isAiThinking || !aiChatInput.trim()}
                  className="px-4 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50 h-[60px]"
                >
                  Send
                </button>
              </div>
              <p className="text-xs text-text-muted mt-2">
                Tip: Describe what's wrong or what you want to change. Type "yes" to apply suggested changes. Shift+Enter for new line.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
