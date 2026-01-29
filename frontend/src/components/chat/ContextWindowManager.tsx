'use client';

import { useState, useEffect } from 'react';
import { context, ContextAnalysis, MessageGroup } from '@/lib/api';
import { 
  Database, 
  Trash2, 
  FileText, 
  ChevronDown, 
  ChevronRight,
  Loader2,
  AlertTriangle,
  Sparkles,
  X,
  Check
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ContextWindowManagerProps {
  chatId: string;
  model: string;
  onMessagesDeleted?: () => void;
}

export default function ContextWindowManager({ 
  chatId, 
  model,
  onMessagesDeleted 
}: ContextWindowManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<ContextAnalysis | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [summarizingGroups, setSummarizingGroups] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadAnalysis = async () => {
    setIsLoading(true);
    try {
      const data = await context.analyzeChat(chatId);
      setAnalysis(data);
    } catch (err) {
      console.error('Failed to analyze context:', err);
      toast.error('Failed to analyze context');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !analysis) {
      loadAnalysis();
    }
  }, [isOpen, chatId]);

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

  const summarizeGroup = async (group: MessageGroup) => {
    if (summarizingGroups.has(group.id)) return;
    
    setSummarizingGroups(prev => new Set(prev).add(group.id));
    
    try {
      const result = await context.summarizeGroup(chatId, group.id);
      setSummaries(prev => ({ ...prev, [group.id]: result.summary }));
      toast.success(`Summarized: saved ${result.original_tokens - result.summary_tokens} tokens`);
    } catch (err) {
      console.error('Failed to summarize:', err);
      toast.error('Failed to generate summary');
    } finally {
      setSummarizingGroups(prev => {
        const newSet = new Set(prev);
        newSet.delete(group.id);
        return newSet;
      });
    }
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

  const deleteSelectedGroups = async () => {
    if (!analysis || selectedGroups.size === 0) return;
    
    // Gather all message IDs from selected groups
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
      
      // Reload analysis and notify parent
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

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return tokens.toString();
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        title="Context Window Manager"
      >
        <Database className="w-3.5 h-3.5" />
        <span>Context</span>
      </button>
    );
  }

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
              {/* Usage Bar */}
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
                <div className="h-3 bg-surface rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getUsageColor(analysis.usage_percent)} transition-all`}
                    style={{ width: `${Math.min(100, analysis.usage_percent)}%` }}
                  />
                </div>
                {analysis.usage_percent > 75 && (
                  <p className="text-xs text-warning mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Context window is getting full. Consider removing old messages.
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
                        Delete {selectedGroups.size} groups
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    {analysis.groups.map((group, idx) => (
                      <div 
                        key={group.id}
                        className={`bg-surface border rounded-lg overflow-hidden transition-colors ${
                          selectedGroups.has(group.id) ? 'border-accent' : 'border-border'
                        }`}
                      >
                        <div className="flex items-center gap-2 p-3">
                          <input
                            type="checkbox"
                            checked={selectedGroups.has(group.id)}
                            onChange={() => toggleSelectGroup(group.id)}
                            className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                            disabled={idx === analysis.groups.length - 1} // Can't delete most recent
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
                              <p className="text-sm text-text-primary truncate">
                                {group.title}
                              </p>
                              <p className="text-xs text-text-muted">
                                {group.message_count} messages · {formatTokens(group.token_count)} tokens
                              </p>
                            </div>
                          </button>
                          
                          <button
                            onClick={() => summarizeGroup(group)}
                            disabled={summarizingGroups.has(group.id)}
                            className="p-1.5 text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-50"
                            title="Generate summary"
                          >
                            {summarizingGroups.has(group.id) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Sparkles className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        
                        {expandedGroups.has(group.id) && (
                          <div className="px-3 pb-3 pt-1 border-t border-border">
                            {summaries[group.id] ? (
                              <div className="p-2 bg-bg-tertiary rounded text-sm text-text-secondary">
                                <p className="text-xs text-accent mb-1 font-medium">Summary:</p>
                                {summaries[group.id]}
                              </div>
                            ) : (
                              <p className="text-xs text-text-muted">
                                Click the sparkle icon to generate a summary of this conversation segment.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  <p className="text-xs text-text-muted mt-2">
                    💡 Delete older message groups to free up context space while keeping recent conversations.
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
              Are you sure you want to delete {selectedGroups.size} message groups? 
              This will permanently remove the messages from this conversation.
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
