'use client';

import { useState, useEffect } from 'react';
import { memories } from '@/lib/api';
import { 
  Brain, Plus, Trash2, Search, Tag, Edit2, X, Check,
  Sparkles, Clock, AlertCircle, RefreshCw, Layers, Merge,
  ChevronDown, ChevronRight, Zap
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
  memories: Array<{ id: string; content: string }>;
  similarity: number;
  suggested_merge: string;
}

export default function MemoriesPage() {
  const [memoryList, setMemoryList] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Memory[] | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [newContent, setNewContent] = useState('');
  
  // Consolidation state
  const [showConsolidateModal, setShowConsolidateModal] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [similarityThreshold, setSimilarityThreshold] = useState(0.85);
  const [mergeContent, setMergeContent] = useState<Record<number, string>>({});

  useEffect(() => {
    loadMemories();
  }, []);

  const loadMemories = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await memories.list({ limit: 100 });
      setMemoryList(data.memories || []);
    } catch (err: any) {
      console.error('Failed to load memories:', err);
      if (err.status === 503) {
        setError('Memory system not available. Please install mem0ai package.');
      } else if (err.message?.includes('fetch') || err.name === 'TypeError') {
        setError('Unable to connect to server. Please refresh the page.');
      } else {
        setError('Failed to load memories');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    
    try {
      const data = await memories.search(searchQuery);
      setSearchResults(data.results || []);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleAddMemory = async () => {
    if (!newContent.trim()) return;
    
    try {
      await memories.create({ content: newContent });
      setShowAddModal(false);
      setNewContent('');
      loadMemories();
      toast.success('Memory added');
    } catch (err) {
      console.error('Failed to add memory:', err);
      toast.error('Failed to add memory');
    }
  };

  const handleUpdateMemory = async (id: string) => {
    if (!editContent.trim()) return;
    
    try {
      await memories.update(id, { content: editContent });
      setEditingId(null);
      setEditContent('');
      loadMemories();
      toast.success('Memory updated');
    } catch (err) {
      console.error('Failed to update memory:', err);
      toast.error('Failed to update memory');
    }
  };

  const handleDelete = async (id: string) => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Delete this memory?</p>
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
              try {
                await memories.delete(id);
                setMemoryList(memoryList.filter(m => m.id !== id));
                if (searchResults) {
                  setSearchResults(searchResults.filter(m => m.id !== id));
                }
                toast.success('Memory deleted');
              } catch (err) {
                console.error('Failed to delete memory:', err);
                toast.error('Failed to delete memory');
              }
            }}
            className="px-3 py-1.5 text-sm bg-error hover:bg-error/80 text-white rounded-lg transition-colors"
          >
            Delete
          </button>
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
          <button
            onClick={() => toast.dismiss(t.id)}
            className="px-3 py-1.5 text-sm bg-surface hover:bg-bg-tertiary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await memories.deleteAll();
                setMemoryList([]);
                setSearchResults(null);
                toast.success('All memories deleted');
              } catch (err) {
                console.error('Failed to delete all memories:', err);
                toast.error('Failed to delete memories');
              }
            }}
            className="px-3 py-1.5 text-sm bg-error hover:bg-error/80 text-white rounded-lg transition-colors"
          >
            Delete All
          </button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const startEditing = (memory: Memory) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
  };

  // Consolidation functions
  const analyzeForDuplicates = async () => {
    setIsAnalyzing(true);
    try {
      const result = await memories.consolidate(similarityThreshold, true);
      setDuplicateGroups(result.groups || []);
      setExpandedGroups(new Set());
      // Initialize merge content with suggestions
      const initialMerge: Record<number, string> = {};
      result.groups?.forEach((g, i) => {
        initialMerge[i] = g.suggested_merge;
      });
      setMergeContent(initialMerge);
      
      if (result.groups?.length === 0) {
        toast.success('No duplicates found!');
      }
    } catch (err) {
      console.error('Failed to analyze memories:', err);
      toast.error('Failed to analyze memories');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleGroupExpanded = (index: number) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedGroups(newExpanded);
  };

  const handleMergeGroup = async (groupIndex: number) => {
    const group = duplicateGroups[groupIndex];
    const content = mergeContent[groupIndex] || group.suggested_merge;
    
    try {
      const memoryIds = group.memories.map(m => m.id);
      await memories.merge(memoryIds, content);
      
      // Remove this group and refresh
      setDuplicateGroups(prev => prev.filter((_, i) => i !== groupIndex));
      loadMemories();
      toast.success('Memories merged successfully');
    } catch (err) {
      console.error('Failed to merge memories:', err);
      toast.error('Failed to merge memories');
    }
  };

  const handleAutoConsolidate = async () => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Auto-consolidate all duplicates?</p>
        <p className="text-sm text-text-secondary">
          This will keep the most complete memory in each group and delete the rest.
        </p>
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
              try {
                const result = await memories.consolidate(similarityThreshold, false);
                toast.success(`Deleted ${result.deleted || 0} duplicate memories`);
                setDuplicateGroups([]);
                setShowConsolidateModal(false);
                loadMemories();
              } catch (err) {
                console.error('Failed to consolidate:', err);
                toast.error('Failed to consolidate memories');
              }
            }}
            className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
          >
            Consolidate
          </button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const displayMemories = searchResults !== null ? searchResults : memoryList;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Memories</h1>
            <p className="text-sm text-text-muted mt-1">
              {memoryList.length} memories • Powered by Mem0
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {memoryList.length > 1 && (
              <button
                onClick={() => {
                  setShowConsolidateModal(true);
                  setDuplicateGroups([]);
                }}
                className="flex items-center gap-2 px-3 py-2 text-accent hover:bg-accent/10 rounded-lg transition-colors"
                title="Find and merge duplicate memories"
              >
                <Layers className="w-4 h-4" />
                <span className="hidden sm:inline">Consolidate</span>
              </button>
            )}
            {memoryList.length > 0 && (
              <button
                onClick={handleDeleteAll}
                className="flex items-center gap-2 px-3 py-2 text-error hover:bg-error/10 rounded-lg transition-colors"
                title="Delete all memories"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Memory</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories semantically..."
              className="w-full pl-10 pr-20 py-2.5 rounded-lg bg-surface border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-14 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-accent text-white rounded text-sm"
            >
              Search
            </button>
          </div>
        </form>

        {searchResults !== null && (
          <div className="mb-4 flex items-center gap-2 text-sm text-text-muted">
            <span>Showing {searchResults.length} results for "{searchQuery}"</span>
            <button onClick={clearSearch} className="text-accent hover:underline">
              Clear search
            </button>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-error/10 border border-error/20 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-error" />
              <p className="text-error">{error}</p>
            </div>
            <button
              onClick={loadMemories}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-error/20 hover:bg-error/30 text-error rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        )}

        {/* Memories List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-surface animate-pulse rounded-xl" />
            ))}
          </div>
        ) : displayMemories.length === 0 ? (
          <div className="text-center py-12">
            <Brain className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              {searchResults !== null ? 'No matching memories' : 'No memories yet'}
            </h2>
            <p className="text-text-secondary mb-2">
              {searchResults !== null 
                ? 'Try a different search query'
                : 'Memories are automatically extracted from your conversations.'}
            </p>
            {searchResults === null && (
              <>
                <p className="text-text-muted text-sm mb-6">
                  You can also add memories manually.
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Your First Memory
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {displayMemories.map(memory => (
              <div
                key={memory.id}
                className="p-4 bg-surface border border-border rounded-xl hover:border-border-hover transition-colors"
              >
                {editingId === memory.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent resize-none"
                      rows={3}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-2 text-text-muted hover:text-text-primary rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleUpdateMemory(memory.id)}
                        className="p-2 text-accent hover:bg-accent/10 rounded-lg"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-accent/10 text-accent">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <p className="text-text-primary flex-1">{memory.content}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-sm">
                        {memory.score !== undefined && (
                          <span className="text-text-muted">
                            Score: {(memory.score * 100).toFixed(0)}%
                          </span>
                        )}
                        {memory.categories && memory.categories.length > 0 && (
                          <span className="flex items-center gap-1 text-text-muted">
                            <Tag className="w-3 h-3" />
                            {memory.categories.join(', ')}
                          </span>
                        )}
                        {memory.created_at && (
                          <span className="flex items-center gap-1 text-text-muted">
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(memory.created_at)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEditing(memory)}
                          className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(memory.id)}
                          className="p-2 text-text-muted hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Memory Modal */}
      {showAddModal && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowAddModal(false)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-elevated border border-border rounded-xl shadow-lg z-50 p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Add Memory</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  What should HAL remember?
                </label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="e.g., I prefer concise answers, I work as a software engineer..."
                  className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none"
                  rows={4}
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMemory}
                disabled={!newContent.trim()}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Add Memory
              </button>
            </div>
          </div>
        </>
      )}

      {/* Consolidate Modal */}
      {showConsolidateModal && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowConsolidateModal(false)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[80vh] bg-bg-elevated border border-border rounded-xl shadow-lg z-50 flex flex-col">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/10 text-accent">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">Consolidate Memories</h2>
                    <p className="text-sm text-text-muted">Find and merge similar memories</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowConsolidateModal(false)}
                  className="p-2 text-text-muted hover:text-text-primary rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {/* Threshold slider */}
              <div className="mb-6">
                <label className="block text-sm text-text-secondary mb-2">
                  Similarity Threshold: {Math.round(similarityThreshold * 100)}%
                </label>
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={similarityThreshold * 100}
                  onChange={(e) => setSimilarityThreshold(Number(e.target.value) / 100)}
                  className="w-full accent-accent"
                />
                <p className="text-xs text-text-muted mt-1">
                  Higher = stricter matching (fewer groups), Lower = more matches
                </p>
              </div>

              {/* Analyze button */}
              {duplicateGroups.length === 0 && (
                <button
                  onClick={analyzeForDuplicates}
                  disabled={isAnalyzing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Analyze Memories
                    </>
                  )}
                </button>
              )}

              {/* Results */}
              {duplicateGroups.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-text-secondary">
                      Found {duplicateGroups.length} groups with {duplicateGroups.reduce((sum, g) => sum + g.memories.length, 0)} similar memories
                    </p>
                    <button
                      onClick={handleAutoConsolidate}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-accent/10 hover:bg-accent/20 text-accent rounded-lg transition-colors"
                    >
                      <Zap className="w-3 h-3" />
                      Auto-consolidate All
                    </button>
                  </div>

                  {duplicateGroups.map((group, index) => (
                    <div key={index} className="border border-border rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleGroupExpanded(index)}
                        className="w-full flex items-center justify-between p-4 bg-surface hover:bg-surface-hover transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {expandedGroups.has(index) ? (
                            <ChevronDown className="w-4 h-4 text-text-muted" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-text-muted" />
                          )}
                          <span className="text-text-primary font-medium">
                            {group.memories.length} similar memories
                          </span>
                          <span className="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded-full">
                            {Math.round(group.similarity * 100)}% similar
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMergeGroup(index);
                          }}
                          className="flex items-center gap-1 px-3 py-1 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
                        >
                          <Merge className="w-3 h-3" />
                          Merge
                        </button>
                      </button>

                      {expandedGroups.has(index) && (
                        <div className="p-4 border-t border-border space-y-3">
                          {group.memories.map((mem, memIndex) => (
                            <div key={mem.id} className="p-3 bg-bg-tertiary rounded-lg">
                              <p className="text-sm text-text-primary">{mem.content}</p>
                            </div>
                          ))}
                          
                          <div className="pt-3 border-t border-border">
                            <label className="block text-sm text-text-secondary mb-2">
                              Merged content (edit if needed):
                            </label>
                            <textarea
                              value={mergeContent[index] || group.suggested_merge}
                              onChange={(e) => setMergeContent(prev => ({
                                ...prev,
                                [index]: e.target.value
                              }))}
                              className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-primary focus:outline-none focus:border-accent resize-none text-sm"
                              rows={3}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
