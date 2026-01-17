'use client';

import { useState, useEffect } from 'react';
import { memories, chats } from '@/lib/api';
import { 
  Brain, Plus, Trash2, Search, Tag, Edit2, X, Check,
  Sparkles, Clock, AlertCircle, RefreshCw, Layers, Merge,
  ChevronDown, ChevronRight, Zap, MessageSquare, Archive,
  Filter, Eye, Download, CheckCircle2, Circle, Loader2
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Memory {
  id: string;
  content: string;
  score?: number;
  metadata?: Record<string, any>;
  categories?: string[];
  created_at?: string;
  updated_at?: string;
}

interface DuplicateGroup {
  type: string;
  memories: Array<{ id: string; content: string }>;
  similarity: number;
  suggested_merge: string;
  reason: string;
}

interface LowValueMemory {
  id: string;
  content: string;
  reason: string;
}

interface ChatInfo {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
  persona_id?: string;
}

interface TitleGroup {
  count: number;
  empty: number;
  total_messages: number;
}

type MainTab = 'memories' | 'chats';

export default function MemoriesPage() {
  const [mainTab, setMainTab] = useState<MainTab>('memories');
  const [memoryList, setMemoryList] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Memory[] | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [newContent, setNewContent] = useState('');
  const [showConsolidateModal, setShowConsolidateModal] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [relatedGroups, setRelatedGroups] = useState<DuplicateGroup[]>([]);
  const [lowValueMemories, setLowValueMemories] = useState<LowValueMemory[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [similarityThreshold, setSimilarityThreshold] = useState(0.85);
  const [mergeContent, setMergeContent] = useState<Record<string, string>>({});
  const [activeConsolidateTab, setActiveConsolidateTab] = useState<'duplicates' | 'related' | 'lowvalue'>('duplicates');
  const [chatStats, setChatStats] = useState<{
    total_chats: number;
    empty_chats: number;
    title_groups: Record<string, TitleGroup>;
    chats: ChatInfo[];
  } | null>(null);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [chatFilter, setChatFilter] = useState<'all' | 'empty' | 'duplicates'>('all');
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [previewChat, setPreviewChat] = useState<{
    id: string; title: string;
    messages: Array<{ role: string; content: string; created_at: string }>;
    total_messages: number;
  } | null>(null);
  const [extractingFrom, setExtractingFrom] = useState<string | null>(null);
  const [extractedMemories, setExtractedMemories] = useState<Record<string, string[]>>({});

  useEffect(() => { loadMemories(); }, []);
  useEffect(() => { if (mainTab === 'chats' && !chatStats) loadChatStats(); }, [mainTab]);

  const loadMemories = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await memories.list({ limit: 100 });
      setMemoryList(data.memories || []);
    } catch (err: any) {
      if (err.status === 503) setError('Memory system not available.');
      else setError('Failed to load memories');
    } finally {
      setIsLoading(false);
    }
  };

  const loadChatStats = async () => {
    try {
      setIsLoadingChats(true);
      const stats = await chats.getStats();
      setChatStats(stats);
    } catch (err) {
      toast.error('Failed to load chat statistics');
    } finally {
      setIsLoadingChats(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    try {
      const data = await memories.search(searchQuery);
      setSearchResults(data.results || []);
    } catch (err) { console.error('Search failed:', err); }
  };

  const clearSearch = () => { setSearchQuery(''); setSearchResults(null); };

  const handleAddMemory = async () => {
    if (!newContent.trim()) return;
    try {
      await memories.create({ content: newContent });
      setShowAddModal(false);
      setNewContent('');
      loadMemories();
      toast.success('Memory added');
    } catch (err) { toast.error('Failed to add memory'); }
  };

  const handleUpdateMemory = async (id: string) => {
    if (!editContent.trim()) return;
    try {
      await memories.update(id, { content: editContent });
      setEditingId(null);
      setEditContent('');
      loadMemories();
      toast.success('Memory updated');
    } catch (err) { toast.error('Failed to update memory'); }
  };

  const handleDelete = async (id: string) => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Delete this memory?</p>
        <div className="flex gap-2 mt-1">
          <button onClick={() => toast.dismiss(t.id)} className="px-3 py-1.5 text-sm bg-surface hover:bg-bg-tertiary rounded-lg">Cancel</button>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await memories.delete(id);
                setMemoryList(memoryList.filter(m => m.id !== id));
                if (searchResults) setSearchResults(searchResults.filter(m => m.id !== id));
                toast.success('Memory deleted');
              } catch (err) { toast.error('Failed to delete memory'); }
            }}
            className="px-3 py-1.5 text-sm bg-error hover:bg-error/80 text-white rounded-lg"
          >Delete</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const handleDeleteAll = async () => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Delete ALL memories?</p>
        <p className="text-sm text-text-secondary">This cannot be undone.</p>
        <div className="flex gap-2 mt-1">
          <button onClick={() => toast.dismiss(t.id)} className="px-3 py-1.5 text-sm bg-surface hover:bg-bg-tertiary rounded-lg">Cancel</button>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              try { await memories.deleteAll(); setMemoryList([]); setSearchResults(null); toast.success('All memories deleted'); }
              catch (err) { toast.error('Failed to delete memories'); }
            }}
            className="px-3 py-1.5 text-sm bg-error hover:bg-error/80 text-white rounded-lg"
          >Delete All</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const startEditing = (memory: Memory) => { setEditingId(memory.id); setEditContent(memory.content); };

  const analyzeForDuplicates = async () => {
    setIsAnalyzing(true);
    try {
      const result = await memories.consolidate(similarityThreshold, true, true);
      setDuplicateGroups(result.groups || []);
      setRelatedGroups(result.related || []);
      setLowValueMemories(result.low_value || []);
      setExpandedGroups(new Set());
      const initialMerge: Record<string, string> = {};
      result.groups?.forEach((g, i) => { initialMerge[`dup-${i}`] = g.suggested_merge; });
      result.related?.forEach((g, i) => { initialMerge[`rel-${i}`] = g.suggested_merge; });
      setMergeContent(initialMerge);
      if ((result.groups?.length || 0) > 0) setActiveConsolidateTab('duplicates');
      else if ((result.related?.length || 0) > 0) setActiveConsolidateTab('related');
      else if ((result.low_value?.length || 0) > 0) setActiveConsolidateTab('lowvalue');
      const total = (result.groups?.length || 0) + (result.related?.length || 0) + (result.low_value?.length || 0);
      if (total === 0) toast.success('No issues found!');
      else toast.success(`Found ${total} items to review`);
    } catch (err) { toast.error('Failed to analyze memories'); }
    finally { setIsAnalyzing(false); }
  };

  const toggleGroupExpanded = (key: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(key)) newExpanded.delete(key);
    else newExpanded.add(key);
    setExpandedGroups(newExpanded);
  };

  const handleMergeGroup = async (groupKey: string, group: DuplicateGroup) => {
    const content = mergeContent[groupKey] || group.suggested_merge;
    try {
      await memories.merge(group.memories.map(m => m.id), content);
      if (groupKey.startsWith('dup-')) setDuplicateGroups(prev => prev.filter((_, i) => i !== parseInt(groupKey.split('-')[1])));
      else setRelatedGroups(prev => prev.filter((_, i) => i !== parseInt(groupKey.split('-')[1])));
      loadMemories();
      toast.success('Memories merged');
    } catch (err) { toast.error('Failed to merge memories'); }
  };


  const handleAutoConsolidate = async () => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Auto-consolidate all duplicates?</p>
        <div className="flex gap-2 mt-1">
          <button onClick={() => toast.dismiss(t.id)} className="px-3 py-1.5 text-sm bg-surface hover:bg-bg-tertiary rounded-lg">Cancel</button>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                const result = await memories.consolidate(similarityThreshold, false, false);
                toast.success(`Deleted ${result.deleted || 0} duplicate memories`);
                setDuplicateGroups([]); setRelatedGroups([]); setShowConsolidateModal(false);
                loadMemories();
              } catch (err) { toast.error('Failed to consolidate'); }
            }}
            className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg"
          >Consolidate</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const handleDeleteLowValue = async (id: string) => {
    try { await memories.delete(id); setLowValueMemories(prev => prev.filter(m => m.id !== id)); loadMemories(); toast.success('Memory removed'); }
    catch (err) { toast.error('Failed to delete memory'); }
  };

  const handleDeleteAllLowValue = async () => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Delete all {lowValueMemories.length} low-value memories?</p>
        <div className="flex gap-2 mt-1">
          <button onClick={() => toast.dismiss(t.id)} className="px-3 py-1.5 text-sm bg-surface hover:bg-bg-tertiary rounded-lg">Cancel</button>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              try { for (const mem of lowValueMemories) await memories.delete(mem.id); toast.success(`Deleted ${lowValueMemories.length} memories`); setLowValueMemories([]); loadMemories(); }
              catch (err) { toast.error('Failed to delete memories'); }
            }}
            className="px-3 py-1.5 text-sm bg-error hover:bg-error/80 text-white rounded-lg"
          >Delete All</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const toggleChatSelection = (chatId: string) => {
    const newSelected = new Set(selectedChats);
    if (newSelected.has(chatId)) newSelected.delete(chatId);
    else newSelected.add(chatId);
    setSelectedChats(newSelected);
  };

  const getFilteredChats = () => {
    if (!chatStats) return [];
    let filtered = chatStats.chats;
    if (chatFilter === 'empty') filtered = filtered.filter(c => c.message_count === 0);
    else if (chatFilter === 'duplicates') {
      const duplicateTitles = Object.keys(chatStats.title_groups).filter(t => chatStats.title_groups[t].count > 1);
      filtered = filtered.filter(c => duplicateTitles.includes(c.title));
    }
    if (chatSearchQuery.trim()) {
      const query = chatSearchQuery.toLowerCase();
      filtered = filtered.filter(c => c.title.toLowerCase().includes(query));
    }
    return filtered;
  };

  const handlePreviewChat = async (chatId: string) => {
    try { const preview = await chats.getPreview(chatId); setPreviewChat(preview); }
    catch (err) { toast.error('Failed to load chat preview'); }
  };

  const handleExtractMemoriesFromChat = async (chatId: string) => {
    setExtractingFrom(chatId);
    try {
      const result = await chats.extractMemories(chatId);
      if (result.pending && result.pending.length > 0) {
        setExtractedMemories(prev => ({ ...prev, [chatId]: result.pending }));
        toast.success(`Found ${result.pending.length} potential memories`);
      } else { toast('No new memories found', { icon: '📭' }); }
    } catch (err) { toast.error('Failed to extract memories'); }
    finally { setExtractingFrom(null); }
  };

  const handleSaveExtractedMemories = async (chatId: string) => {
    const pending = extractedMemories[chatId];
    if (!pending?.length) return;
    try {
      await memories.confirm(pending);
      toast.success(`Saved ${pending.length} memories`);
      setExtractedMemories(prev => { const newState = { ...prev }; delete newState[chatId]; return newState; });
      loadMemories();
    } catch (err) { toast.error('Failed to save memories'); }
  };

  const handleBulkDeleteChats = async () => {
    if (selectedChats.size === 0) { toast.error('No chats selected'); return; }
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Delete {selectedChats.size} selected chats?</p>
        <div className="flex gap-2 mt-1">
          <button onClick={() => toast.dismiss(t.id)} className="px-3 py-1.5 text-sm bg-surface hover:bg-bg-tertiary rounded-lg">Cancel</button>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                const result = await chats.bulkDelete({ chatIds: Array.from(selectedChats) });
                toast.success(result.message);
                setSelectedChats(new Set());
                loadChatStats();
              } catch (err) { toast.error('Failed to delete chats'); }
            }}
            className="px-3 py-1.5 text-sm bg-error hover:bg-error/80 text-white rounded-lg"
          >Delete</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const handleDeleteEmptyChats = async () => {
    if (!chatStats || chatStats.empty_chats === 0) { toast('No empty chats to delete', { icon: '✓' }); return; }
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Delete all {chatStats.empty_chats} empty chats?</p>
        <div className="flex gap-2 mt-1">
          <button onClick={() => toast.dismiss(t.id)} className="px-3 py-1.5 text-sm bg-surface hover:bg-bg-tertiary rounded-lg">Cancel</button>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              try { const result = await chats.bulkDelete({ deleteEmptyOnly: true }); toast.success(result.message); loadChatStats(); }
              catch (err) { toast.error('Failed to delete chats'); }
            }}
            className="px-3 py-1.5 text-sm bg-error hover:bg-error/80 text-white rounded-lg"
          >Delete Empty</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const handleDeleteByTitle = async (title: string) => {
    const group = chatStats?.title_groups[title];
    if (!group) return;
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Delete "{title}" chats?</p>
        <p className="text-sm text-text-secondary">{group.count} chats ({group.empty} empty)</p>
        <div className="flex gap-2 mt-1">
          <button onClick={() => toast.dismiss(t.id)} className="px-3 py-1.5 text-sm bg-surface hover:bg-bg-tertiary rounded-lg">Cancel</button>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              try { const result = await chats.bulkDelete({ titleFilter: title, deleteEmptyOnly: true }); toast.success(result.message); loadChatStats(); }
              catch (err) { toast.error('Failed to delete chats'); }
            }}
            className="px-3 py-1.5 text-sm bg-warning hover:bg-warning/80 text-white rounded-lg"
          >Delete Empty</button>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              try { const result = await chats.bulkDelete({ titleFilter: title, deleteEmptyOnly: false }); toast.success(result.message); loadChatStats(); }
              catch (err) { toast.error('Failed to delete chats'); }
            }}
            className="px-3 py-1.5 text-sm bg-error hover:bg-error/80 text-white rounded-lg"
          >Delete All</button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const displayMemories = searchResults !== null ? searchResults : memoryList;
  const filteredChats = getFilteredChats();


  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Memory & Chat Manager</h1>
            <p className="text-sm text-text-muted mt-1">Manage memories and clean up old conversations</p>
          </div>
          <div className="flex gap-1 p-1 bg-surface rounded-lg">
            <button onClick={() => setMainTab('memories')} className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${mainTab === 'memories' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`}>
              <Brain className="w-4 h-4" /> Memories
            </button>
            <button onClick={() => setMainTab('chats')} className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${mainTab === 'chats' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`}>
              <MessageSquare className="w-4 h-4" /> Chats
            </button>
          </div>
        </div>

        {error && mainTab === 'memories' && (
          <div className="mb-6 p-4 bg-error/10 border border-error/20 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3"><AlertCircle className="w-5 h-5 text-error" /><p className="text-error">{error}</p></div>
            <button onClick={loadMemories} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-error/20 hover:bg-error/30 text-error rounded-lg"><RefreshCw className="w-4 h-4" /> Retry</button>
          </div>
        )}

        {/* MEMORIES TAB */}
        {mainTab === 'memories' && (
          <div>
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              {memoryList.length > 1 && (
                <button onClick={() => { setShowConsolidateModal(true); setDuplicateGroups([]); setRelatedGroups([]); setLowValueMemories([]); }} className="flex items-center gap-2 px-3 py-2 text-accent hover:bg-accent/10 rounded-lg">
                  <Layers className="w-4 h-4" /> <span>Consolidate</span>
                </button>
              )}
              {memoryList.length > 0 && (
                <button onClick={handleDeleteAll} className="flex items-center gap-2 px-3 py-2 text-error hover:bg-error/10 rounded-lg">
                  <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Delete All</span>
                </button>
              )}
              <div className="flex-1" />
              <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg">
                <Plus className="w-4 h-4" /> <span>Add Memory</span>
              </button>
            </div>

            <form onSubmit={handleSearch} className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search memories semantically..." className="w-full pl-10 pr-20 py-2.5 rounded-lg bg-surface border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
                {searchQuery && <button type="button" onClick={clearSearch} className="absolute right-14 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>}
                <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-accent text-white rounded text-sm">Search</button>
              </div>
            </form>

            {searchResults !== null && (
              <div className="mb-4 flex items-center gap-2 text-sm text-text-muted">
                <span>Showing {searchResults.length} results for "{searchQuery}"</span>
                <button onClick={clearSearch} className="text-accent hover:underline">Clear</button>
              </div>
            )}

            <div className="mb-4 p-3 bg-surface rounded-lg flex items-center gap-4 text-sm">
              <span className="text-text-muted">{memoryList.length} memories</span>
              <span className="text-text-muted">•</span>
              <span className="text-text-muted">Powered by Mem0</span>
            </div>

            {isLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-surface animate-pulse rounded-xl" />)}</div>
            ) : displayMemories.length === 0 ? (
              <div className="text-center py-12">
                <Brain className="w-12 h-12 text-text-muted mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-text-primary mb-2">{searchResults !== null ? 'No matching memories' : 'No memories yet'}</h2>
                <p className="text-text-secondary mb-2">{searchResults !== null ? 'Try a different search' : 'Memories are extracted from conversations.'}</p>
                {searchResults === null && <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg mt-4"><Plus className="w-4 h-4" /> Add First Memory</button>}
              </div>
            ) : (
              <div className="space-y-3">
                {displayMemories.map(memory => (
                  <div key={memory.id} className="p-4 bg-surface border border-border rounded-xl hover:border-border-hover transition-colors">
                    {editingId === memory.id ? (
                      <div className="space-y-3">
                        <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent resize-none" rows={3} />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingId(null)} className="p-2 text-text-muted hover:text-text-primary rounded-lg"><X className="w-4 h-4" /></button>
                          <button onClick={() => handleUpdateMemory(memory.id)} className="p-2 text-accent hover:bg-accent/10 rounded-lg"><Check className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start gap-3 mb-3">
                          <div className="p-2 rounded-lg bg-accent/10 text-accent"><Sparkles className="w-4 h-4" /></div>
                          <p className="text-text-primary flex-1">{memory.content}</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-sm">
                            {memory.score !== undefined && <span className="text-text-muted">Score: {(memory.score * 100).toFixed(0)}%</span>}
                            {memory.categories?.length > 0 && <span className="flex items-center gap-1 text-text-muted"><Tag className="w-3 h-3" />{memory.categories.join(', ')}</span>}
                            {memory.created_at && <span className="flex items-center gap-1 text-text-muted"><Clock className="w-3 h-3" />{formatRelativeTime(memory.created_at)}</span>}
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEditing(memory)} className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(memory.id)} className="p-2 text-text-muted hover:text-error hover:bg-error/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}


        {/* CHATS TAB */}
        {mainTab === 'chats' && (
          <div>
            {chatStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="p-4 bg-surface rounded-lg">
                  <div className="text-2xl font-bold text-text-primary">{chatStats.total_chats}</div>
                  <div className="text-sm text-text-muted">Total Chats</div>
                </div>
                <div className="p-4 bg-surface rounded-lg">
                  <div className="text-2xl font-bold text-error">{chatStats.empty_chats}</div>
                  <div className="text-sm text-text-muted">Empty Chats</div>
                </div>
                <div className="p-4 bg-surface rounded-lg">
                  <div className="text-2xl font-bold text-warning">{Object.keys(chatStats.title_groups).length}</div>
                  <div className="text-sm text-text-muted">Duplicate Titles</div>
                </div>
                <div className="p-4 bg-surface rounded-lg border-2 border-dashed border-accent/30 flex flex-col items-center justify-center cursor-pointer hover:bg-accent/5" onClick={handleDeleteEmptyChats}>
                  <Archive className="w-6 h-6 text-accent mb-1" />
                  <div className="text-sm text-accent font-medium">Clean Empty</div>
                </div>
              </div>
            )}

            {chatStats && Object.keys(chatStats.title_groups).length > 0 && (
              <div className="mb-6 p-4 bg-warning/10 border border-warning/20 rounded-lg">
                <h3 className="font-medium text-text-primary mb-3 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-warning" /> Duplicate Title Groups</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(chatStats.title_groups).slice(0, 10).map(([title, group]) => (
                    <button key={title} onClick={() => handleDeleteByTitle(title)} className="px-3 py-1.5 bg-surface hover:bg-surface-hover rounded-lg text-sm text-text-primary flex items-center gap-2">
                      <span className="truncate max-w-32">{title}</span>
                      <span className="text-text-muted">×{group.count}</span>
                      {group.empty > 0 && <span className="text-error text-xs">({group.empty} empty)</span>}
                    </button>
                  ))}
                  {Object.keys(chatStats.title_groups).length > 10 && <span className="text-text-muted text-sm px-2">+{Object.keys(chatStats.title_groups).length - 10} more</span>}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex gap-1 p-1 bg-surface rounded-lg">
                <button onClick={() => setChatFilter('all')} className={`px-3 py-1.5 text-sm rounded-md ${chatFilter === 'all' ? 'bg-bg-tertiary text-text-primary' : 'text-text-muted hover:text-text-primary'}`}>All ({chatStats?.total_chats || 0})</button>
                <button onClick={() => setChatFilter('empty')} className={`px-3 py-1.5 text-sm rounded-md ${chatFilter === 'empty' ? 'bg-error/20 text-error' : 'text-text-muted hover:text-text-primary'}`}>Empty ({chatStats?.empty_chats || 0})</button>
                <button onClick={() => setChatFilter('duplicates')} className={`px-3 py-1.5 text-sm rounded-md ${chatFilter === 'duplicates' ? 'bg-warning/20 text-warning' : 'text-text-muted hover:text-text-primary'}`}>Duplicates</button>
              </div>
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input type="text" value={chatSearchQuery} onChange={(e) => setChatSearchQuery(e.target.value)} placeholder="Search by title..." className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent text-sm" />
              </div>
            </div>

            {selectedChats.size > 0 && (
              <div className="mb-4 p-3 bg-accent/10 border border-accent/20 rounded-lg flex items-center justify-between">
                <span className="text-sm text-accent font-medium">{selectedChats.size} chats selected</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedChats(new Set())} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary">Clear</button>
                  <button onClick={handleBulkDeleteChats} className="px-3 py-1.5 text-sm bg-error hover:bg-error/80 text-white rounded-lg flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete Selected</button>
                </div>
              </div>
            )}

            <div className="mb-2 flex items-center gap-2">
              <button onClick={() => setSelectedChats(new Set(filteredChats.map(c => c.id)))} className="text-xs text-accent hover:underline">Select all {filteredChats.length}</button>
              <button onClick={loadChatStats} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
            </div>

            {isLoadingChats ? (
              <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-surface animate-pulse rounded-lg" />)}</div>
            ) : filteredChats.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="w-12 h-12 text-text-muted mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-text-primary mb-2">No chats found</h2>
                <p className="text-text-secondary">{chatSearchQuery ? 'Try a different search' : 'No chats match the current filter'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredChats.map(chat => (
                  <div key={chat.id} className={`p-3 bg-surface border rounded-lg transition-colors ${selectedChats.has(chat.id) ? 'border-accent bg-accent/5' : 'border-border hover:border-border-hover'}`}>
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleChatSelection(chat.id)} className={`p-1 rounded ${selectedChats.has(chat.id) ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`}>
                        {selectedChats.has(chat.id) ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-text-primary truncate">{chat.title}</h3>
                          {chat.message_count === 0 && <span className="px-2 py-0.5 text-xs bg-error/10 text-error rounded">Empty</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
                          <span>{chat.message_count} messages</span>
                          <span>•</span>
                          <span>{formatRelativeTime(chat.updated_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {chat.message_count > 0 && (
                          <>
                            <button onClick={() => handlePreviewChat(chat.id)} className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg" title="Preview"><Eye className="w-4 h-4" /></button>
                            <button onClick={() => handleExtractMemoriesFromChat(chat.id)} disabled={extractingFrom === chat.id} className="p-2 text-text-muted hover:text-accent hover:bg-accent/10 rounded-lg disabled:opacity-50" title="Extract memories">
                              {extractingFrom === chat.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {extractedMemories[chat.id]?.length > 0 && (
                      <div className="mt-3 p-3 bg-accent/5 border border-accent/20 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-accent">Found {extractedMemories[chat.id].length} potential memories</span>
                          <div className="flex gap-2">
                            <button onClick={() => setExtractedMemories(prev => { const n = {...prev}; delete n[chat.id]; return n; })} className="text-xs text-text-muted hover:text-text-primary">Dismiss</button>
                            <button onClick={() => handleSaveExtractedMemories(chat.id)} className="text-xs px-2 py-1 bg-accent text-white rounded hover:bg-accent-hover">Save All</button>
                          </div>
                        </div>
                        <ul className="space-y-1">
                          {extractedMemories[chat.id].map((mem, i) => <li key={i} className="text-sm text-text-secondary flex items-start gap-2"><Sparkles className="w-3 h-3 text-accent mt-1 flex-shrink-0" /><span>{mem}</span></li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}


        {/* Add Memory Modal */}
        {showAddModal && (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowAddModal(false)} />
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-elevated border border-border rounded-xl shadow-lg z-50 p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Add Memory</h2>
              <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="e.g., I prefer concise answers..." className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none" rows={4} />
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary">Cancel</button>
                <button onClick={handleAddMemory} disabled={!newContent.trim()} className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50">Add Memory</button>
              </div>
            </div>
          </>
        )}

        {/* Chat Preview Modal */}
        {previewChat && (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setPreviewChat(null)} />
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[80vh] bg-bg-elevated border border-border rounded-xl shadow-lg z-50 flex flex-col">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div><h2 className="font-semibold text-text-primary">{previewChat.title}</h2><p className="text-sm text-text-muted">{previewChat.total_messages} messages</p></div>
                <button onClick={() => setPreviewChat(null)} className="p-2 text-text-muted hover:text-text-primary"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {previewChat.messages.map((msg, i) => (
                  <div key={i} className={`p-3 rounded-lg ${msg.role === 'user' ? 'bg-accent/10 ml-8' : 'bg-surface mr-8'}`}>
                    <div className="text-xs text-text-muted mb-1">{msg.role}</div>
                    <p className="text-sm text-text-primary whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))}
                {previewChat.total_messages > previewChat.messages.length && <p className="text-center text-sm text-text-muted">...and {previewChat.total_messages - previewChat.messages.length} more messages</p>}
              </div>
            </div>
          </>
        )}

        {/* Consolidate Modal */}
        {showConsolidateModal && (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowConsolidateModal(false)} />
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[80vh] bg-bg-elevated border border-border rounded-xl shadow-lg z-50 flex flex-col">
              <div className="p-6 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/10 text-accent"><Layers className="w-5 h-5" /></div>
                  <div><h2 className="text-lg font-semibold text-text-primary">Consolidate Memories</h2><p className="text-sm text-text-muted">Find and merge similar memories</p></div>
                </div>
                <button onClick={() => setShowConsolidateModal(false)} className="p-2 text-text-muted hover:text-text-primary rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                <div className="mb-6">
                  <label className="block text-sm text-text-secondary mb-2">Similarity Threshold: {Math.round(similarityThreshold * 100)}%</label>
                  <input type="range" min="50" max="100" value={similarityThreshold * 100} onChange={(e) => setSimilarityThreshold(Number(e.target.value) / 100)} className="w-full accent-accent" />
                  <p className="text-xs text-text-muted mt-1">Higher = stricter matching</p>
                </div>
                {duplicateGroups.length === 0 && relatedGroups.length === 0 && lowValueMemories.length === 0 && (
                  <button onClick={analyzeForDuplicates} disabled={isAnalyzing} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50">
                    {isAnalyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : <><Zap className="w-4 h-4" /> Analyze Memories</>}
                  </button>
                )}
                {(duplicateGroups.length > 0 || relatedGroups.length > 0 || lowValueMemories.length > 0) && (
                  <div className="space-y-4">
                    <div className="flex gap-1 p-1 bg-surface rounded-lg">
                      <button onClick={() => setActiveConsolidateTab('duplicates')} className={`flex-1 px-3 py-2 text-sm rounded-md ${activeConsolidateTab === 'duplicates' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`}>Duplicates ({duplicateGroups.length})</button>
                      <button onClick={() => setActiveConsolidateTab('related')} className={`flex-1 px-3 py-2 text-sm rounded-md ${activeConsolidateTab === 'related' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`}>Related ({relatedGroups.length})</button>
                      <button onClick={() => setActiveConsolidateTab('lowvalue')} className={`flex-1 px-3 py-2 text-sm rounded-md ${activeConsolidateTab === 'lowvalue' ? 'bg-error text-white' : 'text-text-secondary hover:text-text-primary'}`}>Low Value ({lowValueMemories.length})</button>
                    </div>
                    {activeConsolidateTab === 'duplicates' && (
                      <div className="space-y-3">
                        {duplicateGroups.length === 0 ? <p className="text-center text-text-muted py-4">No duplicates found</p> : (
                          <>
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-text-secondary">{duplicateGroups.reduce((sum, g) => sum + g.memories.length, 0)} memories in {duplicateGroups.length} groups</p>
                              <button onClick={handleAutoConsolidate} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-accent/10 hover:bg-accent/20 text-accent rounded-lg"><Zap className="w-3 h-3" /> Auto-merge All</button>
                            </div>
                            {duplicateGroups.map((group, index) => (
                              <div key={index} className="border border-border rounded-lg overflow-hidden">
                                <button onClick={() => toggleGroupExpanded(`dup-${index}`)} className="w-full flex items-center justify-between p-4 bg-surface hover:bg-surface-hover">
                                  <div className="flex items-center gap-3">
                                    {expandedGroups.has(`dup-${index}`) ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted" />}
                                    <span className="text-text-primary font-medium">{group.memories.length} memories</span>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">{Math.round(group.similarity * 100)}% similar</span>
                                  </div>
                                  <button onClick={(e) => { e.stopPropagation(); handleMergeGroup(`dup-${index}`, group); }} className="flex items-center gap-1 px-3 py-1 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg"><Merge className="w-3 h-3" /> Merge</button>
                                </button>
                                {expandedGroups.has(`dup-${index}`) && (
                                  <div className="p-4 border-t border-border space-y-3">
                                    <p className="text-xs text-text-muted">{group.reason}</p>
                                    {group.memories.map(mem => <div key={mem.id} className="p-3 bg-bg-tertiary rounded-lg"><p className="text-sm text-text-primary">{mem.content}</p></div>)}
                                    <div className="pt-3 border-t border-border">
                                      <label className="block text-sm text-text-secondary mb-2">Merged content:</label>
                                      <textarea value={mergeContent[`dup-${index}`] || group.suggested_merge} onChange={(e) => setMergeContent(prev => ({ ...prev, [`dup-${index}`]: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-primary focus:outline-none focus:border-accent resize-none text-sm" rows={3} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                    {activeConsolidateTab === 'related' && (
                      <div className="space-y-3">
                        {relatedGroups.length === 0 ? <p className="text-center text-text-muted py-4">No related memories found</p> : (
                          <>
                            <p className="text-sm text-text-muted">Thematically related memories.</p>
                            {relatedGroups.map((group, index) => (
                              <div key={index} className="border border-border rounded-lg overflow-hidden">
                                <button onClick={() => toggleGroupExpanded(`rel-${index}`)} className="w-full flex items-center justify-between p-4 bg-surface hover:bg-surface-hover">
                                  <div className="flex items-center gap-3">
                                    {expandedGroups.has(`rel-${index}`) ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted" />}
                                    <span className="text-text-primary font-medium">{group.memories.length} memories</span>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">{Math.round(group.similarity * 100)}% similar</span>
                                  </div>
                                  <button onClick={(e) => { e.stopPropagation(); handleMergeGroup(`rel-${index}`, group); }} className="flex items-center gap-1 px-3 py-1 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg"><Merge className="w-3 h-3" /> Merge</button>
                                </button>
                                {expandedGroups.has(`rel-${index}`) && (
                                  <div className="p-4 border-t border-border space-y-3">
                                    <p className="text-xs text-text-muted">{group.reason}</p>
                                    {group.memories.map(mem => <div key={mem.id} className="p-3 bg-bg-tertiary rounded-lg"><p className="text-sm text-text-primary">{mem.content}</p></div>)}
                                    <div className="pt-3 border-t border-border">
                                      <label className="block text-sm text-text-secondary mb-2">Merged content:</label>
                                      <textarea value={mergeContent[`rel-${index}`] || group.suggested_merge} onChange={(e) => setMergeContent(prev => ({ ...prev, [`rel-${index}`]: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-primary focus:outline-none focus:border-accent resize-none text-sm" rows={3} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                    {activeConsolidateTab === 'lowvalue' && (
                      <div className="space-y-3">
                        {lowValueMemories.length === 0 ? <p className="text-center text-text-muted py-4">No low-value memories found</p> : (
                          <>
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-text-muted">Generic or not useful memories.</p>
                              <button onClick={handleDeleteAllLowValue} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-error/10 hover:bg-error/20 text-error rounded-lg"><Trash2 className="w-3 h-3" /> Remove All</button>
                            </div>
                            {lowValueMemories.map(mem => (
                              <div key={mem.id} className="p-4 border border-error/20 bg-error/5 rounded-lg">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1"><p className="text-text-primary">{mem.content}</p><p className="text-sm text-error/80 mt-2">{mem.reason}</p></div>
                                  <button onClick={() => handleDeleteLowValue(mem.id)} className="p-2 text-error hover:bg-error/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
