'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { admin } from '@/lib/api';
import { Shield, Users, Wrench, Bell, Database, Cpu, HardDrive } from 'lucide-react';

interface SystemResources {
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  ollama_status: string;
  mongodb_status: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'admin') {
      router.push('/chat');
      return;
    }
    loadData();
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

  if (user?.role !== 'admin') {
    return null;
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-8 h-8 text-warning" />
          <h1 className="text-2xl font-bold text-text-primary">Admin Dashboard</h1>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-32 bg-surface animate-pulse rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {/* System Status */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
              <div className="p-4 bg-surface border border-border rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <Cpu className="w-5 h-5 text-accent" />
                  <span className="text-text-secondary">CPU</span>
                </div>
                <p className="text-2xl font-bold text-text-primary">
                  {resources?.cpu_percent?.toFixed(1) || '—'}%
                </p>
              </div>
              
              <div className="p-4 bg-surface border border-border rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <HardDrive className="w-5 h-5 text-accent" />
                  <span className="text-text-secondary">Memory</span>
                </div>
                <p className="text-2xl font-bold text-text-primary">
                  {resources?.memory_percent?.toFixed(1) || '—'}%
                </p>
              </div>
              
              <div className="p-4 bg-surface border border-border rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <Database className="w-5 h-5 text-accent" />
                  <span className="text-text-secondary">MongoDB</span>
                </div>
                <p className={`text-lg font-medium ${
                  resources?.mongodb_status === 'connected' ? 'text-success' : 'text-error'
                }`}>
                  {resources?.mongodb_status || 'Unknown'}
                </p>
              </div>
              
              <div className="p-4 bg-surface border border-border rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <Cpu className="w-5 h-5 text-accent" />
                  <span className="text-text-secondary">Ollama</span>
                </div>
                <p className={`text-lg font-medium ${
                  resources?.ollama_status === 'connected' ? 'text-success' : 'text-error'
                }`}>
                  {resources?.ollama_status || 'Unknown'}
                </p>
              </div>
            </div>

            {/* Users */}
            <div className="bg-surface border border-border rounded-xl p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold text-text-primary">Users ({users.length})</h2>
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
