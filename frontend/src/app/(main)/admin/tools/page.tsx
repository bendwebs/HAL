'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { admin } from '@/lib/api';
import { 
  ArrowLeft, 
  Wrench, 
  ChevronDown, 
  Check, 
  Search, 
  Filter,
  Grid3X3,
  List,
  SlidersHorizontal,
  X,
  Plus,
  Server,
  ExternalLink,
  Trash2,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle,
  Settings
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Tool {
  id: string;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  permission_level: string;
  default_enabled: boolean;
  usage_count: number;
  last_used: string | null;
  is_custom?: boolean;
  category?: string;
  mcp_server_id?: string;
}

interface MCPServer {
  id: string;
  name: string;
  url: string;
  description: string;
  is_enabled: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'unknown';
  last_connected: string | null;
  tools_count: number;
  created_at: string;
}

const PERMISSION_LEVELS = [
  { value: 'disabled', label: 'Disabled', description: 'Tool is completely unavailable', color: 'text-red-400', bg: 'bg-red-500/20' },
  { value: 'admin_only', label: 'Admin Only', description: 'Only admins can use', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  { value: 'opt_in', label: 'Opt-In', description: 'Users must enable manually', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  { value: 'user_toggle', label: 'User Toggle', description: 'Enabled by default', color: 'text-green-400', bg: 'bg-green-500/20' },
  { value: 'always_on', label: 'Always On', description: 'Cannot be disabled', color: 'text-purple-400', bg: 'bg-purple-500/20' },
];

const TOOL_CATEGORIES = [
  { value: 'all', label: 'All Tools' },
  { value: 'builtin', label: 'Built-in' },
  { value: 'custom', label: 'Custom' },
  { value: 'mcp', label: 'MCP' },
];

type TabType = 'tools' | 'mcp';

export default function AdminToolsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('tools');
  
  // Tools state
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  
  // MCP state
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [isMcpLoading, setIsMcpLoading] = useState(false);
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpUrl, setNewMcpUrl] = useState('');
  const [newMcpDescription, setNewMcpDescription] = useState('');
  const [testingMcp, setTestingMcp] = useState<string | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPermission, setSelectedPermission] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  
  // Stat card filters (multi-select)
  type StatFilter = 'active' | 'disabled' | 'builtin' | 'custom' | 'mcp';
  const [activeStatFilters, setActiveStatFilters] = useState<Set<StatFilter>>(new Set());

  useEffect(() => {
    if (user?.role !== 'admin') {
      router.push('/chat');
      return;
    }
    loadTools();
    loadMcpServers();
  }, [user, router]);

  const loadTools = async () => {
    try {
      setIsLoading(true);
      const data = await admin.tools.list();
      setTools(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tools');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMcpServers = async () => {
    try {
      setIsMcpLoading(true);
      // This will call a new API endpoint
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/admin/mcp-servers`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('hal-auth') ? JSON.parse(localStorage.getItem('hal-auth')!).state?.token : ''}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setMcpServers(data);
      }
    } catch (err) {
      console.error('Failed to load MCP servers:', err);
    } finally {
      setIsMcpLoading(false);
    }
  };

  const addMcpServer = async () => {
    if (!newMcpName.trim() || !newMcpUrl.trim()) {
      toast.error('Name and URL are required');
      return;
    }
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/admin/mcp-servers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('hal-auth') ? JSON.parse(localStorage.getItem('hal-auth')!).state?.token : ''}`,
        },
        body: JSON.stringify({
          name: newMcpName.trim(),
          url: newMcpUrl.trim(),
          description: newMcpDescription.trim(),
        }),
      });
      
      if (response.ok) {
        toast.success('MCP server added');
        setShowAddMcp(false);
        setNewMcpName('');
        setNewMcpUrl('');
        setNewMcpDescription('');
        loadMcpServers();
      } else {
        const err = await response.json();
        toast.error(err.detail || 'Failed to add MCP server');
      }
    } catch (err) {
      toast.error('Failed to add MCP server');
    }
  };

  const testMcpConnection = async (serverId: string) => {
    setTestingMcp(serverId);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/admin/mcp-servers/${serverId}/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('hal-auth') ? JSON.parse(localStorage.getItem('hal-auth')!).state?.token : ''}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        toast.success(`Connected! Found ${data.tools_count} tools`);
        loadMcpServers();
      } else {
        toast.error('Connection failed');
      }
    } catch (err) {
      toast.error('Connection failed');
    } finally {
      setTestingMcp(null);
    }
  };

  const toggleMcpServer = async (serverId: string, enabled: boolean) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/admin/mcp-servers/${serverId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('hal-auth') ? JSON.parse(localStorage.getItem('hal-auth')!).state?.token : ''}`,
        },
        body: JSON.stringify({ is_enabled: enabled }),
      });
      
      if (response.ok) {
        toast.success(enabled ? 'MCP server enabled' : 'MCP server disabled');
        loadMcpServers();
      }
    } catch (err) {
      toast.error('Failed to update MCP server');
    }
  };

  const deleteMcpServer = async (serverId: string) => {
    if (!confirm('Delete this MCP server? Its tools will no longer be available.')) return;
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/admin/mcp-servers/${serverId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('hal-auth') ? JSON.parse(localStorage.getItem('hal-auth')!).state?.token : ''}`,
        },
      });
      
      if (response.ok) {
        toast.success('MCP server removed');
        loadMcpServers();
      }
    } catch (err) {
      toast.error('Failed to delete MCP server');
    }
  };

  const filteredTools = useMemo(() => {
    return tools.filter(tool => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!tool.display_name.toLowerCase().includes(query) && 
            !tool.description.toLowerCase().includes(query) &&
            !tool.name.toLowerCase().includes(query)) {
          return false;
        }
      }
      
      // Category filter (from buttons)
      if (selectedCategory === 'builtin' && (tool.is_custom || tool.mcp_server_id)) return false;
      if (selectedCategory === 'custom' && !tool.is_custom) return false;
      if (selectedCategory === 'mcp' && !tool.mcp_server_id) return false;
      
      if (selectedPermission && tool.permission_level !== selectedPermission) return false;
      
      // Stat card filters (multi-select)
      if (activeStatFilters.size > 0) {
        const isActive = tool.permission_level !== 'disabled';
        const isDisabled = tool.permission_level === 'disabled';
        const isBuiltin = !tool.is_custom && !tool.mcp_server_id;
        const isCustom = tool.is_custom && !tool.mcp_server_id;
        const isMcp = !!tool.mcp_server_id;
        
        // Tool must match at least one of the selected stat filters
        let matchesAny = false;
        if (activeStatFilters.has('active') && isActive) matchesAny = true;
        if (activeStatFilters.has('disabled') && isDisabled) matchesAny = true;
        if (activeStatFilters.has('builtin') && isBuiltin) matchesAny = true;
        if (activeStatFilters.has('custom') && isCustom) matchesAny = true;
        if (activeStatFilters.has('mcp') && isMcp) matchesAny = true;
        
        if (!matchesAny) return false;
      }
      
      return true;
    });
  }, [tools, searchQuery, selectedCategory, selectedPermission, activeStatFilters]);

  const toolStats = useMemo(() => {
    const total = tools.length;
    const custom = tools.filter(t => t.is_custom).length;
    const mcp = tools.filter(t => t.mcp_server_id).length;
    const builtin = total - custom - mcp;
    const disabled = tools.filter(t => t.permission_level === 'disabled').length;
    const active = total - disabled;
    return { total, custom, builtin, mcp, disabled, active };
  }, [tools]);

  const updatePermissionLevel = async (toolId: string, toolName: string, newLevel: string) => {
    try {
      await admin.tools.update(toolId, { permission_level: newLevel });
      toast.success(`${toolName} set to ${PERMISSION_LEVELS.find(p => p.value === newLevel)?.label}`);
      loadTools();
      setOpenDropdown(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tool');
      toast.error('Failed to update tool');
    }
  };

  const getPermissionInfo = (level: string) => {
    return PERMISSION_LEVELS.find(p => p.value === level) || PERMISSION_LEVELS[3];
  };

  const toggleStatFilter = (filter: StatFilter) => {
    setActiveStatFilters(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(filter)) {
        newFilters.delete(filter);
      } else {
        newFilters.add(filter);
      }
      return newFilters;
    });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedPermission(null);
    setActiveStatFilters(new Set());
  };

  const hasActiveFilters = searchQuery || selectedCategory !== 'all' || selectedPermission || activeStatFilters.size > 0;

  if (user?.role !== 'admin') return null;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/admin')}
              className="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-3">
              <Wrench className="w-8 h-8 text-accent" />
              <div>
                <h1 className="text-2xl font-bold text-text-primary">Tool Management</h1>
                <p className="text-sm text-text-muted">
                  {toolStats.total} tools • {mcpServers.length} MCP servers
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 bg-surface rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('tools')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'tools' 
                ? 'bg-accent text-white' 
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Wrench className="w-4 h-4 inline mr-2" />
            Tools ({toolStats.total})
          </button>
          <button
            onClick={() => setActiveTab('mcp')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'mcp' 
                ? 'bg-accent text-white' 
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Server className="w-4 h-4 inline mr-2" />
            MCP Servers ({mcpServers.length})
          </button>
        </div>

        {activeTab === 'tools' ? (
          <>
            {/* Stats Cards - Clickable Filters */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <button
                onClick={() => toggleStatFilter('active')}
                className={`p-3 rounded-lg text-left transition-all ${
                  activeStatFilters.has('active')
                    ? 'bg-green-500/20 border-2 border-green-500 ring-2 ring-green-500/20'
                    : 'bg-surface border border-border hover:border-green-500/50'
                }`}
              >
                <p className={`text-2xl font-bold ${activeStatFilters.has('active') ? 'text-green-400' : 'text-text-primary'}`}>
                  {toolStats.active}
                </p>
                <p className="text-sm text-text-muted">Active</p>
              </button>
              <button
                onClick={() => toggleStatFilter('disabled')}
                className={`p-3 rounded-lg text-left transition-all ${
                  activeStatFilters.has('disabled')
                    ? 'bg-red-500/20 border-2 border-red-500 ring-2 ring-red-500/20'
                    : 'bg-surface border border-border hover:border-red-500/50'
                }`}
              >
                <p className={`text-2xl font-bold ${activeStatFilters.has('disabled') ? 'text-red-400' : 'text-red-400'}`}>
                  {toolStats.disabled}
                </p>
                <p className="text-sm text-text-muted">Disabled</p>
              </button>
              <button
                onClick={() => toggleStatFilter('builtin')}
                className={`p-3 rounded-lg text-left transition-all ${
                  activeStatFilters.has('builtin')
                    ? 'bg-blue-500/20 border-2 border-blue-500 ring-2 ring-blue-500/20'
                    : 'bg-surface border border-border hover:border-blue-500/50'
                }`}
              >
                <p className={`text-2xl font-bold ${activeStatFilters.has('builtin') ? 'text-blue-400' : 'text-blue-400'}`}>
                  {toolStats.builtin}
                </p>
                <p className="text-sm text-text-muted">Built-in</p>
              </button>
              <button
                onClick={() => toggleStatFilter('custom')}
                className={`p-3 rounded-lg text-left transition-all ${
                  activeStatFilters.has('custom')
                    ? 'bg-purple-500/20 border-2 border-purple-500 ring-2 ring-purple-500/20'
                    : 'bg-surface border border-border hover:border-purple-500/50'
                }`}
              >
                <p className={`text-2xl font-bold ${activeStatFilters.has('custom') ? 'text-purple-400' : 'text-purple-400'}`}>
                  {toolStats.custom}
                </p>
                <p className="text-sm text-text-muted">Custom</p>
              </button>
              <button
                onClick={() => toggleStatFilter('mcp')}
                className={`p-3 rounded-lg text-left transition-all ${
                  activeStatFilters.has('mcp')
                    ? 'bg-teal-500/20 border-2 border-teal-500 ring-2 ring-teal-500/20'
                    : 'bg-surface border border-border hover:border-teal-500/50'
                }`}
              >
                <p className={`text-2xl font-bold ${activeStatFilters.has('mcp') ? 'text-teal-400' : 'text-teal-400'}`}>
                  {toolStats.mcp}
                </p>
                <p className="text-sm text-text-muted">MCP</p>
              </button>
            </div>
            
            {/* Active filters indicator */}
            {activeStatFilters.size > 0 && (
              <div className="flex items-center gap-2 mb-4 text-sm">
                <span className="text-text-muted">Filtering by:</span>
                {Array.from(activeStatFilters).map(filter => (
                  <span 
                    key={filter}
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      filter === 'active' ? 'bg-green-500/20 text-green-400' :
                      filter === 'disabled' ? 'bg-red-500/20 text-red-400' :
                      filter === 'builtin' ? 'bg-blue-500/20 text-blue-400' :
                      filter === 'custom' ? 'bg-purple-500/20 text-purple-400' :
                      'bg-teal-500/20 text-teal-400'
                    }`}
                  >
                    {filter}
                  </span>
                ))}
                <button 
                  onClick={() => setActiveStatFilters(new Set())}
                  className="text-text-muted hover:text-text-primary ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tools..."
                  className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted"
                />
              </div>
              
              <div className="flex gap-2">
                {TOOL_CATEGORIES.map(cat => (
                  <button
                    key={cat.value}
                    onClick={() => setSelectedCategory(cat.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedCategory === cat.value
                        ? 'bg-accent text-white'
                        : 'bg-surface hover:bg-surface-hover text-text-secondary'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'grid' ? 'bg-accent text-white' : 'bg-surface hover:bg-surface-hover'
                  }`}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'list' ? 'bg-accent text-white' : 'bg-surface hover:bg-surface-hover'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
              
              {hasActiveFilters && (
                <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-2 text-sm text-text-muted hover:text-text-primary">
                  <X className="w-4 h-4" /> Clear
                </button>
              )}
            </div>

            {error && (
              <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg text-error">{error}</div>
            )}

            <p className="text-sm text-text-muted mb-4">
              Showing {filteredTools.length} of {tools.length} tools
            </p>

            {isLoading ? (
              <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className={`bg-surface animate-pulse rounded-xl ${viewMode === 'grid' ? 'h-40' : 'h-20'}`} />
                ))}
              </div>
            ) : filteredTools.length === 0 ? (
              <div className="text-center py-12">
                <Wrench className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-50" />
                <p className="text-text-muted">No tools found</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTools.map(tool => {
                  const permInfo = getPermissionInfo(tool.permission_level);
                  const isDropdownOpen = openDropdown === tool.id;
                  
                  return (
                    <div
                      key={tool.id}
                      className={`p-4 bg-surface border rounded-xl transition-all hover:shadow-lg ${
                        tool.permission_level === 'disabled' 
                          ? 'border-red-500/30 bg-red-500/5 opacity-60' 
                          : 'border-border hover:border-accent/30'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <span className={`text-3xl ${tool.permission_level === 'disabled' ? 'opacity-50 grayscale' : ''}`}>
                          {tool.icon}
                        </span>
                        <div className="flex gap-1">
                          {tool.mcp_server_id && (
                            <span className="px-2 py-0.5 text-xs bg-teal-500/20 text-teal-400 rounded">MCP</span>
                          )}
                          {tool.is_custom && !tool.mcp_server_id && (
                            <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded">Custom</span>
                          )}
                        </div>
                      </div>
                      
                      <h3 className={`font-medium mb-1 ${tool.permission_level === 'disabled' ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                        {tool.display_name}
                      </h3>
                      
                      <p className="text-sm text-text-muted mb-3 line-clamp-2">{tool.description}</p>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-text-muted">{tool.usage_count} uses</span>
                        
                        <div className="relative">
                          <button
                            onClick={() => setOpenDropdown(isDropdownOpen ? null : tool.id)}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${permInfo.bg} ${permInfo.color}`}
                          >
                            {permInfo.label}
                            <ChevronDown className={`w-3 h-3 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>
                          
                          {isDropdownOpen && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />
                              <div className="absolute right-0 bottom-full mb-1 w-48 bg-bg-elevated border border-border rounded-lg shadow-lg z-50 py-1">
                                {PERMISSION_LEVELS.map(level => (
                                  <button
                                    key={level.value}
                                    onClick={() => updatePermissionLevel(tool.id, tool.display_name, level.value)}
                                    className="w-full px-3 py-2 flex items-center gap-2 hover:bg-surface transition-colors text-left"
                                  >
                                    {tool.permission_level === level.value && <Check className="w-3 h-3 text-accent" />}
                                    <span className={`text-sm ${level.color} ${tool.permission_level !== level.value ? 'ml-5' : ''}`}>
                                      {level.label}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTools.map(tool => {
                  const permInfo = getPermissionInfo(tool.permission_level);
                  const isDropdownOpen = openDropdown === tool.id;
                  
                  return (
                    <div
                      key={tool.id}
                      className={`p-3 bg-surface border rounded-lg flex items-center gap-4 transition-colors ${
                        tool.permission_level === 'disabled' ? 'border-red-500/30 bg-red-500/5 opacity-60' : 'border-border hover:border-accent/30'
                      }`}
                    >
                      <span className={`text-2xl ${tool.permission_level === 'disabled' ? 'opacity-50 grayscale' : ''}`}>{tool.icon}</span>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className={`font-medium ${tool.permission_level === 'disabled' ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                            {tool.display_name}
                          </h3>
                          {tool.mcp_server_id && <span className="px-2 py-0.5 text-xs bg-teal-500/20 text-teal-400 rounded">MCP</span>}
                          {tool.is_custom && !tool.mcp_server_id && <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded">Custom</span>}
                        </div>
                        <p className="text-sm text-text-muted truncate">{tool.description}</p>
                      </div>
                      
                      <span className="text-xs text-text-muted whitespace-nowrap">{tool.usage_count} uses</span>
                      
                      <div className="relative">
                        <button
                          onClick={() => setOpenDropdown(isDropdownOpen ? null : tool.id)}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${permInfo.bg} ${permInfo.color}`}
                        >
                          {permInfo.label}
                          <ChevronDown className={`w-3 h-3 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {isDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />
                            <div className="absolute right-0 top-full mt-1 w-48 bg-bg-elevated border border-border rounded-lg shadow-lg z-50 py-1">
                              {PERMISSION_LEVELS.map(level => (
                                <button
                                  key={level.value}
                                  onClick={() => updatePermissionLevel(tool.id, tool.display_name, level.value)}
                                  className="w-full px-3 py-2 flex items-center gap-2 hover:bg-surface transition-colors text-left"
                                >
                                  {tool.permission_level === level.value && <Check className="w-3 h-3 text-accent" />}
                                  <span className={`text-sm ${level.color} ${tool.permission_level !== level.value ? 'ml-5' : ''}`}>
                                    {level.label}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* MCP Servers Tab */
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">MCP Servers</h2>
                <p className="text-sm text-text-muted">
                  Connect external tool servers via Model Context Protocol
                </p>
              </div>
              <button
                onClick={() => setShowAddMcp(true)}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Server
              </button>
            </div>

            {isMcpLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <div key={i} className="h-24 bg-surface animate-pulse rounded-xl" />)}
              </div>
            ) : mcpServers.length === 0 ? (
              <div className="text-center py-12 bg-surface border border-border rounded-xl">
                <Server className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-50" />
                <h3 className="text-lg font-medium text-text-primary mb-2">No MCP Servers</h3>
                <p className="text-text-muted mb-4">
                  Add an MCP server to extend HAL with external tools
                </p>
                <button
                  onClick={() => setShowAddMcp(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Your First Server
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {mcpServers.map(server => (
                  <div
                    key={server.id}
                    className={`p-4 bg-surface border rounded-xl transition-colors ${
                      server.is_enabled ? 'border-border' : 'border-border opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          server.status === 'connected' ? 'bg-green-500/20' :
                          server.status === 'error' ? 'bg-red-500/20' :
                          'bg-surface'
                        }`}>
                          <Server className={`w-5 h-5 ${
                            server.status === 'connected' ? 'text-green-400' :
                            server.status === 'error' ? 'text-red-400' :
                            'text-text-muted'
                          }`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-text-primary">{server.name}</h3>
                            {server.status === 'connected' && (
                              <span className="flex items-center gap-1 text-xs text-green-400">
                                <CheckCircle className="w-3 h-3" /> Connected
                              </span>
                            )}
                            {server.status === 'error' && (
                              <span className="flex items-center gap-1 text-xs text-red-400">
                                <AlertCircle className="w-3 h-3" /> Error
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-text-muted">{server.description || server.url}</p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-text-muted">
                            <span>{server.tools_count} tools</span>
                            <a href={server.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-accent">
                              {server.url} <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => testMcpConnection(server.id)}
                          disabled={testingMcp === server.id}
                          className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
                          title="Test Connection"
                        >
                          {testingMcp === server.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </button>
                        
                        <button
                          onClick={() => toggleMcpServer(server.id, !server.is_enabled)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            server.is_enabled 
                              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                              : 'bg-surface text-text-muted hover:bg-surface-hover'
                          }`}
                        >
                          {server.is_enabled ? 'Enabled' : 'Disabled'}
                        </button>
                        
                        <button
                          onClick={() => deleteMcpServer(server.id)}
                          className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add MCP Server Modal */}
            {showAddMcp && (
              <>
                <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowAddMcp(false)} />
                <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-elevated border border-border rounded-xl shadow-lg z-50 p-6">
                  <h2 className="text-lg font-semibold text-text-primary mb-4">Add MCP Server</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-text-secondary mb-1.5">Name *</label>
                      <input
                        type="text"
                        value={newMcpName}
                        onChange={(e) => setNewMcpName(e.target.value)}
                        placeholder="e.g., Filesystem Tools"
                        className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm text-text-secondary mb-1.5">URL *</label>
                      <input
                        type="text"
                        value={newMcpUrl}
                        onChange={(e) => setNewMcpUrl(e.target.value)}
                        placeholder="http://localhost:3000/mcp"
                        className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary font-mono text-sm"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm text-text-secondary mb-1.5">Description</label>
                      <input
                        type="text"
                        value={newMcpDescription}
                        onChange={(e) => setNewMcpDescription(e.target.value)}
                        placeholder="Optional description"
                        className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary"
                      />
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      onClick={() => setShowAddMcp(false)}
                      className="px-4 py-2 text-text-secondary hover:text-text-primary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={addMcpServer}
                      disabled={!newMcpName.trim() || !newMcpUrl.trim()}
                      className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg"
                    >
                      Add Server
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* MCP Info */}
            <div className="mt-6 p-4 bg-surface border border-border rounded-xl">
              <h3 className="text-sm font-medium text-text-primary mb-2">About MCP Servers</h3>
              <p className="text-sm text-text-muted mb-3">
                Model Context Protocol (MCP) allows HAL to connect to external tool servers. 
                Each server can provide multiple tools that HAL can use in conversations.
              </p>
              <a 
                href="https://modelcontextprotocol.io" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-accent hover:text-accent-hover flex items-center gap-1"
              >
                Learn more about MCP <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
