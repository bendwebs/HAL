'use client';

import { useState, useEffect, useMemo } from 'react';
import { personas, models as modelsApi, voiceSettings } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { 
  Users, Plus, Trash2, Edit2, Bot, Globe, Lock, Sparkles, 
  Loader2, ChevronUp, Send, Volume2, Cpu,
  MessageSquare, Star, Brain, Wrench, Zap, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Persona {
  id: string;
  name: string;
  description: string;
  system_prompt?: string;
  avatar_emoji: string;
  temperature: number;
  model_override?: string;
  default_voice_id?: string;
  is_public: boolean;
  is_system: boolean;
  is_default: boolean;
  is_owner?: boolean;
  usage_count?: number;
  last_used?: string;
  created_at: string;
}

interface Voice {
  id: string;
  name: string;
  gender?: string;
  accent?: string;
}

interface Model {
  name: string;
  size?: number;
}

// Model capabilities configuration
interface ModelCapabilities {
  thinking: boolean;
  tools: boolean;
  fast: boolean;
  vision: boolean;
  code: boolean;
  embedding: boolean;
  description?: string;
}

const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // Qwen 3 - best for reasoning and tools
  'qwen3:8b': { thinking: true, tools: true, fast: true, vision: false, code: true, embedding: false, description: 'Best balance' },
  'qwen3:8b-8k': { thinking: true, tools: true, fast: true, vision: false, code: true, embedding: false, description: '8K context' },
  'qwen3:8b-32k': { thinking: true, tools: true, fast: false, vision: false, code: true, embedding: false, description: '32K context' },
  
  // Qwen 2.5
  'qwen2.5:7b': { thinking: false, tools: true, fast: true, vision: false, code: true, embedding: false, description: 'Good tools' },
  'qwen2.5vl:7b': { thinking: false, tools: true, fast: false, vision: true, code: false, embedding: false, description: 'Vision model' },
  
  // Llama
  'llama3:8b': { thinking: false, tools: false, fast: true, vision: false, code: false, embedding: false, description: 'General' },
  'llama3.2:latest': { thinking: false, tools: false, fast: true, vision: false, code: false, embedding: false, description: 'Compact' },
  'llama3.2:3b': { thinking: false, tools: false, fast: true, vision: false, code: false, embedding: false, description: 'Ultra-fast' },
  'llama3.2-vision:latest': { thinking: false, tools: false, fast: false, vision: true, code: false, embedding: false, description: 'Vision' },
  
  // Code
  'codellama:7b': { thinking: false, tools: false, fast: true, vision: false, code: true, embedding: false, description: 'Code gen' },
  'nouscoder-14b:q4_k_m': { thinking: false, tools: false, fast: false, vision: false, code: true, embedding: false, description: 'Advanced' },
  
  // Other
  'dolphin3:latest': { thinking: false, tools: true, fast: true, vision: false, code: false, embedding: false, description: 'Uncensored' },
  'gemma3:4b': { thinking: false, tools: false, fast: true, vision: false, code: false, embedding: false, description: 'Very fast' },
  
  // Embeddings
  'nomic-embed-text:latest': { thinking: false, tools: false, fast: true, vision: false, code: false, embedding: true },
  'mxbai-embed-large:latest': { thinking: false, tools: false, fast: true, vision: false, code: false, embedding: true },
  
  // HuggingFace
  'hf.co/hugging-quants/Llama-3.2-1B-Instruct-Q8_0-GGUF:Q8_0': { thinking: false, tools: false, fast: true, vision: false, code: false, embedding: false, description: '1B tiny' },
};

function getModelCapabilities(modelName: string): ModelCapabilities {
  if (MODEL_CAPABILITIES[modelName]) return MODEL_CAPABILITIES[modelName];
  
  const baseName = modelName.split(':')[0];
  for (const key of Object.keys(MODEL_CAPABILITIES)) {
    if (key.startsWith(baseName)) return MODEL_CAPABILITIES[key];
  }
  
  return { thinking: false, tools: false, fast: false, vision: false, code: false, embedding: false };
}

type ModelGroup = 'toolsAndReasoning' | 'vision' | 'code' | 'general' | 'embedding';

function categorizeModel(modelName: string): ModelGroup {
  const caps = getModelCapabilities(modelName);
  
  if (caps.embedding) return 'embedding';
  if (caps.thinking || caps.tools) return 'toolsAndReasoning';
  if (caps.vision) return 'vision';
  if (caps.code) return 'code';
  return 'general';
}

const GROUP_ORDER: ModelGroup[] = ['toolsAndReasoning', 'vision', 'code', 'general', 'embedding'];

