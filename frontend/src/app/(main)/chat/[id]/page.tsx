'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { chats as chatsApi, messages as messagesApi, memories as memoriesApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { Chat, Message, StreamChunk } from '@/types';
import ChatMessage from '@/components/chat/ChatMessage';
import ChatInput from '@/components/chat/ChatInput';
import ChatHeader from '@/components/chat/ChatHeader';
import { Loader2, Brain, Sparkles, X, Check, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = params.id as string;
  
  const { user } = useAuthStore();
  const { showThinking, showActions, refreshChatList } = useUIStore();
  
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<Partial<Message> | null>(null);
  const [memoriesUsed, setMemoriesUsed] = useState<any[]>([]);
  const [pendingMemories, setPendingMemories] = useState<string[]>([]);
  const [isSavingMemories, setIsSavingMemories] = useState(false);
  const streamingMessageRef = useRef<Partial<Message> | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadChat();
  }, [chatId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const loadChat = async () => {
    try {
      setIsLoading(true);
      const [chatData, messagesData] = await Promise.all([
        chatsApi.get(chatId),
        messagesApi.list(chatId),
      ]);
      setChat(chatData);
      setMessages(messagesData);
    } catch (err) {
      console.error('Failed to load chat:', err);
      router.push('/chat');
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (content: string, documentIds: string[] = []) => {
    if (!content.trim() || isSending) return;

    // Add user message immediately
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      chat_id: chatId,
      role: 'user',
      content,
      thinking: null,
      actions: [],
      document_ids: documentIds,
      model_used: null,
      token_usage: null,
      created_at: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsSending(true);
    
    // Initialize streaming message
    const initialStreamingMsg: Partial<Message> = {
      id: `streaming-${Date.now()}`,
      chat_id: chatId,
      role: 'assistant',
      content: '',
      thinking: null,
      actions: [],
      document_ids: [],
      model_used: null,
      token_usage: null,
      created_at: new Date().toISOString(),
    };
    streamingMessageRef.current = initialStreamingMsg;
    setStreamingMessage(initialStreamingMsg);
    setMemoriesUsed([]);
    setPendingMemories([]);

    try {
      for await (const chunk of messagesApi.sendStream(chatId, content, documentIds)) {
        handleStreamChunk(chunk as StreamChunk);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setStreamingMessage(prev => prev ? {
        ...prev,
        content: prev.content + '\n\n*Error: Failed to get response. Please try again.*',
      } : null);
    } finally {
      setIsSending(false);
    }
  };

  const handleStreamChunk = (chunk: StreamChunk) => {
    // Handle events that don't require streaming message state first
    if (chunk.type === 'title_updated') {
      console.log('[DEBUG] title_updated received:', chunk.data.title);
      if (chunk.data.title) {
        setChat(prev => prev ? { ...prev, title: chunk.data.title } : null);
        console.log('[DEBUG] Calling refreshChatList() directly from store');
        useUIStore.getState().refreshChatList();
      }
      return;
    }
    
    if (chunk.type === 'memories_used') {
      setMemoriesUsed(chunk.data.memories || []);
      return;
    }
    
    if (chunk.type === 'memories_pending') {
      console.log('[DEBUG] Received memories_pending:', chunk.data);
      setPendingMemories(chunk.data.memories || []);
      return;
    }

    // All other events require streaming message state
    const current = streamingMessageRef.current;
    if (!current) return;

    switch (chunk.type) {
      case 'thinking':
        streamingMessageRef.current = { ...current, thinking: chunk.data.content || '' };
        setStreamingMessage(streamingMessageRef.current);
        break;
        
      case 'content':
        streamingMessageRef.current = { 
          ...current, 
          content: (current.content || '') + (chunk.data.delta || '') 
        };
        setStreamingMessage(streamingMessageRef.current);
        break;
        
      case 'action_complete':
        streamingMessageRef.current = { 
          ...current, 
          actions: [...(current.actions || []), chunk.data as MessageAction] 
        };
        setStreamingMessage(streamingMessageRef.current);
        break;
        
      case 'done':
        streamingMessageRef.current = { 
          ...current, 
          model_used: chunk.data.model,
          token_usage: chunk.data.token_usage 
        };
        setStreamingMessage(streamingMessageRef.current);
        break;
        
      case 'saved':
        // Message has been saved - move from streaming to messages list
        const finalMessage: Message = {
          ...streamingMessageRef.current,
          id: chunk.data.message_id,
        } as Message;
        streamingMessageRef.current = null;
        setStreamingMessage(null);
        setMessages(msgs => [...msgs, finalMessage]);
        break;
        
      case 'error':
        streamingMessageRef.current = { 
          ...current, 
          content: (current.content || '') + `\n\n*Error: ${chunk.data.message}*` 
        };
        setStreamingMessage(streamingMessageRef.current);
        break;
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-text-secondary">Chat not found</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <ChatHeader chat={chat} onUpdate={setChat} />
      
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && !streamingMessage && (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">🤖</div>
              <h2 className="text-xl font-semibold text-text-primary mb-2">
                How can I help you?
              </h2>
              <p className="text-text-secondary">
                Ask me anything or upload documents for analysis
              </p>
            </div>
          )}
          
          {messages.map(message => (
            <ChatMessage
              key={message.id}
              message={message}
              showThinking={showThinking}
              showActions={showActions}
              ttsEnabled={chat.tts_enabled}
              ttsVoiceId={chat.tts_voice_id || undefined}
            />
          ))}
          
          {streamingMessage && (
            <ChatMessage
              message={streamingMessage as Message}
              showThinking={showThinking}
              showActions={showActions}
              isStreaming
              ttsEnabled={chat.tts_enabled}
              ttsVoiceId={chat.tts_voice_id || undefined}
            />
          )}
          
          {/* Memory Usage Indicator */}
          {memoriesUsed.length > 0 && !isSending && (
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <Brain className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <p className="text-sm text-purple-300">
                  Used memories
                </p>
                <button 
                  onClick={() => setMemoriesUsed([])}
                  className="ml-auto p-1 text-text-muted hover:text-text-primary"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
          
          {/* Pending Memories Confirmation */}
          {pendingMemories.length > 0 && !isSending && (
            <div className="max-w-3xl mx-auto">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-amber-300 font-medium mb-2">
                      Should I remember this?
                    </p>
                    <div className="space-y-2 mb-3">
                      {pendingMemories.map((memory, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-bg-secondary/50 rounded">
                          <p className="text-sm text-text-primary flex-1">{memory}</p>
                          <button
                            onClick={() => setPendingMemories(prev => prev.filter((_, idx) => idx !== i))}
                            className="p-1 text-text-muted hover:text-error"
                            title="Remove this memory"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          setIsSavingMemories(true);
                          try {
                            await memoriesApi.confirm(pendingMemories, { chat_id: chatId });
                            toast.success(`Saved ${pendingMemories.length} memories`);
                            setPendingMemories([]);
                          } catch (err) {
                            console.error('Failed to save memories:', err);
                            toast.error('Failed to save memories');
                          } finally {
                            setIsSavingMemories(false);
                          }
                        }}
                        disabled={isSavingMemories}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {isSavingMemories ? 'Saving...' : 'Yes, Remember'}
                      </button>
                      <button
                        onClick={() => setPendingMemories([])}
                        disabled={isSavingMemories}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-surface-hover text-text-secondary text-sm rounded-lg transition-colors disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        No, Skip
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>
      
      <ChatInput
        onSend={handleSendMessage}
        disabled={isSending}
        canWrite={chat.can_write}
      />
    </div>
  );
}
