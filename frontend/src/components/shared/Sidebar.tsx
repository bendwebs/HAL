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
  ImageIcon
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ChatListItem } from '@/types';

const navItems = [
  { href: '/chat', icon: MessageSquare, label: 'Chats' },
  { href: '/converse', icon: Mic, label: 'Converse' },
  { href: '/generate', icon: ImageIcon, label: 'Generate' },
  { href: '/library', icon: FolderOpen, label: 'Library' },
  { href: '/memories', icon: Brain, label: 'Memories' },
  { href: '/personas', icon: Users, label: 'Personas' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const chatListVersion = useUIStore((state) => state.chatListVersion);
  const [chatList, setChatList] = useState<ChatListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
  }, [chatListVersion]); // Re-fetch when chatListVersion changes

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
        <div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2 px-2">
          Recent Chats
        </div>
        
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-surface animate-pulse rounded-lg" />
            ))}
          </div>
        ) : chatList.length === 0 ? (
          <p className="text-sm text-text-muted px-2">No chats yet</p>
        ) : (
          <div className="space-y-1">
            {chatList.slice(0, 10).map(chat => (
              <Link
                key={chat.id}
                href={`/chat/${chat.id}`}
                onClick={closeSidebar}
                className={cn(
                  "block px-3 py-2 rounded-lg transition-colors truncate text-sm",
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
    </aside>
  );
}
