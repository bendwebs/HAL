'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { chats as chatsApi } from '@/lib/api';
import { useUIStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import {
  Search,
  MessageSquare,
  Plus,
  Mic,
  ImageIcon,
  FolderOpen,
  Brain,
  Users,
  Settings,
  Shield,
  Youtube,
  Trash2,
  Moon,
  ArrowRight,
  Command,
} from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  category: 'navigation' | 'action' | 'chat';
  keywords?: string[];
}

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentChats, setRecentChats] = useState<{ id: string; title: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user } = useAuthStore();
  const { toggleSidebar, setSidebarOpen } = useUIStore();

  const isAdmin = user?.role === 'admin';

  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Load recent chats
      chatsApi.list().then(chats => {
        setRecentChats(chats.slice(0, 5).map((c: any) => ({ id: c.id, title: c.title })));
      }).catch(() => {});
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  const executeAction = useCallback((action: () => void) => {
    close();
    action();
  }, [close]);

  const commands = useMemo((): CommandItem[] => {
    const items: CommandItem[] = [
      // Actions
      {
        id: 'new-chat',
        label: 'New Chat',
        description: 'Start a new conversation',
        icon: <Plus className="w-4 h-4" />,
        action: async () => {
          try {
            const chat = await chatsApi.create({ title: 'New Chat' });
            router.push(`/chat/${chat.id}`);
            useUIStore.getState().refreshChatList();
          } catch {}
        },
        category: 'action',
        keywords: ['create', 'start', 'new', 'conversation'],
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        description: 'Show or hide the sidebar',
        icon: <ArrowRight className="w-4 h-4" />,
        action: () => toggleSidebar(),
        category: 'action',
        keywords: ['sidebar', 'menu', 'panel', 'toggle'],
      },
      // Navigation
      {
        id: 'nav-chats',
        label: 'Chats',
        description: 'View all chats',
        icon: <MessageSquare className="w-4 h-4" />,
        action: () => router.push('/chat'),
        category: 'navigation',
        keywords: ['messages', 'conversations', 'chat list'],
      },
      {
        id: 'nav-converse',
        label: 'Converse',
        description: 'Voice conversation',
        icon: <Mic className="w-4 h-4" />,
        action: () => router.push('/converse'),
        category: 'navigation',
        keywords: ['voice', 'talk', 'speak', 'audio'],
      },
      {
        id: 'nav-generate',
        label: 'Generate',
        description: 'Image generation',
        icon: <ImageIcon className="w-4 h-4" />,
        action: () => router.push('/generate'),
        category: 'navigation',
        keywords: ['image', 'create', 'art', 'picture'],
      },
      {
        id: 'nav-video',
        label: 'Video',
        description: 'Video features',
        icon: <Youtube className="w-4 h-4" />,
        action: () => router.push('/video'),
        category: 'navigation',
        keywords: ['youtube', 'watch', 'video'],
      },
      {
        id: 'nav-library',
        label: 'Library',
        description: 'Document library',
        icon: <FolderOpen className="w-4 h-4" />,
        action: () => router.push('/library'),
        category: 'navigation',
        keywords: ['documents', 'files', 'uploads', 'library'],
      },
      {
        id: 'nav-memories',
        label: 'Memories',
        description: 'Manage memories',
        icon: <Brain className="w-4 h-4" />,
        action: () => router.push('/memories'),
        category: 'navigation',
        keywords: ['memory', 'remember', 'knowledge'],
      },
      {
        id: 'nav-personas',
        label: 'Personas',
        description: 'AI personality settings',
        icon: <Users className="w-4 h-4" />,
        action: () => router.push('/personas'),
        category: 'navigation',
        keywords: ['persona', 'personality', 'character', 'assistant'],
      },
      {
        id: 'nav-settings',
        label: 'Settings',
        description: 'User settings',
        icon: <Settings className="w-4 h-4" />,
        action: () => router.push('/settings'),
        category: 'navigation',
        keywords: ['preferences', 'config', 'options'],
      },
      {
        id: 'nav-recycle',
        label: 'Recycle Bin',
        description: 'Deleted chats',
        icon: <Trash2 className="w-4 h-4" />,
        action: () => router.push('/recycle-bin'),
        category: 'navigation',
        keywords: ['trash', 'deleted', 'restore'],
      },
    ];

    if (isAdmin) {
      items.push({
        id: 'nav-admin',
        label: 'Admin Panel',
        description: 'System administration',
        icon: <Shield className="w-4 h-4" />,
        action: () => router.push('/admin'),
        category: 'navigation',
        keywords: ['admin', 'system', 'manage', 'dashboard'],
      });
    }

    // Add recent chats
    recentChats.forEach(chat => {
      items.push({
        id: `chat-${chat.id}`,
        label: chat.title,
        icon: <MessageSquare className="w-4 h-4" />,
        action: () => router.push(`/chat/${chat.id}`),
        category: 'chat',
      });
    });

    return items;
  }, [isAdmin, recentChats, router, toggleSidebar]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd => {
      if (cmd.label.toLowerCase().includes(q)) return true;
      if (cmd.description?.toLowerCase().includes(q)) return true;
      if (cmd.keywords?.some(k => k.includes(q))) return true;
      return false;
    });
  }, [commands, query]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filteredCommands.forEach(cmd => {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  const categoryLabels: Record<string, string> = {
    action: 'Actions',
    navigation: 'Navigation',
    chat: 'Recent Chats',
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filteredCommands[selectedIndex]) {
        e.preventDefault();
        executeAction(filteredCommands[selectedIndex].action);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, executeAction]);

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector('[data-selected="true"]');
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  let flatIndex = -1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] animate-fade-in"
        onClick={close}
      />

      {/* Palette */}
      <div className="fixed inset-x-0 top-[15%] z-[101] flex justify-center px-4 animate-fade-in">
        <div className="w-full max-w-lg bg-bg-elevated border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="w-5 h-5 text-text-muted flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search commands, pages, chats..."
              className="flex-1 bg-transparent text-text-primary placeholder-text-muted outline-none text-sm"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs text-text-muted bg-surface rounded border border-border">
              esc
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
            {filteredCommands.length === 0 ? (
              <div className="px-4 py-8 text-center text-text-muted text-sm">
                No results found
              </div>
            ) : (
              Object.entries(categoryLabels).map(([category, label]) => {
                const items = grouped[category];
                if (!items?.length) return null;

                return (
                  <div key={category}>
                    <div className="px-4 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wider">
                      {label}
                    </div>
                    {items.map(cmd => {
                      flatIndex++;
                      const isSelected = flatIndex === selectedIndex;
                      const idx = flatIndex;
                      return (
                        <button
                          key={cmd.id}
                          data-selected={isSelected}
                          onClick={() => executeAction(cmd.action)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            isSelected
                              ? 'bg-accent/10 text-accent'
                              : 'text-text-primary hover:bg-surface'
                          }`}
                        >
                          <span className={isSelected ? 'text-accent' : 'text-text-muted'}>
                            {cmd.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm truncate block">{cmd.label}</span>
                            {cmd.description && (
                              <span className="text-xs text-text-muted truncate block">
                                {cmd.description}
                              </span>
                            )}
                          </div>
                          {isSelected && (
                            <ArrowRight className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-surface rounded border border-border">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-surface rounded border border-border">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-surface rounded border border-border">esc</kbd>
              close
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
