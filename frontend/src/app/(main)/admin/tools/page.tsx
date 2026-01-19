'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { admin } from '@/lib/api';
import { ArrowLeft, Wrench, ToggleLeft, ToggleRight } from 'lucide-react';

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

export default function AdminToolsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const toggleTool = async (toolId: string, currentEnabled: boolean) => {
    try {
      await admin.tools.update(toolId, { default_enabled: !currentEnabled });
      loadTools();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tool');
    }
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
            {tools.map(tool => (
              <div
                key={tool.id}
                className="p-4 bg-surface border border-border rounded-xl"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{tool.icon}</span>
                    <div>
                      <h3 className="font-medium text-text-primary">{tool.display_name}</h3>
                      <p className="text-sm text-text-muted">{tool.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
                        <span>Used {tool.usage_count} times</span>
                        <span className="px-2 py-0.5 bg-bg-tertiary rounded">
                          {tool.permission_level}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleTool(tool.id, tool.default_enabled)}
                    className={`p-2 rounded-lg transition-colors ${
                      tool.default_enabled
                        ? 'text-success hover:bg-success/10'
                        : 'text-text-muted hover:bg-surface-hover'
                    }`}
                  >
                    {tool.default_enabled ? (
                      <ToggleRight className="w-8 h-8" />
                    ) : (
                      <ToggleLeft className="w-8 h-8" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
