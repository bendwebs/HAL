'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { alerts as alertsApi, admin } from '@/lib/api';
import { ArrowLeft, Bell, Plus, Trash2, AlertCircle, Info, AlertTriangle } from 'lucide-react';

interface Alert {
  id: string;
  title: string;
  message: string;
  alert_type: 'info' | 'warning' | 'error';
  created_at: string;
  expires_at: string | null;
}

export default function AdminAlertsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newAlert, setNewAlert] = useState({
    title: '',
    message: '',
    alert_type: 'info' as const
  });

  useEffect(() => {
    if (user?.role !== 'admin') {
      router.push('/chat');
      return;
    }
    loadAlerts();
  }, [user, router]);

  const loadAlerts = async () => {
    try {
      setIsLoading(true);
      const data = await alertsApi.list();
      setAlerts(data.alerts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts');
    } finally {
      setIsLoading(false);
    }
  };

  const createAlert = async () => {
    try {
      await admin.alerts.create(newAlert);
      setShowCreate(false);
      setNewAlert({ title: '', message: '', alert_type: 'info' });
      loadAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create alert');
    }
  };

  const deleteAlert = async (alertId: string) => {
    try {
      await admin.alerts.delete(alertId);
      loadAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete alert');
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'error': return <AlertCircle className="w-5 h-5 text-error" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-warning" />;
      default: return <Info className="w-5 h-5 text-accent" />;
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

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Bell className="w-8 h-8 text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">System Alerts</h1>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Alert
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg text-error">
            {error}
          </div>
        )}

        {showCreate && (
          <div className="mb-6 p-4 bg-surface border border-border rounded-xl">
            <h3 className="font-medium text-text-primary mb-4">Create New Alert</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Alert title"
                value={newAlert.title}
                onChange={e => setNewAlert({ ...newAlert, title: e.target.value })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-text-primary"
              />
              <textarea
                placeholder="Alert message"
                value={newAlert.message}
                onChange={e => setNewAlert({ ...newAlert, message: e.target.value })}
                className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-text-primary resize-none"
                rows={3}
              />
              <select
                value={newAlert.alert_type}
                onChange={e => setNewAlert({ ...newAlert, alert_type: e.target.value as any })}
                className="px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-text-primary"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
              <div className="flex gap-2">
                <button
                  onClick={createAlert}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 bg-bg-tertiary hover:bg-surface-hover border border-border rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-surface animate-pulse rounded-xl" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No system alerts</p>
          </div>
        ) : (
          <div className="space-y-4">
            {alerts.map(alert => (
              <div
                key={alert.id}
                className="p-4 bg-surface border border-border rounded-xl"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {getAlertIcon(alert.alert_type)}
                    <div>
                      <h3 className="font-medium text-text-primary">{alert.title}</h3>
                      <p className="text-sm text-text-muted mt-1">{alert.message}</p>
                      <p className="text-xs text-text-muted mt-2">
                        Created: {new Date(alert.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteAlert(alert.id)}
                    className="p-2 text-text-muted hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
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
