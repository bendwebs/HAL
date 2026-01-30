'use client';

import { useState, useEffect } from 'react';
import { context, ContextAnalysis, MessageGroup, SummarizePreview } from '@/lib/api';
import { 
  Database, 
  Trash2, 
  ChevronDown, 
  ChevronRight,
  Loader2,
  AlertTriangle,
  Sparkles,
  X,
  Check,
  FileText
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ContextWindowManagerProps {
  chatId: string;
  model: string;
  onMessagesDeleted?: () => void;
  refreshTrigger?: number; // Increment this to trigger a refresh
}

export default function ContextWindowManager({ 
  chatId, 
  model,
  onMessagesDeleted,
  refreshTrigger = 0
}: ContextWindowManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<ContextAnalysis | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  // Summarization state (for individual groups)
  const [summarizingGroup, setSummarizingGroup] = useState<string | null>(null);
  const [summarizePreview, setSummarizePreview] = useState<SummarizePreview | null>(null);
  const [applyingSummary, setApplyingSummary] = useState(false);
  
  // Summarize All state
  const [summarizingAll, setSummarizingAll] = useState(false);
  const [summarizeAllPreview, setSummarizeAllPreview] = useState<{
    summary: string;
    original_tokens: number;
    summary_tokens: number;
    tokens_saved: number;
    original_message_count: number;
    message_ids: string[];
  } | null>(null);
  const [applyingAllSummary, setApplyingAllSummary] = useState(false);

  const loadAnalysis = async () => {
    if (!chatId) return;
    
    setIsLoading(true);
    try {
      const data = await context.analyzeChat(chatId);
      setAnalysis(data);
    } catch (err) {
      console.error('[ContextWindowManager] Failed to analyze context:', err);
      if (isOpen) {
        toast.error('Failed to analyze context');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Load on mount and when chatId changes
  useEffect(() => {
    loadAnalysis();
  }, [chatId]);

  // Reload when modal opens
  useEffect(() => {
    if (isOpen) {
      loadAnalysis();
    }
  }, [isOpen]);

  // Reload when refreshTrigger changes (e.g., after sending a message)
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadAnalysis();
    }
  }, [refreshTrigger]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const toggleSelectGroup = (groupId: string) => {
    setSelectedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  // Preview summarization for a group
  const handleSummarizeClick = async (group: MessageGroup) => {
    if (group.is_summary) {
      toast.error('This group is already a summary');
      return;
    }
    
    setSummarizingGroup(group.id);
    setSummarizePreview(null);
    
    try {
      const preview = await context.previewSummarize(chatId, group.id);
      setSummarizePreview(preview);
      // Auto-expand the group to show the preview
      setExpandedGroups(prev => new Set(prev).add(group.id));
    } catch (err) {
      console.error('Failed to generate summary preview:', err);
      toast.error('Failed to generate summary');
      setSummarizingGroup(null);
    }
  };

  // Apply the summarization with selected mode
  const handleApplySummary = async (mode: 'replace' | 'context_only') => {
    if (!summarizePreview || !summarizingGroup) return;
    
    setApplyingSummary(true);
    
    try {
      const result = await context.applySummarize(
        chatId,
        summarizingGroup,
        summarizePreview.summary,
        summarizePreview.messages_to_delete,
        mode
      );
      
      if (mode === 'replace') {
        toast.success(`Saved ${result.tokens_saved} tokens! Messages replaced with summary.`);
      } else {
        toast.success(`Saved ${result.tokens_saved} tokens! Messages hidden from AI but still visible.`);
      }
      
      // Clear state and reload
      setSummarizePreview(null);
      setSummarizingGroup(null);
      await loadAnalysis();
      onMessagesDeleted?.();
    } catch (err) {
      console.error('Failed to apply summary:', err);
      toast.error('Failed to apply summary');
    } finally {
      setApplyingSummary(false);
    }
  };

  // Cancel summarization preview
  const handleCancelSummary = () => {
    setSummarizePreview(null);
    setSummarizingGroup(null);
  };

  // Summarize All handlers
  const handleSummarizeAllClick = async () => {
    setSummarizingAll(true);
    setSummarizeAllPreview(null);
    
    try {
      const preview = await context.previewSummarizeAll(chatId);
      setSummarizeAllPreview(preview);
    } catch (err) {
      console.error('Failed to generate summary preview:', err);
      toast.error('Failed to generate summary');
    } finally {
      setSummarizingAll(false);
    }
  };

  const handleApplyAllSummary = async (mode: 'replace' | 'context_only') => {
    if (!summarizeAllPreview) return;
    
    setApplyingAllSummary(true);
    
    try {
      const result = await context.applySummarizeAll(
        chatId,
        summarizeAllPreview.summary,
        summarizeAllPreview.message_ids,
        mode
      );
      
      if (mode === 'replace') {
        toast.success(`Saved ${result.tokens_saved} tokens! Entire conversation replaced with summary.`);
      } else {
        toast.success(`Saved ${result.tokens_saved} tokens! Messages hidden from AI but still visible.`);
      }
      
      setSummarizeAllPreview(null);
      await loadAnalysis();
      onMessagesDeleted?.();
    } catch (err) {
      console.error('Failed to apply summary:', err);
      toast.error('Failed to apply summary');
    } finally {
      setApplyingAllSummary(false);
    }
  };

  const handleCancelAllSummary = () => {
    setSummarizeAllPreview(null);
  };

  const deleteSelectedGroups = async () => {
    if (!analysis || selectedGroups.size === 0) return;
    
    const messageIds: string[] = [];
    for (const groupId of selectedGroups) {
      const group = analysis.groups.find(g => g.id === groupId);
      if (group) {
        messageIds.push(...group.message_ids);
      }
    }
    
    try {
      await context.deleteMessages(chatId, messageIds);
      toast.success(`Deleted ${messageIds.length} messages`);
      setSelectedGroups(new Set());
      setConfirmDelete(false);
      await loadAnalysis();
      onMessagesDeleted?.();
    } catch (err) {
      console.error('Failed to delete messages:', err);
      toast.error('Failed to delete messages');
    }
  };

  const getUsageColor = (percent: number) => {
    if (percent < 50) return 'bg-green-500';
    if (percent < 75) return 'bg-yellow-500';
    if (percent < 90) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getUsageTextColor = (percent: number) => {
    if (percent < 50) return 'text-green-500';
    if (percent < 75) return 'text-yellow-500';
    if (percent < 90) return 'text-orange-500';
    return 'text-red-500';
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return tokens.toString();
  };

  // Calculate what context would look like after applying summary
  const getProjectedAnalysis = () => {
    if (!analysis) return null;
    
    // Check for individual group summarization preview
    if (summarizePreview) {
      const newTotal = analysis.total_tokens - summarizePreview.tokens_saved;
      const newPercent = (newTotal / analysis.max_tokens * 100);
      return {
        total_tokens: newTotal,
        usage_percent: Math.round(newPercent * 10) / 10
      };
    }
    
    // Check for summarize all preview
    if (summarizeAllPreview) {
      const newTotal = analysis.total_tokens - summarizeAllPreview.tokens_saved;
      const newPercent = (newTotal / analysis.max_tokens * 100);
      return {
        total_tokens: newTotal,
        usage_percent: Math.round(newPercent * 10) / 10
      };
    }
    
    return null;
  };

  // Inline button with token usage bar (shown when modal is closed)
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-2 py-1 text-xs text-text-muted hover:text-text-secondary hover:bg-surface/50 rounded-lg transition-colors"
        title={analysis ? `${formatTokens(analysis.total_tokens)} / ${formatTokens(analysis.max_tokens)} tokens (${analysis.usage_percent}%)` : 'Context Window Manager'}
      >
        <Database className="w-3.5 h-3.5" />
        <span>Context</span>
        
        {analysis && (
          <div className="flex items-center gap-1.5 ml-1">
            <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden">
              <div 
                className={`h-full ${getUsageColor(analysis.usage_percent)} transition-all`}
                style={{ width: `${Math.min(100, analysis.usage_percent)}%` }}
              />
            </div>
            <span className={`text-[10px] font-medium ${getUsageTextColor(analysis.usage_percent)}`}>
              {analysis.usage_percent}%
            </span>
          </div>
        )}
        
        {isLoading && !analysis && (
          <Loader2 className="w-3 h-3 animate-spin ml-1" />
        )}
      </button>
    );
  }

  const projected = getProjectedAnalysis();

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40"
        onClick={() => setIsOpen(false)}
      />
      
      {/* Modal */}
      <div className="fixed right-4 top-20 w-full max-w-md max-h-[80vh] bg-bg-elevated border border-border rounded-xl shadow-lg z-50 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-accent" />
            <h3 className="font-semibold text-text-primary">Context Window</h3>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-surface rounded transition-colors"
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
          ) : analysis ? (
            <div className="space-y-4">
              {/* Usage Bar - shows current and projected if summarizing */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-text-secondary">
                    {formatTokens(analysis.total_tokens)} / {formatTokens(analysis.max_tokens)} tokens
                  </span>
                  <span className={`text-sm font-medium ${
                    analysis.usage_percent > 90 ? 'text-error' : 
                    analysis.usage_percent > 75 ? 'text-warning' : 'text-text-primary'
                  }`}>
                    {analysis.usage_percent}%
                  </span>
                </div>
                
                {/* Current usage bar */}
                <div className="h-3 bg-surface rounded-full overflow-hidden relative">
                  <div 
                    className={`h-full ${getUsageColor(analysis.usage_percent)} transition-all`}
                    style={{ width: `${Math.min(100, analysis.usage_percent)}%` }}
                  />
                </div>

                {/* Projected usage after summarization */}
                {projected && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-green-500 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        After summarization
                      </span>
                      <span className="text-xs text-green-500 font-medium">
                        {formatTokens(projected.total_tokens)} ({projected.usage_percent}%)
                      </span>
                    </div>
                    <div className="h-2 bg-surface rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500 transition-all"
                        style={{ width: `${Math.min(100, projected.usage_percent)}%` }}
                      />
                    </div>
                    <p className="text-xs text-green-500 mt-1">
                      💾 Will save {formatTokens(summarizePreview?.tokens_saved || summarizeAllPreview?.tokens_saved || 0)} tokens
                    </p>
                  </div>
                )}
                
                {analysis.usage_percent > 75 && !projected && (
                  <p className="text-xs text-warning mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Context window is getting full. Consider summarizing old messages.
                  </p>
                )}
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-surface rounded-lg">
                  <p className="text-text-muted text-xs mb-1">System Prompt</p>
                  <p className="text-text-primary font-medium">
                    {formatTokens(analysis.system_prompt_tokens)} tokens
                  </p>
                </div>
                <div className="p-3 bg-surface rounded-lg">
                  <p className="text-text-muted text-xs mb-1">Messages</p>
                  <p className="text-text-primary font-medium">
                    {analysis.message_count} ({formatTokens(analysis.messages_tokens)} tokens)
                  </p>
                </div>
              </div>
              
              {/* Model Info */}
              <div className="p-3 bg-surface rounded-lg text-sm">
                <p className="text-text-muted text-xs mb-1">Model</p>
                <p className="text-text-primary">{analysis.model}</p>
              </div>

              {/* Message Groups */}
              {analysis.groups.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-text-primary">Message Groups</h4>
                    {selectedGroups.size > 0 && (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-error/10 text-error hover:bg-error/20 rounded transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete {selectedGroups.size}
                      </button>
                    )}
                  </div>
                  
                  {/* Summarize All Section */}
                  <div className={`mb-3 p-3 rounded-lg border ${summarizeAllPreview ? 'bg-purple-500/10 border-purple-500/30' : 'bg-surface border-border'}`}>
                    {!summarizeAllPreview ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-text-primary">Summarize Entire Conversation</p>
                          <p className="text-xs text-text-muted">Compress all {analysis.message_count} messages into one summary</p>
                        </div>
                        <button
                          onClick={handleSummarizeAllClick}
                          disabled={summarizingAll || analysis.groups.every(g => g.is_summary)}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          {summarizingAll ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4" />
                          )}
                          {summarizingAll ? 'Generating...' : 'Summarize All'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-purple-400">📝 Full Conversation Summary Preview</p>
                          <button
                            onClick={handleCancelAllSummary}
                            className="p-1 hover:bg-surface rounded"
                          >
                            <X className="w-4 h-4 text-text-muted" />
                          </button>
                        </div>
                        
                        <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg max-h-40 overflow-y-auto">
                          <p className="text-sm text-text-secondary whitespace-pre-wrap">{summarizeAllPreview.summary}</p>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="p-2 bg-bg-tertiary rounded text-center">
                            <p className="text-text-muted">Before</p>
                            <p className="text-text-primary font-medium">{formatTokens(summarizeAllPreview.original_tokens)}</p>
                          </div>
                          <div className="p-2 bg-bg-tertiary rounded text-center">
                            <p className="text-text-muted">After</p>
                            <p className="text-purple-400 font-medium">{formatTokens(summarizeAllPreview.summary_tokens)}</p>
                          </div>
                          <div className="p-2 bg-purple-500/10 rounded text-center">
                            <p className="text-purple-400">Saved</p>
                            <p className="text-purple-400 font-medium">{formatTokens(summarizeAllPreview.tokens_saved)}</p>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <button
                            onClick={() => handleApplyAllSummary('context_only')}
                            disabled={applyingAllSummary}
                            className="w-full px-3 py-2 text-sm bg-accent hover:bg-accent/80 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            {applyingAllSummary ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Keep Messages, Hide from AI
                          </button>
                          <button
                            onClick={() => handleApplyAllSummary('replace')}
                            disabled={applyingAllSummary}
                            className="w-full px-3 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            {applyingAllSummary ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            Replace All with Summary
                          </button>
                          <p className="text-[10px] text-text-muted text-center">
                            {summarizeAllPreview.original_message_count} messages → 1 summary
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    {analysis.groups.map((group, idx) => {
                      const isLastGroup = idx === analysis.groups.length - 1;
                      const isSummarizing = summarizingGroup === group.id;
                      const hasPreview = isSummarizing && summarizePreview;
                      
                      return (
                        <div 
                          key={group.id}
                          className={`bg-surface border rounded-lg overflow-hidden transition-colors ${
                            selectedGroups.has(group.id) ? 'border-accent' : 
                            hasPreview ? 'border-green-500' : 'border-border'
                          }`}
                        >
                          <div className="flex items-center gap-2 p-3">
                            <input
                              type="checkbox"
                              checked={selectedGroups.has(group.id)}
                              onChange={() => toggleSelectGroup(group.id)}
                              className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                              title="Select to delete"
                            />

                            <button
                              onClick={() => toggleGroup(group.id)}
                              className="flex-1 flex items-center gap-2 text-left"
                            >
                              {expandedGroups.has(group.id) ? (
                                <ChevronDown className="w-4 h-4 text-text-muted" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-text-muted" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-text-primary truncate flex items-center gap-1">
                                  {group.is_summary && <FileText className="w-3 h-3 text-accent" />}
                                  {group.title}
                                </p>
                                <p className="text-xs text-text-muted">
                                  {group.message_count} messages · {formatTokens(group.token_count)} tokens
                                </p>
                              </div>
                            </button>

                            {/* Summarize button - disabled for already summarized groups */}
                            {!group.is_summary && (
                              <button
                                onClick={() => handleSummarizeClick(group)}
                                disabled={isSummarizing && !hasPreview}
                                className="p-1.5 text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-50"
                                title="Summarize this group"
                              >
                                {isSummarizing && !hasPreview ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Sparkles className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>

                          {/* Expanded content with preview */}
                          {expandedGroups.has(group.id) && (
                            <div className="px-3 pb-3 pt-1 border-t border-border">
                              {hasPreview ? (
                                <div className="space-y-3">
                                  {/* Summary Preview */}
                                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                                    <p className="text-xs text-green-500 font-medium mb-2">📝 Summary Preview:</p>
                                    <p className="text-sm text-text-secondary">{summarizePreview.summary}</p>
                                  </div>
                                  
                                  {/* Stats */}
                                  <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div className="p-2 bg-bg-tertiary rounded text-center">
                                      <p className="text-text-muted">Before</p>
                                      <p className="text-text-primary font-medium">{formatTokens(summarizePreview.original_tokens)}</p>
                                    </div>
                                    <div className="p-2 bg-bg-tertiary rounded text-center">
                                      <p className="text-text-muted">After</p>
                                      <p className="text-green-500 font-medium">{formatTokens(summarizePreview.summary_tokens)}</p>
                                    </div>
                                    <div className="p-2 bg-green-500/10 rounded text-center">
                                      <p className="text-green-500">Saved</p>
                                      <p className="text-green-500 font-medium">{formatTokens(summarizePreview.tokens_saved)}</p>
                                    </div>
                                  </div>
                                  
                                  {/* Actions */}
                                  <div className="space-y-2">
                                    <button
                                      onClick={handleCancelSummary}
                                      disabled={applyingSummary}
                                      className="w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface rounded-lg transition-colors"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleApplySummary('context_only')}
                                      disabled={applyingSummary}
                                      className="w-full px-3 py-2 text-sm bg-accent hover:bg-accent/80 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                      {applyingSummary ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Check className="w-4 h-4" />
                                      )}
                                      Keep Messages, Hide from AI
                                    </button>
                                    <button
                                      onClick={() => handleApplySummary('replace')}
                                      disabled={applyingSummary}
                                      className="w-full px-3 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                      {applyingSummary ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="w-4 h-4" />
                                      )}
                                      Replace with Summary
                                    </button>
                                    <p className="text-[10px] text-text-muted text-center">
                                      "Keep Messages" preserves chat history but uses summary for AI context
                                    </p>
                                  </div>
                                </div>
                              ) : group.is_summary ? (
                                <p className="text-xs text-accent">
                                  This group contains a summarized conversation.
                                </p>
                              ) : (
                                <p className="text-xs text-text-muted">
                                  Click the ✨ icon to generate a summary preview. You can review before applying.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  <p className="text-xs text-text-muted mt-2">
                    💡 Summarize older groups to compress context while preserving key information.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-text-muted py-8">
              Failed to load context analysis
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <button
            onClick={loadAnalysis}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-surface hover:bg-surface-hover text-text-primary rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Analyzing...' : 'Refresh Analysis'}
          </button>
        </div>
      </div>
      
      {/* Delete Confirmation */}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => setConfirmDelete(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-bg-elevated border border-border rounded-xl shadow-lg z-[70] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-error/10 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-error" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">Delete Messages</h3>
            </div>
            
            <p className="text-text-secondary mb-4">
              Are you sure you want to delete {selectedGroups.size} message group(s)? 
              This will permanently remove the messages.
            </p>
            
            <p className="text-xs text-text-muted mb-6">
              The AI will no longer have access to this conversation history.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteSelectedGroups}
                className="px-4 py-2 bg-error hover:bg-error/80 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