const GROUP_INFO: Record<ModelGroup, { label: string; hint: string }> = {
  toolsAndReasoning: { label: 'Tools & Reasoning', hint: 'Best for HAL - supports function calling and deep thinking' },
  vision: { label: 'Vision', hint: 'Can analyze images' },
  code: { label: 'Code Specialists', hint: 'Optimized for programming tasks' },
  general: { label: 'General Purpose', hint: 'Fast, lightweight models' },
  embedding: { label: 'Embeddings (Not for Chat)', hint: 'Used for RAG/search, not conversations' },
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function PersonasPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [personaList, setPersonaList] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [availableVoices, setAvailableVoices] = useState<Voice[]>([]);
  const [defaultModelName, setDefaultModelName] = useState<string>('');
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [avatarEmoji, setAvatarEmoji] = useState('🤖');
  const [temperature, setTemperature] = useState(0.7);
  const [isPublic, setIsPublic] = useState(false);
  const [modelOverride, setModelOverride] = useState<string>('');
  const [defaultVoiceId, setDefaultVoiceId] = useState<string>('');
  
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiMessages, setAiMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  
  const [showTestChat, setShowTestChat] = useState(false);
  const [testMessages, setTestMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [testInput, setTestInput] = useState('');
  const [isTestLoading, setIsTestLoading] = useState(false);

  // Group models by capability
  const groupedModels = useMemo(() => {
    const groups: Record<ModelGroup, Model[]> = {
      toolsAndReasoning: [],
      vision: [],
      code: [],
      general: [],
      embedding: [],
    };
    
    for (const model of availableModels) {
      const group = categorizeModel(model.name);
      groups[group].push(model);
    }
    
    return groups;
  }, [availableModels]);

  useEffect(() => {
    loadPersonas();
    loadModels();
    loadVoices();
  }, []);

  const loadPersonas = async () => {
    try {
      setIsLoading(true);
      const data = await personas.list();
      setPersonaList(data);
    } catch (err) {
      console.error('Failed to load personas:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadModels = async () => {
    try {
      const data = await modelsApi.list();
      setAvailableModels(data.models || []);
      if (data.default_chat) setDefaultModelName(data.default_chat);
    } catch (err) {
      console.error('Failed to load models:', err);
    }
  };

  const loadVoices = async () => {
    try {
      const data = await voiceSettings.listEnabled();
      setAvailableVoices(data.voices || []);
    } catch (err) {
      console.error('Failed to load voices:', err);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setSystemPrompt('');
    setAvatarEmoji('🤖');
    setTemperature(0.7);
    setIsPublic(false);
    setModelOverride('');
    setDefaultVoiceId('');
    setEditingPersona(null);
    setShowAIAssistant(false);
    setAiMessages([]);
    setAiInput('');
    setGeneratedPrompt('');
    setShowTestChat(false);
    setTestMessages([]);
    setTestInput('');
  };

  const openEditModal = async (persona: Persona) => {
    try {
      const fullPersona = await personas.get(persona.id);
      setEditingPersona(fullPersona);
      setName(fullPersona.name);
      setDescription(fullPersona.description || '');
      setSystemPrompt(fullPersona.system_prompt || '');
      setAvatarEmoji(fullPersona.avatar_emoji || '🤖');
      setTemperature(fullPersona.temperature || 0.7);
      setIsPublic(fullPersona.is_public || false);
      setModelOverride(fullPersona.model_override || '');
      setDefaultVoiceId(fullPersona.default_voice_id || '');
      setShowModal(true);
    } catch (err) {
      console.error('Failed to load persona details:', err);
      toast.error('Failed to load persona details');
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !systemPrompt.trim()) {
      toast.error('Name and system prompt are required');
      return;
    }
    
    const data = {
      name,
      description,
      system_prompt: systemPrompt,
      avatar_emoji: avatarEmoji,
      temperature,
      is_public: isPublic,
      model_override: modelOverride || null,
      default_voice_id: defaultVoiceId || null,
    };
    
    try {
      if (editingPersona) {
        await personas.update(editingPersona.id, data);
        toast.success('Persona updated');
      } else {
        await personas.create(data);
        toast.success('Persona created');
      }
      setShowModal(false);
      resetForm();
      loadPersonas();
    } catch (err) {
      console.error('Failed to save persona:', err);
      toast.error('Failed to save persona');
    }
  };

  const handleDelete = async (id: string) => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Delete this persona?</p>
        <div className="flex gap-2 mt-1">
          <button onClick={() => toast.dismiss(t.id)} className="px-3 py-1.5 text-sm bg-surface hover:bg-bg-tertiary rounded-lg">Cancel</button>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await personas.delete(id);
                setPersonaList(personaList.filter(p => p.id !== id));
                toast.success('Persona deleted');
              } catch (err) {
                toast.error('Failed to delete persona');
              }
            }}
            className="px-3 py-1.5 text-sm bg-error hover:bg-error/80 text-white rounded-lg"
          >Delete</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const startAIAssistant = () => {
    setShowAIAssistant(true);
    setShowTestChat(false);
    setAiMessages([{
      role: 'assistant',
      content: `Hi! I'll help you create a system prompt. What is this persona's main purpose? (e.g., coding assistant, writing coach, tutor)`
    }]);
  };

  const sendAIMessage = async () => {
    if (!aiInput.trim() || isAILoading) return;
    
    const userMessage = aiInput.trim();
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsAILoading(true);
    
    try {
      const conversationSoFar = [...aiMessages, { role: 'user' as const, content: userMessage }];
      const response = await fetch(`${API_URL}/api/personas/ai-assist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('hal-auth') ? JSON.parse(localStorage.getItem('hal-auth')!).state?.token : ''}`,
        },
        body: JSON.stringify({ messages: conversationSoFar, persona_name: name || 'New Persona' }),
      });
      
      if (!response.ok) throw new Error('Failed');
      const data = await response.json();
      setAiMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      if (data.generated_prompt) setGeneratedPrompt(data.generated_prompt);
    } catch (err) {
      toast.error('Failed to get AI response');
      setAiMessages(prev => [...prev, { role: 'assistant', content: 'Error. Check Ollama is running.' }]);
    } finally {
      setIsAILoading(false);
    }
  };

  const applyGeneratedPrompt = () => {
    if (generatedPrompt) {
      setSystemPrompt(generatedPrompt);
      setShowAIAssistant(false);
      setGeneratedPrompt('');
      toast.success('Prompt applied!');
    }
  };

  const startTestChat = () => {
    setShowTestChat(true);
    setShowAIAssistant(false);
    setTestMessages([]);
  };

  const sendTestMessage = async () => {
    if (!testInput.trim() || isTestLoading || !systemPrompt.trim()) return;
    
    const userMessage = testInput.trim();
    setTestInput('');
    setTestMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsTestLoading(true);
    
    try {
      const data = await personas.testChat({
        system_prompt: systemPrompt,
        message: userMessage,
        temperature,
        model_override: modelOverride || undefined,
      });
      setTestMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      toast.error('Failed to get response');
      setTestMessages(prev => [...prev, { role: 'assistant', content: 'Error getting response.' }]);
    } finally {
      setIsTestLoading(false);
    }
  };

  const getDisplayModelName = (modelOverride?: string) => modelOverride || defaultModelName || 'system default';

  // Small capability indicator
  const CapabilityBadge = ({ model }: { model: string }) => {
    const caps = getModelCapabilities(model);
    const badges = [];
    if (caps.thinking) badges.push({ icon: <Brain className="w-3 h-3" />, color: 'text-purple-400', title: 'Thinking' });
    if (caps.tools) badges.push({ icon: <Wrench className="w-3 h-3" />, color: 'text-blue-400', title: 'Tools' });
    if (caps.vision) badges.push({ icon: <Eye className="w-3 h-3" />, color: 'text-green-400', title: 'Vision' });
    if (caps.code) badges.push({ icon: <span className="text-[10px] font-bold">{`</>`}</span>, color: 'text-yellow-400', title: 'Code' });
    if (caps.fast) badges.push({ icon: <Zap className="w-3 h-3" />, color: 'text-orange-400', title: 'Fast' });
    
    if (badges.length === 0) return null;
    return (
      <span className="inline-flex items-center gap-0.5 ml-1">
        {badges.map((b, i) => <span key={i} className={b.color} title={b.title}>{b.icon}</span>)}
      </span>
    );
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Personas</h1>
            {defaultModelName && (
              <p className="text-sm text-text-muted mt-1">
                Default: <span className="text-text-secondary font-mono">{defaultModelName}</span>
                <CapabilityBadge model={defaultModelName} />
              </p>
            )}
          </div>
          
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Persona</span>
          </button>
        </div>

        {/* Personas Grid */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => <div key={i} className="h-48 bg-surface animate-pulse rounded-xl" />)}
          </div>
        ) : personaList.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-text-primary mb-2">No personas yet</h2>
            <p className="text-text-secondary mb-6">Create custom AI personalities for different tasks</p>
            <button
              onClick={() => { resetForm(); setShowModal(true); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Create Your First Persona
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {personaList.map(persona => (
              <div
                key={persona.id}
                className={`p-4 bg-surface border rounded-xl hover:border-border-hover transition-colors ${
                  persona.is_default ? 'border-accent/50 ring-1 ring-accent/20' : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{persona.avatar_emoji}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-text-primary">{persona.name}</h3>
                        {persona.is_default && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs bg-accent/20 text-accent rounded">
                            <Star className="w-3 h-3" fill="currentColor" />
                            Default
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        {persona.is_system ? (
                          <span className="flex items-center gap-1"><Bot className="w-3 h-3" /> System</span>
                        ) : persona.is_public ? (
                          <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> Public</span>
                        ) : (
                          <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Private</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                <p className="text-sm text-text-secondary mb-3 line-clamp-2">{persona.description || 'No description'}</p>
                
                <div className="flex items-center gap-3 text-xs text-text-muted mb-3">
                  <span title="Temperature">{persona.temperature}</span>
                  <span className="flex items-center">
                    {(persona.model_override || defaultModelName || 'default').split(':')[0]}
                    <CapabilityBadge model={persona.model_override || defaultModelName} />
                  </span>
                </div>
                
                <div className="flex items-center justify-end">
                  {(persona.is_owner || isAdmin) && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditModal(persona)} className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {!persona.is_system && (
                        <button onClick={() => handleDelete(persona.id)} className="p-2 text-text-muted hover:text-error hover:bg-error/10 rounded-lg">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => { setShowModal(false); resetForm(); }} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-bg-elevated border border-border rounded-xl shadow-lg z-50 p-6">
            <h2 className="text-xl font-semibold text-text-primary mb-6">
              {editingPersona ? 'Edit Persona' : 'Create Persona'}
              {editingPersona?.is_default && (
                <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-sm bg-accent/20 text-accent rounded">
                  <Star className="w-3 h-3" fill="currentColor" /> Default
                </span>
              )}
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div>
                    <label className="block text-sm text-text-secondary mb-1.5">Avatar</label>
                    <input
                      type="text"
                      value={avatarEmoji}
                      onChange={(e) => setAvatarEmoji(e.target.value)}
                      className="w-16 h-16 text-center text-3xl rounded-lg bg-bg-tertiary border border-border focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm text-text-secondary mb-1.5">Name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Persona name"
                      className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description"
                    className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
                
                {/* Model Selection - Clean Groups */}
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">
                    <Cpu className="w-3 h-3 inline mr-1" />
                    Model
                  </label>
                  <select
                    value={modelOverride}
                    onChange={(e) => setModelOverride(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent"
                  >
                    <option value="">System Default ({defaultModelName || '...'})</option>
                    
                    {GROUP_ORDER.map(group => {
                      const models = groupedModels[group];
                      if (models.length === 0) return null;
                      const info = GROUP_INFO[group];
                      
                      return (
                        <optgroup key={group} label={`── ${info.label} ──`}>
                          {models.map(model => {
                            const caps = getModelCapabilities(model.name);
                            const isDefault = model.name === defaultModelName;
                            return (
                              <option key={model.name} value={model.name}>
                                {model.name}{isDefault ? ' ★' : ''}{caps.description ? ` (${caps.description})` : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      );
                    })}
                  </select>
                  
                  {/* Selected model info */}
                  <div className="mt-2 text-xs text-text-muted flex items-center gap-2">
                    <span>Using: <span className="text-text-secondary">{modelOverride || defaultModelName || 'default'}</span></span>
                    <CapabilityBadge model={modelOverride || defaultModelName} />
                  </div>
                  
                  {/* Compact legend */}
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-muted">
                    <span className="flex items-center gap-0.5"><Brain className="w-2.5 h-2.5 text-purple-400" /> Thinking</span>
                    <span className="flex items-center gap-0.5"><Wrench className="w-2.5 h-2.5 text-blue-400" /> Tools</span>
                    <span className="flex items-center gap-0.5"><Eye className="w-2.5 h-2.5 text-green-400" /> Vision</span>
                    <span className="flex items-center gap-0.5"><span className="text-yellow-400 font-bold">{`</>`}</span> Code</span>
                    <span className="flex items-center gap-0.5"><Zap className="w-2.5 h-2.5 text-orange-400" /> Fast</span>
                  </div>
                </div>
                
                {/* Voice */}
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">
                    <Volume2 className="w-3 h-3 inline mr-1" />
                    Voice
                  </label>
                  <select
                    value={defaultVoiceId}
                    onChange={(e) => setDefaultVoiceId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent"
                  >
                    <option value="">System default</option>
                    {availableVoices.map(voice => (
                      <option key={voice.id} value={voice.id}>{voice.name} {voice.gender ? `(${voice.gender})` : ''}</option>
                    ))}
                  </select>
                </div>
                
                {/* Temperature */}
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">Temperature ({temperature})</label>
                  <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full" />
                  <div className="flex justify-between text-xs text-text-muted mt-1">
                    <span>Precise</span>
                    <span>Creative</span>
                  </div>
                </div>
                
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="w-4 h-4 rounded border-border text-accent" />
                  <div>
                    <p className="text-text-primary">Make public</p>
                    <p className="text-xs text-text-muted">Others can use this persona</p>
                  </div>
                </label>
              </div>
              
              {/* Right Column - System Prompt */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm text-text-secondary">System Prompt *</label>
                    <div className="flex gap-2">
                      <button
                        onClick={startTestChat}
                        disabled={!systemPrompt.trim()}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs bg-green-500/10 hover:bg-green-500/20 text-green-400 disabled:opacity-50 rounded-lg"
                      >
                        <MessageSquare className="w-3 h-3" /> Test
                      </button>
                      <button onClick={startAIAssistant} className="flex items-center gap-1.5 px-3 py-1 text-xs bg-accent/10 hover:bg-accent/20 text-accent rounded-lg">
                        <Sparkles className="w-3 h-3" /> AI Assist
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Instructions for how this AI persona should behave..."
                    className="w-full px-4 py-3 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent resize-none font-mono text-sm min-h-[200px] md:min-h-[300px] lg:min-h-[380px]"
                    rows={16}
                  />
                  <p className="text-xs text-text-muted mt-1">{systemPrompt.length} chars</p>
                </div>
              </div>
            </div>
            
            {/* AI Assistant Panel */}
            {showAIAssistant && (
              <div className="mt-6 border-t border-border pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-text-primary flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-accent" /> AI Assistant
                  </h3>
                  <button onClick={() => setShowAIAssistant(false)} className="text-text-muted hover:text-text-primary">
                    <ChevronUp className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="bg-bg-tertiary rounded-lg p-4 max-h-64 overflow-y-auto mb-4 space-y-4">
                  {aiMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-lg px-4 py-2 ${msg.role === 'user' ? 'bg-accent text-white' : 'bg-surface border border-border text-text-primary'}`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {isAILoading && <div className="flex justify-start"><div className="bg-surface border border-border rounded-lg px-4 py-2"><Loader2 className="w-4 h-4 animate-spin text-accent" /></div></div>}
                </div>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendAIMessage()}
                    placeholder="Describe your persona..."
                    className="flex-1 px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent"
                    disabled={isAILoading}
                  />
                  <button onClick={sendAIMessage} disabled={isAILoading || !aiInput.trim()} className="px-4 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                
                {generatedPrompt && (
                  <div className="mt-4 p-4 bg-accent/10 border border-accent/30 rounded-lg">
                    <p className="text-sm text-text-secondary mb-2">Prompt ready!</p>
                    <button onClick={applyGeneratedPrompt} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg">
                      <Sparkles className="w-4 h-4" /> Apply
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {/* Test Chat Panel */}
            {showTestChat && (
              <div className="mt-6 border-t border-border pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-text-primary flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-green-400" /> Test Chat
                    <span className="text-xs text-text-muted font-normal ml-2">({modelOverride || defaultModelName || 'default'})</span>
                  </h3>
                  <button onClick={() => setShowTestChat(false)} className="text-text-muted hover:text-text-primary">
                    <ChevronUp className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="bg-bg-tertiary rounded-lg p-4 max-h-64 overflow-y-auto mb-4 space-y-4">
                  {testMessages.length === 0 ? (
                    <p className="text-sm text-text-muted text-center py-4">Send a message to test</p>
                  ) : (
                    testMessages.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-lg px-4 py-2 ${msg.role === 'user' ? 'bg-green-600 text-white' : 'bg-surface border border-border text-text-primary'}`}>
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                  {isTestLoading && <div className="flex justify-start"><div className="bg-surface border border-border rounded-lg px-4 py-2"><Loader2 className="w-4 h-4 animate-spin text-green-400" /></div></div>}
                </div>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendTestMessage()}
                    placeholder="Type a test message..."
                    className="flex-1 px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent"
                    disabled={isTestLoading}
                  />
                  <button onClick={sendTestMessage} disabled={isTestLoading || !testInput.trim()} className="px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            
            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
              <button onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2 text-text-secondary hover:text-text-primary">Cancel</button>
              <button
                onClick={handleSave}
                disabled={!name.trim() || !systemPrompt.trim()}
                className="px-6 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg"
              >
                {editingPersona ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
