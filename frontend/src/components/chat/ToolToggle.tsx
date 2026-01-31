'use client';

import { useState, useEffect, useMemo } from 'react';
import { Chat, Tool } from '@/types';
import { tools as toolsApi, chats as chatsApi } from '@/lib/api';
import { 
  Wrench, ChevronDown, ChevronRight, Check, Globe, FileSearch,
  Brain, Calculator, Save, Youtube, ImageIcon, Bot, AlertCircle,
  Server, Sparkles, Search, Database
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ToolToggleProps {
  chat: Chat;
  onUpdate: (chat: Chat) => void;
}

// Tool category definitions
type ToolCategory = 'search' | 'memory' | 'media' | 'utility' | 'mcp' | 'custom' | 'other';

const CATEGORY_INFO: Record<ToolCategory, { label: string; icon: any; color: string }> = {
  search: { label: 'Search', icon: Search, color: 'text-blue-400' },
  memory: { label: 'Memory', icon: Brain, color: 'text-purple-400' },
  media: { label: 'Media', icon: ImageIcon, color: 'text-pink-400' },
  utility: { label: 'Utility', icon: Calculator, color: 'text-green-400' },
  mcp: { label: 'MCP Tools', icon: Server, color: 'text-teal-400' },
  custom: { label: 'Custom', icon: Sparkles, color: 'text-orange-400' },
  other: { label: 'Other', icon: Wrench, color: 'text-text-muted' },
};

// Map tool names to categories
const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  web_search: 'search',
  document_search: 'search',
  youtube_search: 'media',
  generate_image: 'media',
  memory_recall: 'memory',
  memory_store: 'memory',
  calculator: 'utility',
  spawn_agent: 'utility',
};

const TOOL_ICONS: Record<string, any> = {
  web_search: Globe,
  youtube_search: Youtube,
  document_search: FileSearch,
  memory_recall: Brain,
  memory_store: Save,
  calculator: Calculator,
  generate_image: ImageIcon,
  spawn_agent: Bot,
};

const TOOL_DESCRIPTIONS: Record<string, string> = {
  web_search: 'Search the web',
  youtube_search: 'Find videos',
  document_search: 'Search docs',
  memory_recall: 'Remember you',
  memory_store: 'Save info',
  calculator: 'Calculate',
  generate_image: 'Generate images',
  spawn_agent: 'Sub-agents',
};

const DEFAULT_ENABLED_TOOLS = [
  'web_search', 
  'youtube_search', 
  'document_search', 
  'memory_recall', 
  'memory_store', 
  'calculator',
  'generate_image'
];

function getToolCategory(tool: Tool): ToolCategory {
  if (tool.mcp_server_id) return 'mcp';
  if (tool.is_custom) return 'custom';
  return TOOL_CATEGORIES[tool.name] || 'other';
}

