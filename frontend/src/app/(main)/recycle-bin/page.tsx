'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { chats as chatsApi } from '@/lib/api';
import { useUIStore } from '@/stores/ui';
import { ChatListItem } from '@/types';
import { 
  Trash2, 
  RotateCcw, 
  AlertTriangle,
  MessageSquare,
  Calendar,
  Loader2,
  Search,
  SortAsc,
  SortDesc,
  ArrowUpDown
} from 'lucide-react';
import toast from 'react-hot-toast';

type SortField = 'title' | 'deleted_at' | 'message_count';
type SortOrder = 'asc' | 'desc';

export default function RecycleBinPage() {
  const router = useRouter();
  const refreshChatList = useUIStore((state) => state.refreshChatList);
  const [deletedChats, setDeletedChats] = useState<ChatListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('deleted_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const loadDeletedChats = async () => {
    try {
      setIsLoading(true);
      const data = await chatsApi.listDeleted();
      setDeletedChats(data || []);
    } catch (err) {
      console.error('Failed to load deleted chats:', err);
      toast.error('Failed to load recycle bin');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDeletedChats();
  }, []);

  const restoreChat = async (chatId: string) => {
    try {
      await chatsApi.restore(chatId);
      setDeletedChats(prev => prev.filter(c => c.id !== chatId));
      setSelectedChats(prev => {
        const newSet = new Set(prev);
        newSet.delete(chatId);
        return newSet;
      });
      // Trigger sidebar refresh
      refreshChatList();
      toast.success('Chat restored');
    } catch (err) {
      console.error('Failed to restore chat:', err);
      toast.error('Failed to restore chat');
    }
  };

  const permanentDelete = async (chatId: string) => {
    try {
      await chatsApi.delete(chatId, true);
      setDeletedChats(prev => prev.filter(c => c.id !== chatId));
      setSelectedChats(prev => {
        const newSet = new Set(prev);
        newSet.delete(chatId);
        return newSet;
      });
      toast.success('Chat permanently deleted');
    } catch (err) {
      console.error('Failed to permanently delete chat:', err);
      toast.error('Failed to delete chat');
    }
  };

  const restoreSelected = async () => {
    const ids = Array.from(selectedChats);
    for (const id of ids) {
      await restoreChat(id);
    }
    setSelectedChats(new Set());
  };

  const deleteSelected = async () => {
    const ids = Array.from(selectedChats);
    for (const id of ids) {
      await permanentDelete(id);
    }
    setSelectedChats(new Set());
  };

  const emptyRecycleBin = async () => {
    try {
      const result = await chatsApi.emptyRecycleBin();
      setDeletedChats([]);
      setSelectedChats(new Set());
      setConfirmEmpty(false);
      toast.success(result.message);
    } catch (err) {
      console.error('Failed to empty recycle bin:', err);
      toast.error('Failed to empty recycle bin');
    }
  };

  const toggleSelect = (chatId: string) => {
    setSelectedChats(prev => {
      const newSet = new Set(prev);
      if (newSet.has(chatId)) {
        newSet.delete(chatId);
      } else {
        newSet.add(chatId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    if (selectedChats.size === filteredAndSortedChats.length) {
      setSelectedChats(new Set());
    } else {
      setSelectedChats(new Set(filteredAndSortedChats.map(c => c.id)));
    }
  };

  const formatDeletedDate = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    const now = new Date();
    
    // Reset times to midnight for accurate day comparison
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const diffMs = nowOnly.getTime() - dateOnly.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
    if (diffDays >= 7 && diffDays < 14) return '1 week ago';
    if (diffDays >= 14 && diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Filter and sort chats
  const filteredAndSortedChats = deletedChats
    .filter(chat => 
      chat.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'deleted_at':
          const dateA = a.deleted_at ? new Date(a.deleted_at).getTime() : 0;
          const dateB = b.deleted_at ? new Date(b.deleted_at).getTime() : 0;
          comparison = dateA - dateB;
          break;
        case 'message_count':
          comparison = a.message_count - b.message_count;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => toggleSort(field)}
      className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors ${
        sortField === field 
          ? 'bg-accent/10 text-accent' 
          : 'bg-surface hover:bg-surface-hover text-text-secondary'
      }`}
    >
      {label}
      {sortField === field && (
        sortOrder === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
      )}
    </button>
  );

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-surface rounded-lg">
              <Trash2 className="w-6 h-6 text-text-muted" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Recycle Bin</h1>
              <p className="text-sm text-text-muted">
                {deletedChats.length} deleted {deletedChats.length === 1 ? 'chat' : 'chats'}
              </p>
            </div>
          </div>
          
          {deletedChats.length > 0 && (
            <button
              onClick={() => setConfirmEmpty(true)}
              className="flex items-center gap-2 px-4 py-2 bg-error/10 hover:bg-error/20 text-error rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Empty Recycle Bin</span>
            </button>
          )}
        </div>

        {/* Search and Sort Controls */}
        {deletedChats.length > 0 && (
          <div className="mb-4 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search deleted chats..."
                className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>
            
            {/* Sort Options */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-text-muted flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" />
                Sort by:
              </span>
              <SortButton field="deleted_at" label="Date Deleted" />
              <SortButton field="title" label="Title" />
              <SortButton field="message_count" label="Messages" />
            </div>
          </div>
        )}

        {/* Bulk Actions */}
        {selectedChats.size > 0 && (
          <div className="mb-4 p-3 bg-surface border border-border rounded-lg flex items-center justify-between">
            <span className="text-sm text-text-secondary">
              {selectedChats.size} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={restoreSelected}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent/10 hover:bg-accent/20 text-accent rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Restore
              </button>
              <button
                onClick={deleteSelected}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-error/10 hover:bg-error/20 text-error rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : deletedChats.length === 0 ? (
          <div className="text-center py-16">
            <Trash2 className="w-16 h-16 text-text-muted mx-auto mb-4 opacity-50" />
            <h2 className="text-xl font-semibold text-text-primary mb-2">Recycle Bin is Empty</h2>
            <p className="text-text-secondary mb-6">
              Deleted chats will appear here for recovery
            </p>
            <button
              onClick={() => router.push('/chat')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Go to Chats
            </button>
          </div>
        ) : filteredAndSortedChats.length === 0 ? (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-50" />
            <h2 className="text-lg font-semibold text-text-primary mb-2">No matches found</h2>
            <p className="text-text-secondary">
              Try a different search term
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Select All */}
            <div className="flex items-center gap-3 px-4 py-2 text-sm text-text-muted">
              <input
                type="checkbox"
                checked={selectedChats.size === filteredAndSortedChats.length && filteredAndSortedChats.length > 0}
                onChange={selectAll}
                className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
              />
              <span>Select all ({filteredAndSortedChats.length})</span>
            </div>

            {/* Chat List */}
            {filteredAndSortedChats.map(chat => (
              <div
                key={chat.id}
                className={`flex items-center gap-4 p-4 bg-surface border rounded-xl transition-colors ${
                  selectedChats.has(chat.id) 
                    ? 'border-accent bg-accent/5' 
                    : 'border-border hover:border-border-hover'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedChats.has(chat.id)}
                  onChange={() => toggleSelect(chat.id)}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                />
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-text-primary truncate">
                    {chat.title}
                  </h3>
                  <div className="flex items-center gap-4 mt-1 text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {chat.message_count} messages
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Deleted {formatDeletedDate(chat.deleted_at)}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => restoreChat(chat.id)}
                    className="p-2 text-accent hover:bg-accent/10 rounded-lg transition-colors"
                    title="Restore chat"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => permanentDelete(chat.id)}
                    className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
                    title="Delete permanently"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Empty Confirmation Modal */}
      {confirmEmpty && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setConfirmEmpty(false)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-bg-elevated border border-border rounded-xl shadow-lg z-50 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-error/10 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-error" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">Empty Recycle Bin</h3>
            </div>
            
            <p className="text-text-secondary mb-6">
              Are you sure you want to permanently delete all {deletedChats.length} chats? 
              This action cannot be undone.
            </p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmEmpty(false)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={emptyRecycleBin}
                className="px-4 py-2 bg-error hover:bg-error/80 text-white rounded-lg transition-colors"
              >
                Delete All
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
