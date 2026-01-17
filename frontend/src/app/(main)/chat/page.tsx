'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { chats as chatsApi } from '@/lib/api';
import { useUIStore } from '@/stores/ui';
import { ChatListItem } from '@/types';
import { Plus, MessageSquare, Lock, Users, Globe, Trash2, CheckSquare, Square, X } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

const visibilityIcons = {
  private: Lock,
  shared: Users,
  public: Globe,
};

export default function ChatListPage() {
  const router = useRouter();
  const { refreshChatList } = useUIStore();
  const [chatList, setChatList] = useState<ChatListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    try {
      const data = await chatsApi.list(true, true);
      setChatList(data);
    } catch (err) {
      console.error('Failed to load chats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const createNewChat = async () => {
    try {
      const chat = await chatsApi.create({ title: 'New Chat' });
      router.push(`/chat/${chat.id}`);
    } catch (err) {
      console.error('Failed to create chat:', err);
    }
  };

  const toggleSelection = (chatId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(chatId)) {
      newSelected.delete(chatId);
    } else {
      newSelected.add(chatId);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    const ownedChats = chatList.filter(c => c.is_owner).map(c => c.id);
    setSelectedIds(new Set(ownedChats));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Delete {selectedIds.size} chat(s)?</p>
        <p className="text-sm text-text-secondary">This action cannot be undone.</p>
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => toast.dismiss(t.id)}
            className="px-3 py-1.5 text-sm bg-surface hover:bg-bg-tertiary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              setIsDeleting(true);
              try {
                await Promise.all(
                  Array.from(selectedIds).map(id => chatsApi.delete(id))
                );
                setChatList(chatList.filter(c => !selectedIds.has(c.id)));
                clearSelection();
                refreshChatList(); // Trigger sidebar refresh
                toast.success(`Deleted ${selectedIds.size} chat(s)`);
              } catch (err) {
                console.error('Failed to delete chats:', err);
                toast.error('Failed to delete chats');
              } finally {
                setIsDeleting(false);
              }
            }}
            className="px-3 py-1.5 text-sm bg-error hover:bg-error/80 text-white rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    ), {
      duration: Infinity,
    });
  };

  const handleChatClick = (chat: ChatListItem) => {
    if (isSelectionMode && chat.is_owner) {
      toggleSelection(chat.id);
    } else {
      router.push(`/chat/${chat.id}`);
    }
  };

  const ownedCount = chatList.filter(c => c.is_owner).length;

  return (
    <div className="h-full flex flex-col p-4 md:p-6 pb-20 md:pb-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Chats</h1>
        <div className="flex items-center gap-2">
          {!isSelectionMode ? (
            <>
              {chatList.length > 0 && (
                <button
                  onClick={() => setIsSelectionMode(true)}
                  className="flex items-center gap-2 px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface rounded-lg transition-colors"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span className="hidden sm:inline">Select</span>
                </button>
              )}
              <button
                onClick={createNewChat}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Chat</span>
              </button>
            </>
          ) : (
            <>
              <span className="text-sm text-text-secondary">
                {selectedIds.size} selected
              </span>
              <button
                onClick={selectAll}
                className="px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface rounded-lg transition-colors text-sm"
              >
                Select All ({ownedCount})
              </button>
              <button
                onClick={deleteSelected}
                disabled={selectedIds.size === 0 || isDeleting}
                className="flex items-center gap-2 px-3 py-2 bg-error hover:bg-error/80 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={clearSelection}
                className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-32 bg-surface animate-pulse rounded-xl" />
          ))}
        </div>
      ) : chatList.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-6xl mb-4">💬</div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">No chats yet</h2>
          <p className="text-text-secondary mb-6">Start a conversation with HAL</p>
          <button
            onClick={createNewChat}
            className="flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Start New Chat
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {chatList.map(chat => {
            const VisibilityIcon = visibilityIcons[chat.visibility];
            const isSelected = selectedIds.has(chat.id);
            
            return (
              <div
                key={chat.id}
                onClick={() => handleChatClick(chat)}
                className={`relative text-left p-4 bg-surface hover:bg-surface-hover border rounded-xl transition-all group cursor-pointer ${
                  isSelected 
                    ? 'border-accent ring-2 ring-accent/20' 
                    : 'border-border hover:border-border-hover'
                }`}
              >
                {isSelectionMode && chat.is_owner && (
                  <div className="absolute top-3 left-3">
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-accent" />
                    ) : (
                      <Square className="w-5 h-5 text-text-muted" />
                    )}
                  </div>
                )}
                
                <div className={`flex items-start justify-between mb-2 ${isSelectionMode && chat.is_owner ? 'ml-7' : ''}`}>
                  <MessageSquare className="w-5 h-5 text-accent" />
                  <VisibilityIcon className="w-4 h-4 text-text-muted" />
                </div>
                
                <h3 className={`font-medium text-text-primary mb-1 truncate group-hover:text-accent transition-colors ${isSelectionMode && chat.is_owner ? 'ml-7' : ''}`}>
                  {chat.title}
                </h3>
                
                <div className={`flex items-center justify-between text-sm ${isSelectionMode && chat.is_owner ? 'ml-7' : ''}`}>
                  <span className="text-text-muted">
                    {chat.message_count} messages
                  </span>
                  <span className="text-text-muted">
                    {formatRelativeTime(chat.updated_at)}
                  </span>
                </div>
                
                {!chat.is_owner && (
                  <div className={`mt-2 text-xs text-accent ${isSelectionMode ? 'ml-7' : ''}`}>
                    Shared with you
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