export default function ToolToggle({ chat, onUpdate }: ToolToggleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [tools, setTools] = useState<Tool[]>([]);
  const [enabledTools, setEnabledTools] = useState<string[]>(
    chat.enabled_tools ?? DEFAULT_ENABLED_TOOLS
  );
  const [collapsedCategories, setCollapsedCategories] = useState<Set<ToolCategory>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadTools();
  }, []);

  useEffect(() => {
    setEnabledTools(chat.enabled_tools ?? DEFAULT_ENABLED_TOOLS);
  }, [chat.enabled_tools]);

  const loadTools = async () => {
    try {
      const data = await toolsApi.list();
      setTools(data);
    } catch (err) {
      console.error('Failed to load tools:', err);
    }
  };

  // Group tools by category
  const groupedTools = useMemo(() => {
    const groups: Record<ToolCategory, Tool[]> = {
      search: [],
      memory: [],
      media: [],
      utility: [],
      mcp: [],
      custom: [],
      other: [],
    };
    
    const filtered = searchQuery 
      ? tools.filter(t => 
          t.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : tools;
    
    filtered.forEach(tool => {
      const category = getToolCategory(tool);
      groups[category].push(tool);
    });
    
    return groups;
  }, [tools, searchQuery]);

  // Order of categories to display
  const categoryOrder: ToolCategory[] = ['search', 'memory', 'media', 'utility', 'mcp', 'custom', 'other'];

  const toggleTool = async (toolName: string) => {
    const tool = tools.find(t => t.name === toolName);
    if (tool && !tool.can_toggle) {
      toast.error(`This tool cannot be toggled`);
      return;
    }
    
    const newEnabled = enabledTools.includes(toolName)
      ? enabledTools.filter(t => t !== toolName)
      : [...enabledTools, toolName];
    
    setEnabledTools(newEnabled);
    
    try {
      const updated = await chatsApi.update(chat.id, { enabled_tools: newEnabled });
      onUpdate(updated);
    } catch (err) {
      console.error('Failed to update tools:', err);
      setEnabledTools(enabledTools);
      toast.error('Failed to update tools');
    }
  };

  const toggleCategory = (category: ToolCategory) => {
    const newCollapsed = new Set(collapsedCategories);
    if (newCollapsed.has(category)) {
      newCollapsed.delete(category);
    } else {
      newCollapsed.add(category);
    }
    setCollapsedCategories(newCollapsed);
  };

  const toggleCategoryTools = async (category: ToolCategory, enable: boolean) => {
    const categoryTools = groupedTools[category].filter(t => t.can_toggle);
    const toolNames = categoryTools.map(t => t.name);
    
    let newEnabled: string[];
    if (enable) {
      newEnabled = [...new Set([...enabledTools, ...toolNames])];
    } else {
      newEnabled = enabledTools.filter(t => !toolNames.includes(t));
    }
    
    setEnabledTools(newEnabled);
    try {
      const updated = await chatsApi.update(chat.id, { enabled_tools: newEnabled });
      onUpdate(updated);
    } catch (err) {
      toast.error('Failed to update tools');
      setEnabledTools(enabledTools);
    }
  };

  const enableAll = async () => {
    const toggleableTools = tools.filter(t => t.can_toggle).map(t => t.name);
    const alwaysOnTools = tools.filter(t => !t.can_toggle && t.is_enabled).map(t => t.name);
    const allToolNames = [...toggleableTools, ...alwaysOnTools];
    
    setEnabledTools(allToolNames);
    try {
      const updated = await chatsApi.update(chat.id, { enabled_tools: allToolNames });
      onUpdate(updated);
    } catch (err) {
      toast.error('Failed to update tools');
    }
  };

  const disableAll = async () => {
    const alwaysOnTools = tools.filter(t => !t.can_toggle && t.is_enabled).map(t => t.name);
    
    setEnabledTools(alwaysOnTools);
    try {
      const updated = await chatsApi.update(chat.id, { enabled_tools: alwaysOnTools });
      onUpdate(updated);
    } catch (err) {
      toast.error('Failed to update tools');
    }
  };

  // Stats
  const toggleableTools = tools.filter(t => t.can_toggle);
  const enabledToggleable = toggleableTools.filter(t => enabledTools.includes(t.name));
  const enabledCount = enabledToggleable.length;
  const totalCount = toggleableTools.length;

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`flex items-center gap-1.5 px-2 py-1 text-sm rounded-lg transition-colors ${
          enabledCount < totalCount 
            ? 'text-amber-400 hover:bg-amber-400/10' 
            : 'text-text-secondary hover:bg-surface'
        }`}
        title="Configure tools"
      >
        <Wrench className="w-4 h-4" />
        <span className="text-xs">{enabledCount}/{totalCount}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
      </button>
      
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute left-0 bottom-full mb-2 w-80 bg-bg-elevated border border-border rounded-lg shadow-lg z-50 max-h-[70vh] flex flex-col">
            {/* Header */}
            <div className="px-3 py-2 border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-text-primary text-sm">Tools</h3>
                <div className="flex gap-2 text-xs">
                  <button onClick={enableAll} className="text-accent hover:text-accent-hover">All</button>
                  <span className="text-text-muted">|</span>
                  <button onClick={disableAll} className="text-text-muted hover:text-text-primary">None</button>
                </div>
              </div>
              
              {/* Search */}
              {tools.length > 6 && (
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tools..."
                    className="w-full pl-7 pr-2 py-1.5 text-xs bg-bg-tertiary border border-border rounded text-text-primary placeholder:text-text-muted"
                  />
                </div>
              )}
            </div>
            
            {/* Tool Categories */}
            <div className="overflow-y-auto flex-1 py-1">
              {tools.length === 0 ? (
                <div className="px-3 py-4 text-center text-text-muted text-sm">
                  Loading tools...
                </div>
              ) : (
                categoryOrder.map(category => {
                  const categoryTools = groupedTools[category];
                  if (categoryTools.length === 0) return null;
                  
                  const info = CATEGORY_INFO[category];
                  const Icon = info.icon;
                  const isCollapsed = collapsedCategories.has(category);
                  const enabledInCategory = categoryTools.filter(t => 
                    enabledTools.includes(t.name) || (!t.can_toggle && t.is_enabled)
                  ).length;
                  const toggleableInCategory = categoryTools.filter(t => t.can_toggle).length;
                  const allEnabled = enabledInCategory === categoryTools.length;
                  
                  return (
                    <div key={category} className="mb-1">
                      {/* Category Header */}
                      <div className="flex items-center gap-1 px-2 py-1.5 hover:bg-surface/50">
                        <button
                          onClick={() => toggleCategory(category)}
                          className="flex items-center gap-2 flex-1"
                        >
                          <ChevronRight className={`w-3 h-3 text-text-muted transition-transform ${!isCollapsed ? 'rotate-90' : ''}`} />
                          <Icon className={`w-3.5 h-3.5 ${info.color}`} />
                          <span className="text-xs font-medium text-text-primary">{info.label}</span>
                          <span className="text-xs text-text-muted">
                            {enabledInCategory}/{categoryTools.length}
                          </span>
                        </button>
                        
                        {toggleableInCategory > 0 && (
                          <button
                            onClick={() => toggleCategoryTools(category, !allEnabled)}
                            className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                              allEnabled 
                                ? 'bg-accent/20 text-accent hover:bg-accent/30' 
                                : 'bg-surface text-text-muted hover:bg-surface-hover'
                            }`}
                          >
                            {allEnabled ? 'On' : 'Off'}
                          </button>
                        )}
                      </div>
                      
                      {/* Category Tools */}
                      {!isCollapsed && (
                        <div className="ml-5 space-y-0.5">
                          {categoryTools.map(tool => {
                            const ToolIcon = TOOL_ICONS[tool.name] || (tool.mcp_server_id ? Server : Wrench);
                            const isEnabled = enabledTools.includes(tool.name) || (!tool.can_toggle && tool.is_enabled);
                            const canToggle = tool.can_toggle;
                            const description = TOOL_DESCRIPTIONS[tool.name] || tool.description || '';
                            
                            return (
                              <button
                                key={tool.name}
                                onClick={() => canToggle && toggleTool(tool.name)}
                                disabled={!canToggle}
                                className={`w-full px-2 py-1.5 flex items-center gap-2 rounded transition-colors ${
                                  canToggle ? 'hover:bg-surface cursor-pointer' : 'cursor-not-allowed opacity-60'
                                }`}
                              >
                                <div className={`w-6 h-6 rounded flex items-center justify-center ${
                                  isEnabled ? 'bg-accent/10 text-accent' : 'bg-surface text-text-muted'
                                }`}>
                                  <ToolIcon className="w-3.5 h-3.5" />
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                  <p className={`text-xs ${isEnabled ? 'text-text-primary' : 'text-text-muted'}`}>
                                    {tool.display_name}
                                  </p>
                                  <p className="text-[10px] text-text-muted truncate">
                                    {description}
                                  </p>
                                </div>
                                <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center ${
                                  isEnabled ? 'bg-accent text-white' : 'bg-surface border border-border'
                                }`}>
                                  {isEnabled && <Check className="w-2.5 h-2.5" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Footer */}
            {enabledCount < totalCount && (
              <div className="px-3 py-2 border-t border-border flex-shrink-0">
                <p className="text-xs text-amber-400">
                  {totalCount - enabledCount} tool{totalCount - enabledCount > 1 ? 's' : ''} disabled
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
