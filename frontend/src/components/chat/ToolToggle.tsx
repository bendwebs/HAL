'use client';

import { useState, useEffect } from 'react';
import { Chat, Tool } from '@/types';
import { tools as toolsApi, chats as chatsApi } from '@/lib/api';
import { 
  Wrench, ChevronDown, Check, Globe, FileSearch,
  Brain, Calculator, Save, Youtube, ImageIcon, Bot
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ToolToggleProps {
  chat: Chat;
  onUpdate: (chat: Chat) => void;
}

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
  web_search: 'Search the web for current info',
  youtube_search: 'Search and play YouTube videos',
  document_search: 'Search your uploaded documents',
  memory_recall: 'Remember things about you',
  memory_store: 'Save new info about you',
  calculator: 'Perform calculations',
  generate_image: 'Generate AI images with Stable Diffusion',
  spawn_agent: 'Create sub-agents for complex tasks',
};

// Tools that are enabled by default for new chats
const DEFAULT_ENABLED_TOOLS = [
  'web_search', 
  'youtube_search', 
  'document_search', 
  'memory_recall', 
  'memory_store', 
  'calculator',
  'generate_image'
];

export default function ToolToggle({ chat, onUpdate }: ToolToggleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [tools, setTools] = useState<Tool[]>([]);
  const [enabledTools, setEnabledTools] = useState<string[]>(
    chat.enabled_tools ?? DEFAULT_ENABLED_TOOLS
  );

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

  const toggleTool = async (toolName: string) => {
    const newEnabled = enabledTools.includes(toolName)
      ? enabledTools.filter(t => t !== toolName)
      : [...enabledTools, toolName];
    
    setEnabledTools(newEnabled);
    
    try {
      const updated = await chatsApi.update(chat.id, {
        enabled_tools: newEnabled
      });
      onUpdate(updated);
    } catch (err) {
      console.error('Failed to update tools:', err);
      setEnabledTools(enabledTools); // Revert on error
      toast.error('Failed to update tools');
    }
  };

  const enableAll = async () => {
    const allToolNames = tools.map(t => t.name);
    setEnabledTools(allToolNames);
    try {
      const updated = await chatsApi.update(chat.id, { enabled_tools: allToolNames });
      onUpdate(updated);
    } catch (err) {
      toast.error('Failed to update tools');
    }
  };

  const disableAll = async () => {
    setEnabledTools([]);
    try {
      const updated = await chatsApi.update(chat.id, { enabled_tools: [] });
      onUpdate(updated);
    } catch (err) {
      toast.error('Failed to update tools');
    }
  };

  const enabledCount = enabledTools.length;
  const totalCount = tools.length || DEFAULT_ENABLED_TOOLS.length;
  const disabledCount = totalCount - enabledCount;

  // Sort tools: enabled first, then alphabetically
  const sortedTools = [...tools].sort((a, b) => {
    const aEnabled = enabledTools.includes(a.name);
    const bEnabled = enabledTools.includes(b.name);
    if (aEnabled && !bEnabled) return -1;
    if (!aEnabled && bEnabled) return 1;
    return a.display_name.localeCompare(b.display_name);
  });

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`flex items-center gap-1.5 px-2 py-1 text-sm rounded-lg transition-colors ${
          disabledCount > 0 
            ? 'text-amber-400 hover:bg-amber-400/10' 
            : 'text-text-secondary hover:bg-surface'
        }`}
        title="Configure tools"
      >
        <Wrench className="w-4 h-4" />
        <span className="text-xs">
          Tools {enabledCount}/{totalCount}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
      </button>
      
      {showMenu && (
        <>
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />
          {/* Menu opens upward from the toolbar */}
          <div className="absolute left-0 bottom-full mb-2 w-72 bg-bg-elevated border border-border rounded-lg shadow-lg z-50 py-2 max-h-96 overflow-y-auto">
            <div className="px-3 pb-2 mb-2 border-b border-border">
              <h3 className="font-medium text-text-primary text-sm">Tools</h3>
              <p className="text-xs text-text-muted">Toggle which tools HAL can use</p>
            </div>
            
            {sortedTools.map(tool => {
              const Icon = TOOL_ICONS[tool.name] || Wrench;
              const isEnabled = enabledTools.includes(tool.name);
              const description = TOOL_DESCRIPTIONS[tool.name] || tool.description || '';
              
              return (
                <button
                  key={tool.name}
                  onClick={() => toggleTool(tool.name)}
                  className="w-full px-3 py-2 flex items-center gap-3 hover:bg-surface transition-colors"
                >
                  <div className={`p-1.5 rounded ${isEnabled ? 'bg-accent/10 text-accent' : 'bg-surface text-text-muted'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className={`text-sm ${isEnabled ? 'text-text-primary' : 'text-text-muted line-through'}`}>
                      {tool.display_name}
                    </p>
                    <p className="text-xs text-text-muted truncate">
                      {description}
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center ${
                    isEnabled ? 'bg-accent text-white' : 'bg-surface border border-border'
                  }`}>
                    {isEnabled && <Check className="w-3 h-3" />}
                  </div>
                </button>
              );
            })}
            
            {tools.length === 0 && (
              <div className="px-3 py-4 text-center text-text-muted text-sm">
                Loading tools...
              </div>
            )}
            
            <div className="px-3 pt-2 mt-2 border-t border-border flex gap-2">
              <button
                onClick={enableAll}
                className="flex-1 text-xs text-text-secondary hover:text-text-primary py-1"
              >
                Enable All
              </button>
              <button
                onClick={disableAll}
                className="flex-1 text-xs text-text-secondary hover:text-text-primary py-1"
              >
                Disable All
              </button>
            </div>
            
            {disabledCount > 0 && (
              <div className="px-3 pt-2 mt-2 border-t border-border">
                <p className="text-xs text-amber-400">
                  ⚠️ {disabledCount} tool{disabledCount > 1 ? 's' : ''} disabled
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
