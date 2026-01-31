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
  X
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
];

export default function AdminToolsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPermission, setSelectedPermission] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);

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
      const data = await admin.tools.list();
      setTools(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tools');
    } finally {
      setIsLoading(false);
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
      
      // Category filter
      if (selectedCategory === 'builtin' && tool.is_custom) return false;
      if (selectedCategory === 'custom' && !tool.is_custom) return false;
      
      // Permission filter
      if (selectedPermission && tool.permission_level !== selectedPermission) return false;
      
      return true;
    });
  }, [tools, searchQuery, selectedCategory, selectedPermission]);

  const toolStats = useMemo(() => {
    const total = tools.length;
    const custom = tools.filter(t => t.is_custom).length;
    const builtin = total - custom;
    const disabled = tools.filter(t => t.permission_level === 'disabled').length;
    const active = total - disabled;
    return { total, custom, builtin, disabled, active };
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

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedPermission(null);
  };

  const hasActiveFilters = searchQuery || selectedCategory !== 'all' || selectedPermission;

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
                  {toolStats.total} tools ({toolStats.builtin} built-in, {toolStats.custom} custom)
                </p>
              </div>
            </div>
          </div>
          
          {/* View Toggle */}
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
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="p-3 bg-surface border border-border rounded-lg">
            <p className="text-2xl font-bold text-text-primary">{toolStats.active}</p>
            <p className="text-sm text-text-muted">Active Tools</p>
          </div>
          <div className="p-3 bg-surface border border-border rounded-lg">
            <p className="text-2xl font-bold text-red-400">{toolStats.disabled}</p>
            <p className="text-sm text-text-muted">Disabled</p>
          </div>
          <div className="p-3 bg-surface border border-border rounded-lg">
            <p className="text-2xl font-bold text-blue-400">{toolStats.builtin}</p>
            <p className="text-sm text-text-muted">Built-in</p>
          </div>
          <div className="p-3 bg-surface border border-border rounded-lg">
            <p className="text-2xl font-bold text-purple-400">{toolStats.custom}</p>
            <p className="text-sm text-text-muted">Custom</p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools..."
              className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted"
            />
          </div>
          
          {/* Category Filter */}
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
          
          {/* More Filters */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              showFilters || selectedPermission ? 'bg-accent text-white' : 'bg-surface hover:bg-surface-hover'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
          </button>
          
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mb-6 p-4 bg-surface border border-border rounded-lg">
            <p className="text-sm font-medium text-text-secondary mb-3">Filter by Permission Level</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedPermission(null)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  !selectedPermission ? 'bg-accent text-white' : 'bg-bg-tertiary hover:bg-surface-hover'
                }`}
              >
                All
              </button>
              {PERMISSION_LEVELS.map(level => (
                <button
                  key={level.value}
                  onClick={() => setSelectedPermission(level.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    selectedPermission === level.value
                      ? `${level.bg} ${level.color}`
                      : 'bg-bg-tertiary hover:bg-surface-hover'
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg text-error">
            {error}
          </div>
        )}

        {/* Results Count */}
        {!isLoading && (
          <p className="text-sm text-text-muted mb-4">
            Showing {filteredTools.length} of {tools.length} tools
          </p>
        )}

        {isLoading ? (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className={`bg-surface animate-pulse rounded-xl ${viewMode === 'grid' ? 'h-40' : 'h-20'}`} />
            ))}
          </div>
        ) : filteredTools.length === 0 ? (
          <div className="text-center py-12">
            <Wrench className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-50" />
            <p className="text-text-muted">No tools found matching your filters</p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-2 text-accent hover:text-accent-hover"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
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
                    {tool.is_custom && (
                      <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded">
                        Custom
                      </span>
                    )}
                  </div>
                  
                  <h3 className={`font-medium mb-1 ${
                    tool.permission_level === 'disabled' 
                      ? 'text-text-muted line-through' 
                      : 'text-text-primary'
                  }`}>
                    {tool.display_name}
                  </h3>
                  
                  <p className="text-sm text-text-muted mb-3 line-clamp-2">
                    {tool.description}
                  </p>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-muted">
                      {tool.usage_count} uses
                    </span>
                    
                    {/* Permission Dropdown */}
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
                                {tool.permission_level === level.value && (
                                  <Check className="w-3 h-3 text-accent" />
                                )}
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
          /* List View */
          <div className="space-y-2">
            {filteredTools.map(tool => {
              const permInfo = getPermissionInfo(tool.permission_level);
              const isDropdownOpen = openDropdown === tool.id;
              
              return (
                <div
                  key={tool.id}
                  className={`p-3 bg-surface border rounded-lg flex items-center gap-4 transition-colors ${
                    tool.permission_level === 'disabled' 
                      ? 'border-red-500/30 bg-red-500/5 opacity-60' 
                      : 'border-border hover:border-accent/30'
                  }`}
                >
                  <span className={`text-2xl ${tool.permission_level === 'disabled' ? 'opacity-50 grayscale' : ''}`}>
                    {tool.icon}
                  </span>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-medium ${
                        tool.permission_level === 'disabled' 
                          ? 'text-text-muted line-through' 
                          : 'text-text-primary'
                      }`}>
                        {tool.display_name}
                      </h3>
                      {tool.is_custom && (
                        <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-muted truncate">{tool.description}</p>
                  </div>
                  
                  <span className="text-xs text-text-muted whitespace-nowrap">
                    {tool.usage_count} uses
                  </span>
                  
                  {/* Permission Dropdown */}
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
                              {tool.permission_level === level.value && (
                                <Check className="w-3 h-3 text-accent" />
                              )}
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
        
        {/* Legend - Collapsed by default */}
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-text-muted hover:text-text-primary">
            Permission Levels Reference
          </summary>
          <div className="mt-3 p-4 bg-surface border border-border rounded-xl">
            <div className="grid gap-2">
              {PERMISSION_LEVELS.map(level => (
                <div key={level.value} className="flex items-center gap-3">
                  <span className={`text-sm font-medium w-24 ${level.color}`}>{level.label}</span>
                  <span className="text-sm text-text-muted">{level.description}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
