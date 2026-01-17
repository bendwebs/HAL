'use client';

import { useAlertStore } from '@/stores/alerts';
import { formatRelativeTime } from '@/lib/utils';
import { X, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';

const alertIcons = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
};

const alertColors = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
};

export default function AlertsDropdown({ onClose }: { onClose: () => void }) {
  const { alerts, markRead, markAllRead } = useAlertStore();

  const handleAlertClick = async (alertId: string, isRead: boolean) => {
    if (!isRead) {
      await markRead(alertId);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 w-80 bg-bg-elevated border border-border rounded-lg shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-medium text-text-primary">Notifications</h3>
          <button
            onClick={() => markAllRead()}
            className="text-xs text-accent hover:underline"
          >
            Mark all read
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="p-4 text-center text-text-muted text-sm">
              No notifications
            </div>
          ) : (
            alerts.map(alert => {
              const Icon = alertIcons[alert.alert_type] || Info;
              const colorClass = alertColors[alert.alert_type] || 'text-info';
              
              return (
                <div
                  key={alert.id}
                  onClick={() => handleAlertClick(alert.id, alert.is_read)}
                  className={`px-4 py-3 border-b border-border hover:bg-surface cursor-pointer transition-colors ${
                    !alert.is_read ? 'bg-surface/50' : ''
                  }`}
                >
                  <div className="flex gap-3">
                    <Icon className={`w-5 h-5 flex-shrink-0 ${colorClass}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary">{alert.title}</p>
                      <p className="text-sm text-text-secondary mt-0.5">{alert.message}</p>
                      <p className="text-xs text-text-muted mt-1">
                        {formatRelativeTime(alert.created_at)}
                      </p>
                    </div>
                    {!alert.is_read && (
                      <div className="w-2 h-2 bg-accent rounded-full flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
