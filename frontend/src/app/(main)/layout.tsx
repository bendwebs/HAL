'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { useAlertStore } from '@/stores/alerts';
import { chats as chatsApi } from '@/lib/api';
import Sidebar from '@/components/shared/Sidebar';
import MobileNav from '@/components/shared/MobileNav';
import AlertsDropdown from '@/components/shared/AlertsDropdown';
import { Menu, Bell, Settings, LogOut } from 'lucide-react';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, fetchUser, logout, isLoading } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { unreadCount, fetchAlerts } = useAlertStore();
  const [showAlerts, setShowAlerts] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const warmupTriggered = useRef(false);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAlerts();
      
      // Warm up the AI model in the background for faster first response
      if (!warmupTriggered.current) {
        warmupTriggered.current = true;
        chatsApi.warmup().catch(() => {
          // Silently ignore warmup failures
        });
      }
    }
  }, [isAuthenticated, fetchAlerts]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">🤖</div>
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="h-screen bg-bg-primary flex overflow-hidden">
      {/* Desktop Sidebar */}
      <div className={`hidden md:block transition-all duration-300 overflow-hidden ${sidebarOpen ? 'w-64' : 'w-0'}`}>
        <div className="w-64">
          <Sidebar />
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => toggleSidebar()}
        />
      )}

      {/* Mobile Sidebar */}
      <div className={`md:hidden fixed left-0 top-0 h-full z-50 transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <Sidebar />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 border-b border-border bg-bg-secondary flex items-center px-4 gap-4">
          <button
            onClick={toggleSidebar}
            className="p-2 hover:bg-surface rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5 text-text-secondary" />
          </button>

          <div className="flex-1" />

          {/* Alerts */}
          <div className="relative">
            <button
              onClick={() => setShowAlerts(!showAlerts)}
              className="p-2 hover:bg-surface rounded-lg transition-colors relative"
            >
              <Bell className="w-5 h-5 text-text-secondary" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-error rounded-full text-xs text-white flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showAlerts && (
              <AlertsDropdown onClose={() => setShowAlerts(false)} />
            )}
          </div>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-2 hover:bg-surface rounded-lg transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                <span className="text-sm font-medium text-accent">
                  {user?.display_name?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <span className="hidden sm:block text-sm text-text-primary">
                {user?.display_name}
              </span>
            </button>

            {showUserMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-48 bg-bg-elevated border border-border rounded-lg shadow-lg z-50 py-1">
                  <div className="px-4 py-2 border-b border-border">
                    <p className="text-sm font-medium text-text-primary">{user?.display_name}</p>
                    <p className="text-xs text-text-muted">@{user?.username}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      router.push('/settings');
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-text-secondary hover:bg-surface flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left text-sm text-error hover:bg-surface flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-hidden pb-16 md:pb-0">
          {children}
        </main>

        {/* Mobile Bottom Nav */}
        <MobileNav />
      </div>
    </div>
  );
}
