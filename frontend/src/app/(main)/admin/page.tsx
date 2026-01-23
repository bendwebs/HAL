'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { admin } from '@/lib/api';
import { 
  Shield, 
  Users, 
  Wrench, 
  Bell, 
  Database, 
  Cpu, 
  HardDrive,
  Gpu,
  Thermometer,
  RefreshCw,
  Mic
} from 'lucide-react';

interface GpuInfo {
  name: string;
  load_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_percent: number;
  temperature: number;
}

interface SystemResources {
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  ollama_status: string;
  mongodb_status: string;
  gpu?: GpuInfo;
}

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (user?.role !== 'admin') {
      router.push('/chat');
      return;
    }
    loadData();
    
    // Auto-refresh resources every 10 seconds
    const interval = setInterval(() => {
      refreshResources();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [user, router]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [resourcesData, usersData] = await Promise.all([
        admin.resources().catch(() => null),
        admin.users.list().catch(() => []),
      ]);
      setResources(resourcesData);
      setUsers(usersData);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshResources = async () => {
    try {
      setIsRefreshing(true);
      const resourcesData = await admin.resources().catch(() => null);
      if (resourcesData) {
        setResources(resourcesData);
      }
    } catch (err) {
      console.error('Failed to refresh resources:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (user?.role !== 'admin') {
    return null;
  }

  const formatMemory = (mb: number) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb.toFixed(0)} MB`;
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'text-error';
    if (percent >= 70) return 'text-warning';
    return 'text-success';
  };

  const getUsageBarColor = (percent: number) => {
    if (percent >= 90) return 'bg-error';
    if (percent >= 70) return 'bg-warning';
    return 'bg-success';
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-warning" />
            <h1 className="text-2xl font-bold text-text-primary">Admin Dashboard</h1>
          </div>
          <button
            onClick={refreshResources}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary border border-border rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-32 bg-surface animate-pulse rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {/* System Status - Row 1: CPU, Memory, Services */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
              {/* CPU */}
              <div className="p-4 bg-surface border border-border rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <Cpu className="w-5 h-5 text-accent" />
                  <span className="text-text-secondary">CPU</span>
                </div>
                <p className={`text-2xl font-bold ${getUsageColor(resources?.cpu_percent || 0)}`}>
                  {resources?.cpu_percent?.toFixed(1) || '—'}%
                </p>
                <div className="mt-2 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getUsageBarColor(resources?.cpu_percent || 0)} transition-all`}
                    style={{ width: `${resources?.cpu_percent || 0}%` }}
                  />
                </div>
              </div>
              
              {/* Memory */}
              <div className="p-4 bg-surface border border-border rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <HardDrive className="w-5 h-5 text-accent" />
                  <span className="text-text-secondary">Memory</span>
                </div>
                <p className={`text-2xl font-bold ${getUsageColor(resources?.memory_percent || 0)}`}>
                  {resources?.memory_percent?.toFixed(1) || '—'}%
                </p>
                <div className="mt-2 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getUsageBarColor(resources?.memory_percent || 0)} transition-all`}
                    style={{ width: `${resources?.memory_percent || 0}%` }}
                  />
                </div>
              </div>
              
              {/* MongoDB */}
              <div className="p-4 bg-surface border border-border rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <Database className="w-5 h-5 text-accent" />
                  <span className="text-text-secondary">MongoDB</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    resources?.mongodb_status === 'connected' ? 'bg-success' : 'bg-error'
                  }`} />
                  <p className={`text-lg font-medium ${
                    resources?.mongodb_status === 'connected' ? 'text-success' : 'text-error'
                  }`}>
                    {resources?.mongodb_status === 'connected' ? 'Connected' : 'Disconnected'}
                  </p>
                </div>
              </div>
              
              {/* Ollama */}
              <div className="p-4 bg-surface border border-border rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <Cpu className="w-5 h-5 text-accent" />
                  <span className="text-text-secondary">Ollama</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    resources?.ollama_status === 'connected' ? 'bg-success' : 'bg-error'
                  }`} />
                  <p className={`text-lg font-medium ${
                    resources?.ollama_status === 'connected' ? 'text-success' : 'text-error'
                  }`}>
                    {resources?.ollama_status === 'connected' ? 'Connected' : 'Disconnected'}
                  </p>
                </div>
              </div>
            </div>

            {/* GPU Section */}
            {resources?.gpu ? (
              <div className="mb-6 p-4 bg-surface border border-border rounded-xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-accent/10 rounded-lg">
                    <Cpu className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">GPU</h3>
                    <p className="text-sm text-text-muted">{resources.gpu.name}</p>
                  </div>
                </div>
                
                <div className="grid gap-4 md:grid-cols-3">
                  {/* GPU Load */}
                  <div className="p-3 bg-bg-tertiary rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-text-secondary">GPU Load</span>
                      <span className={`text-lg font-bold ${getUsageColor(resources.gpu.load_percent)}`}>
                        {resources.gpu.load_percent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${getUsageBarColor(resources.gpu.load_percent)} transition-all`}
                        style={{ width: `${resources.gpu.load_percent}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* VRAM */}
                  <div className="p-3 bg-bg-tertiary rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-text-secondary">VRAM</span>
                      <span className={`text-lg font-bold ${getUsageColor(resources.gpu.memory_percent)}`}>
                        {resources.gpu.memory_percent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${getUsageBarColor(resources.gpu.memory_percent)} transition-all`}
                        style={{ width: `${resources.gpu.memory_percent}%` }}
                      />
                    </div>
                    <p className="text-xs text-text-muted mt-1">
                      {formatMemory(resources.gpu.memory_used_mb)} / {formatMemory(resources.gpu.memory_total_mb)}
                    </p>
                  </div>
                  
                  {/* Temperature */}
                  <div className="p-3 bg-bg-tertiary rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-text-secondary flex items-center gap-1">
                        <Thermometer className="w-4 h-4" />
                        Temperature
                      </span>
                      <span className={`text-lg font-bold ${
                        resources.gpu.temperature >= 80 ? 'text-error' :
                        resources.gpu.temperature >= 70 ? 'text-warning' :
                        'text-success'
                      }`}>
                        {resources.gpu.temperature}°C
                      </span>
                    </div>
                    <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all ${
                          resources.gpu.temperature >= 80 ? 'bg-error' :
                          resources.gpu.temperature >= 70 ? 'bg-warning' :
                          'bg-success'
                        }`}
                        style={{ width: `${Math.min(100, (resources.gpu.temperature / 100) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-6 p-4 bg-surface border border-border rounded-xl">
                <div className="flex items-center gap-3 text-text-muted">
                  <Cpu className="w-5 h-5" />
                  <span>No GPU detected or GPUtil not installed</span>
                </div>
              </div>
            )}

            {/* Users */}
            <div className="bg-surface border border-border rounded-xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-accent" />
                  <h2 className="text-lg font-semibold text-text-primary">Users ({users.length})</h2>
                </div>
                <button
                  onClick={() => router.push('/admin/users')}
                  className="text-sm text-accent hover:underline"
                >
                  Manage →
                </button>
              </div>
              
              {users.length === 0 ? (
                <p className="text-text-muted">No users found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-text-muted text-sm border-b border-border">
                        <th className="pb-3 font-medium">Username</th>
                        <th className="pb-3 font-medium">Display Name</th>
                        <th className="pb-3 font-medium">Role</th>
                        <th className="pb-3 font-medium">Storage</th>
                        <th className="pb-3 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id} className="border-b border-border/50 last:border-0">
                          <td className="py-3 text-text-primary">{u.username}</td>
                          <td className="py-3 text-text-secondary">{u.display_name}</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              u.role === 'admin' 
                                ? 'bg-warning/10 text-warning' 
                                : 'bg-accent/10 text-accent'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 text-text-muted">
                            {((u.storage_used || 0) / 1024 / 1024).toFixed(1)} MB
                          </td>
                          <td className="py-3 text-text-muted text-sm">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-surface border border-border rounded-xl p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Actions</h2>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => router.push('/admin/users')}
                  className="flex items-center gap-2 px-4 py-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent rounded-lg transition-colors"
                >
                  <Users className="w-4 h-4" />
                  Manage Users
                </button>
                <button
                  onClick={() => router.push('/admin/voices')}
                  className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary hover:bg-surface-hover border border-border rounded-lg transition-colors"
                >
                  <Mic className="w-4 h-4" />
                  Manage Voices
                </button>
                <button
                  onClick={() => router.push('/admin/tools')}
                  className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary hover:bg-surface-hover border border-border rounded-lg transition-colors"
                >
                  <Wrench className="w-4 h-4" />
                  Manage Tools
                </button>
                <button
                  onClick={() => router.push('/admin/alerts')}
                  className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary hover:bg-surface-hover border border-border rounded-lg transition-colors"
                >
                  <Bell className="w-4 h-4" />
                  System Alerts
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
