'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { admin } from '@/lib/api';
import { ArrowLeft, Wrench, ChevronDown, Check } from 'lucide-react';
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
}

const PERMISSION_LEVELS = [
  { value: 'disabled', label: 'Disabled', description: 'Tool is completely unavailable to all users', color: 'text-error' },
  { value: 'admin_only', label: 'Admin Only', description: 'Only admins can use this tool', color: 'text-amber-400' },
  { value: 'opt_in', label: 'Opt-In', description: 'Disabled by default, users can enable', color: 'text-blue-400' },
  { value: 'user_toggle', label: 'User Toggle', description: 'Enabled by default, users can disable', color: 'text-success' },
  { value: 'always_on', label: 'Always On', description: 'Always enabled, users cannot disable', color: 'text-purple-400' },
];

export default function AdminToolsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

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
    return PERMISSION_LEVELS.find(p => p.value === level) || PERMISSION_LEVELS[3]; // default to user_toggle
  };

  if (user?.role !== 'admin') return null;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.push('/admin')}
          className="flex items-center gap-2 text-text-muted hover:text-text-primary mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Admin
        </button>

        <div className="flex items-center gap-3 mb-6">
          <Wrench className="w-8 h-8 text-accent" />
          <h1 className="text-2xl font-bold text-text-primary">Tool Management</h1>
        </div>
        
        <p className="text-text-muted mb-6">
          Control which tools are available to users. <span className="text-error font-medium">Disabled</span> tools 
          are completely hidden and cannot be used by anyone.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg text-error">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-surface animate-pulse rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {tools.map(tool => {
              const permInfo = getPermissionInfo(tool.permission_level);
              const isDropdownOpen = openDropdown === tool.id;
              
              return (
                <div
                  key={tool.id}
                  className={`p-4 bg-surface border rounded-xl transition-colors ${
                    tool.permission_level === 'disabled' 
                      ? 'border-error/30 bg-error/5' 
                      : 'border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`text-2xl ${tool.permission_level === 'disabled' ? 'opacity-50' : ''}`}>
                        {tool.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-medium ${
                          tool.permission_level === 'disabled' 
                            ? 'text-text-muted line-through' 
                            : 'text-text-primary'
                        }`}>
                          {tool.display_name}
                        </h3>
                        <p className="text-sm text-text-muted truncate">{tool.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
                          <span>Used {tool.usage_count} times</span>
                          {tool.last_used && (
                            <span>Last: {new Date(tool.last_used).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Permission Level Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setOpenDropdown(isDropdownOpen ? null : tool.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                          tool.permission_level === 'disabled'
                            ? 'border-error/50 bg-error/10 text-error'
                            : 'border-border bg-bg-tertiary hover:bg-surface-hover'
                        }`}
                      >
                        <span className={`text-sm font-medium ${permInfo.color}`}>
                          {permInfo.label}
                        </span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      
                      {isDropdownOpen && (
                        <>
                          <div 
                            className="fixed inset-0 z-40"
                            onClick={() => setOpenDropdown(null)}
                          />
                          <div className="absolute right-0 top-full mt-1 w-64 bg-bg-elevated border border-border rounded-lg shadow-lg z-50 py-1">
                            {PERMISSION_LEVELS.map(level => (
                              <button
                                key={level.value}
                                onClick={() => updatePermissionLevel(tool.id, tool.display_name, level.value)}
                                className="w-full px-3 py-2 flex items-start gap-3 hover:bg-surface transition-colors text-left"
                              >
                                <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center mt-0.5 ${
                                  tool.permission_level === level.value 
                                    ? 'bg-accent text-white' 
                                    : 'bg-surface border border-border'
                                }`}>
                                  {tool.permission_level === level.value && <Check className="w-3 h-3" />}
                                </div>
                                <div>
                                  <p className={`text-sm font-medium ${level.color}`}>{level.label}</p>
                                  <p className="text-xs text-text-muted">{level.description}</p>
                                </div>
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
        )}
        
        {/* Legend */}
        <div className="mt-8 p-4 bg-surface border border-border rounded-xl">
          <h3 className="font-medium text-text-primary mb-3">Permission Levels</h3>
          <div className="grid gap-2">
            {PERMISSION_LEVELS.map(level => (
              <div key={level.value} className="flex items-center gap-3">
                <span className={`text-sm font-medium w-24 ${level.color}`}>{level.label}</span>
                <span className="text-sm text-text-muted">{level.description}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
