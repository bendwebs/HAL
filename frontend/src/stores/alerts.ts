import { create } from 'zustand';
import { Alert } from '@/types';
import { alerts as alertsApi } from '@/lib/api';

interface AlertState {
  alerts: Alert[];
  unreadCount: number;
  isLoading: boolean;
  
  fetchAlerts: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  addLocalAlert: (alert: Omit<Alert, 'id' | 'created_at' | 'is_read'>) => void;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  unreadCount: 0,
  isLoading: false,
  
  fetchAlerts: async () => {
    set({ isLoading: true });
    try {
      const response = await alertsApi.list();
      set({
        alerts: response.alerts,
        unreadCount: response.unread_count,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },
  
  markRead: async (id: string) => {
    try {
      await alertsApi.markRead(id);
      const { alerts } = get();
      set({
        alerts: alerts.map((a) =>
          a.id === id ? { ...a, is_read: true } : a
        ),
        unreadCount: Math.max(0, get().unreadCount - 1),
      });
    } catch {}
  },
  
  markAllRead: async () => {
    try {
      await alertsApi.markAllRead();
      const { alerts } = get();
      set({
        alerts: alerts.map((a) => ({ ...a, is_read: true })),
        unreadCount: 0,
      });
    } catch {}
  },
  
  addLocalAlert: (alert) => {
    const newAlert: Alert = {
      id: `local-${Date.now()}`,
      ...alert,
      is_read: false,
      created_at: new Date().toISOString(),
      expires_at: null,
    };
    set((state) => ({
      alerts: [newAlert, ...state.alerts],
      unreadCount: state.unreadCount + 1,
    }));
  },
}));
