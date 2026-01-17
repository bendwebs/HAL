'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X, FileText, Check } from 'lucide-react';
import { documents } from '@/lib/api';

interface Document {
  id: string;
  filename: string;
  original_filename: string;
  status: string;
}

interface ChatInputProps {
  onSend: (content: string, documentIds: string[]) => void;
  disabled?: boolean;
  canWrite?: boolean;
}

export default function ChatInput({ onSend, disabled, canWrite = true }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [attachedDocs, setAttachedDocs] = useState<{ id: string; name: string }[]>([]);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [availableDocs, setAvailableDocs] = useState<Document[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowDocPicker(false);
      }
    };
    
    if (showDocPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDocPicker]);

  const loadDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const data = await documents.list();
      setAvailableDocs(data.documents.filter((d: Document) => d.status === 'ready'));
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const openDocPicker = () => {
    setShowDocPicker(true);
    loadDocuments();
  };

  const toggleDocSelection = (doc: Document) => {
    const isSelected = attachedDocs.some(d => d.id === doc.id);
    if (isSelected) {
      setAttachedDocs(prev => prev.filter(d => d.id !== doc.id));
    } else {
      setAttachedDocs(prev => [...prev, { id: doc.id, name: doc.original_filename }]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || disabled || !canWrite) return;
    
    onSend(message.trim(), attachedDocs.map(d => d.id));
    setMessage('');
    setAttachedDocs([]);
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  const removeAttachment = (id: string) => {
    setAttachedDocs(prev => prev.filter(d => d.id !== id));
  };

  if (!canWrite) {
    return (
      <div className="border-t border-border bg-bg-secondary p-4">
        <div className="max-w-3xl mx-auto text-center text-text-muted text-sm">
          You have read-only access to this chat
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-bg-secondary p-4 flex-shrink-0">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
        {/* Attached documents */}
        {attachedDocs.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachedDocs.map(doc => (
              <div
                key={doc.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-sm"
              >
                <FileText className="w-3 h-3" />
                <span className="truncate max-w-[150px]">{doc.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(doc.id)}
                  className="hover:text-error transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex items-end gap-3">
          {/* Attach button */}
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              className={`p-3 rounded-lg transition-colors ${
                attachedDocs.length > 0 
                  ? 'text-accent bg-accent/10' 
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface'
              }`}
              title="Attach document from library"
              onClick={openDocPicker}
            >
              <Paperclip className="w-5 h-5" />
            </button>
            
            {/* Document picker dropdown */}
            {showDocPicker && (
              <div className="absolute bottom-full left-0 mb-2 w-72 max-h-64 overflow-y-auto bg-bg-elevated border border-border rounded-xl shadow-lg z-50">
                <div className="p-3 border-b border-border">
                  <h3 className="font-medium text-text-primary text-sm">Attach Documents</h3>
                  <p className="text-xs text-text-muted mt-0.5">Select documents to include in context</p>
                </div>
                
                {isLoadingDocs ? (
                  <div className="p-4 text-center text-text-muted text-sm">Loading...</div>
                ) : availableDocs.length === 0 ? (
                  <div className="p-4 text-center text-text-muted text-sm">
                    No documents in library
                  </div>
                ) : (
                  <div className="p-2">
                    {availableDocs.map(doc => {
                      const isSelected = attachedDocs.some(d => d.id === doc.id);
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => toggleDocSelection(doc)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                            isSelected 
                              ? 'bg-accent/10 text-accent' 
                              : 'hover:bg-surface text-text-secondary'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                            isSelected 
                              ? 'bg-accent border-accent' 
                              : 'border-border'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <FileText className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate text-sm">{doc.original_filename}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                
                <div className="p-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowDocPicker(false)}
                    className="w-full px-3 py-2 text-sm text-accent hover:bg-accent/10 rounded-lg transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {/* Input */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder={attachedDocs.length > 0 ? "Ask about your documents..." : "Message HAL..."}
              disabled={disabled}
              rows={1}
              className="w-full px-4 py-3 bg-bg-tertiary border border-border rounded-xl text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
              style={{ maxHeight: '200px' }}
            />
          </div>
          
          {/* Send button */}
          <button
            type="submit"
            disabled={!message.trim() || disabled}
            className="p-3 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        
        <p className="text-xs text-text-muted text-center mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </form>
    </div>
  );
}
