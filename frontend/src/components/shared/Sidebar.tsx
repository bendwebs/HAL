'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { chats as chatsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { 
  MessageSquare, 
  FolderOpen, 
  Brain, 
  Users, 
  Settings,
  Plus,
  X,
  Shield,
  Mic,
  ImageIcon,
  Pin,
  PinOff,
  MoreVertical,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { ChatListItem } from '@/types';
import toast from 'react-hot-toast';

const navItems = [
  { href: '/chat', icon: MessageSquare, label: 'Chats' },
  { href: '/converse', icon: Mic, label: 'Converse' },
  { href: '/generate', icon: ImageIcon, label: 'Generate' },
  { href: '/library', icon: FolderOpen, label: 'Library' },
  { href: '/memories', icon: Brain, label: 'Memories' },
  { href: '/personas', icon: Users, label: 'Personas' },
  { href: '/settings', icon: Settings, label: 'Settings' },
  { href: '/recycle-bin', icon: Trash2, label: 'Recycle Bin' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const chatListVersion = useUIStore((state) => state.chatListVersion);
  const [chatList, setChatList] = useState<ChatListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ chatId: string; x: number; y: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ chatId: string; title: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === 'admin';

  const loadChats = async () => {
    try {
      const data = await chatsApi.list();
      setChatList(data || []);
    } catch (err) {
      console.error('Failed to load chats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadChats();
  }, [chatListVersion]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const createNewChat = async () => {
    try {
      const chat = await chatsApi.create({ title: 'New Chat' });
      setChatList([chat, ...chatList]);
      router.push(`/chat/${chat.id}`);
      setSidebarOpen(false);
    } catch (err) {
      console.error('Failed to create chat:', err);
    }
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  const handleContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    setContextMenu({ chatId, x: e.clientX, y: e.clientY });
  };

  const togglePin = async (chatId: string) => {
    const chat = chatList.find(c => c.id === chatId);
    if (!chat) return;
    
    try {
      await chatsApi.update(chatId, { is_pinned: !chat.is_pinned });
      setChatList(prev => {
        const updated = prev.map(c => 
          c.id === chatId ? { ...c, is_pinned: !c.is_pinned } : c
        );
        return updated.sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
      });
      toast.success(chat.is_pinned ? 'Chat unpinned' : 'Chat pinned');
    } catch (err) {
      console.error('Failed to toggle pin:', err);
      toast.error('Failed to update chat');
    }
    setContextMenu(null);
  };

  const initiateDelete = (chatId: string) => {
    const chat = chatList.find(c => c.id === chatId);
    if (chat) {
      setDeleteConfirm({ chatId, title: chat.title });
    }
    setContextMenu(null);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    
    try {
      await chatsApi.delete(deleteConfirm.chatId);
      setChatList(prev => prev.filter(c => c.id !== deleteConfirm.chatId));
      toast.success('Chat moved to recycle bin');
      
      if (pathname === `/chat/${deleteConfirm.chatId}`) {
        router.push('/chat');
      }
    } catch (err) {
      console.error('Failed to delete chat:', err);
      toast.error('Failed to delete chat');
    }
    setDeleteConfirm(null);
  };

  // Separate pinned and unpinned chats
  const pinnedChats = chatList.filter(c => c.is_pinned);
  const recentChats = chatList.filter(c => !c.is_pinned);

  return (
    <aside className="w-64 h-full bg-black/60 backdrop-blur-sm border-r border-white/10 flex flex-col">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/10">
        <Link href="/chat" className="flex items-center gap-2">
          <span className="text-2xl">🤖</span>
          <span className="font-bold text-text-primary">HAL</span>
        </Link>
        <button
          onClick={closeSidebar}
          className="md:hidden p-2 hover:bg-surface rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-text-secondary" />
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={createNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {/* Pinned Chats */}
        {pinnedChats.length > 0 && (
          <>
            <div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 px-2 flex items-center gap-1">
              <Pin className="w-3 h-3" />
              Pinned
            </div>
            <div className="space-y-1 mb-4">
              {pinnedChats.map(chat => (
                <div
                  key={chat.id}
                  className="group relative"
                  onContextMenu={(e) => handleContextMenu(e, chat.id)}
                >
                  <Link
                    href={`/chat/${chat.id}`}
                    onClick={closeSidebar}
                    className={cn(
                      "block px-3 py-2 rounded-lg transition-colors truncate text-sm pr-8",
                      pathname === `/chat/${chat.id}`
                        ? "bg-accent/10 text-accent"
                        : "text-text-secondary hover:bg-surface hover:text-text-primary"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Pin className="w-3 h-3 flex-shrink-0 text-accent" />
                      <span className="truncate">{chat.title}</span>
                    </div>
                  </Link>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleContextMenu(e, chat.id); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 hover:bg-surface-hover rounded transition-all"
                  >
                    <MoreVertical className="w-4 h-4 text-text-muted" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Recent Chats */}
        <div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 px-2">
          Recent Chats
        </div>
        
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-surface animate-pulse rounded-lg" />
            ))}
          </div>
        ) : recentChats.length === 0 && pinnedChats.length === 0 ? (
          <p className="text-sm text-text-muted px-2">No chats yet</p>
        ) : (
          <div className="space-y-1">
            {recentChats.map(chat => (
              <div
                key={chat.id}
                className="group relative"
                onContextMenu={(e) => handleContextMenu(e, chat.id)}
              >
                <Link
                  href={`/chat/${chat.id}`}
                  onClick={closeSidebar}
                  className={cn(
                    "block px-3 py-2 rounded-lg transition-colors truncate text-sm pr-8",
                    pathname === `/chat/${chat.id}`
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:bg-surface hover:text-text-primary"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{chat.title}</span>
                  </div>
                </Link>
                <button
                  onClick={(e) => { e.stopPropagation(); handleContextMenu(e, chat.id); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 hover:bg-surface-hover rounded transition-all"
                >
                  <MoreVertical className="w-4 h-4 text-text-muted" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="border-t border-white/10 p-3">
        <nav className="space-y-1">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeSidebar}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm",
                pathname.startsWith(item.href)
                  ? "bg-surface text-text-primary"
                  : "text-text-secondary hover:bg-surface hover:text-text-primary"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
          
          {/* Admin Link */}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={closeSidebar}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm",
                pathname.startsWith('/admin')
                  ? "bg-warning/10 text-warning"
                  : "text-warning/70 hover:bg-warning/10 hover:text-warning"
              )}
            >
              <Shield className="w-4 h-4" />
              Admin
            </Link>
          )}
        </nav>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-bg-elevated border border-border rounded-lg shadow-lg py-1 z-50 min-w-[160px]"
          style={{ 
            left: Math.min(contextMenu.x, window.innerWidth - 180), 
            top: Math.min(contextMenu.y, window.innerHeight - 120) 
          }}
        >
          <button
            onClick={() => togglePin(contextMenu.chatId)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface transition-colors"
          >
            {chatList.find(c => c.id === contextMenu.chatId)?.is_pinned ? (
              <>
                <PinOff className="w-4 h-4" />
                Unpin
              </>
            ) : (
              <>
                <Pin className="w-4 h-4" />
                Pin to Top
              </>
            )}
          </button>
          <button
            onClick={() => initiateDelete(contextMenu.chatId)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setDeleteConfirm(null)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-bg-elevated border border-border rounded-xl shadow-lg z-50 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-error/10 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-error" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">Delete Chat</h3>
            </div>
            
            <p className="text-text-secondary mb-2">
              Are you sure you want to delete this chat?
            </p>
            <p className="text-sm text-text-muted mb-4 truncate">
              "{deleteConfirm.title}"
            </p>
            <p className="text-xs text-text-muted mb-6">
              The chat will be moved to the recycle bin and can be restored later.
            </p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-error hover:bg-error/80 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
