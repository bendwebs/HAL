'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { chats as chatsApi, messages as messagesApi, memories as memoriesApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { Chat, Message, StreamChunk, MessageAction } from '@/types';
import ChatMessage from '@/components/chat/ChatMessage';
import ChatInput from '@/components/chat/ChatInput';
import ChatHeader from '@/components/chat/ChatHeader';
import VideoPlayer, { VideoPlayerVideo } from '@/components/chat/VideoPlayer';
import { Loader2, Brain, Sparkles, X, Check, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

// YouTube video interface for tracking search results
interface YouTubeVideo {
  video_id: string;
  title: string;
  description: string;
  channel_title: string;
  thumbnail: string;
  url: string;
  embed_url: string;
  confidence?: number;
}

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
  
  // YouTube video state
  const [lastYouTubeResults, setLastYouTubeResults] = useState<YouTubeVideo[]>([]);
  const [activeVideo, setActiveVideo] = useState<VideoPlayerVideo | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadChat();
  }, [chatId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  // Extract YouTube results from existing messages on load
  useEffect(() => {
    if (messages.length > 0 && lastYouTubeResults.length === 0) {
      // Find the most recent YouTube search result in message history
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.actions) {
          for (const action of msg.actions) {
            if (action.name === 'youtube_search' && action.result) {
              const result = action.result;
              // Handle both direct and wrapped result structures
              const ytData = result.type === 'youtube_results' ? result : result;
              if (ytData.videos && ytData.videos.length > 0) {
                console.log('[YouTube] Restored results from message history:', ytData.videos.length);
                setLastYouTubeResults(ytData.videos);
                return;
              }
            }
          }
        }
      }
    }
  }, [messages]);

  const loadChat = async () => {
    try {
      setIsLoading(true);
      const [chatData, messagesData] = await Promise.all([
        chatsApi.get(chatId),
        messagesApi.list(chatId),
      ]);
      setChat(chatData);
      setMessages(messagesData);
      
      // Debug: log messages with actions
      console.log('[loadChat] Messages loaded:', messagesData.length);
      messagesData.forEach((msg: any, i: number) => {
        if (msg.actions && msg.actions.length > 0) {
          console.log(`[loadChat] Message ${i} has ${msg.actions.length} actions:`, msg.actions);
        }
      });
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

  // Check if message is a "play N" command for YouTube
  const parsePlayCommand = (content: string): number | null => {
    const trimmed = content.trim().toLowerCase();
    // Match patterns like "play 1", "play video 1", "1", "play #1", "video 1", "play the first one", etc.
    const patterns = [
      /^play\s*(?:video\s*)?#?(\d+)$/i,
      /^(\d+)$/,
      /^play\s+(\d+)$/i,
      /^video\s*#?(\d+)$/i,
      /^#(\d+)$/i,
      /^play\s+(?:the\s+)?(?:first|1st)(?:\s+(?:one|video))?$/i,  // returns 1
      /^play\s+(?:the\s+)?(?:second|2nd)(?:\s+(?:one|video))?$/i, // returns 2
      /^play\s+(?:the\s+)?(?:third|3rd)(?:\s+(?:one|video))?$/i,  // returns 3
      /^play\s+(?:the\s+)?(?:fourth|4th)(?:\s+(?:one|video))?$/i, // returns 4
      /^play\s+(?:the\s+)?(?:fifth|5th)(?:\s+(?:one|video))?$/i,  // returns 5
    ];
    
    // Check ordinal patterns first
    const ordinalMap: Record<string, number> = {
      'first': 1, '1st': 1,
      'second': 2, '2nd': 2,
      'third': 3, '3rd': 3,
      'fourth': 4, '4th': 4,
      'fifth': 5, '5th': 5,
    };
    
    for (const [word, num] of Object.entries(ordinalMap)) {
      if (trimmed.includes(word)) {
        return num;
      }
    }
    
    // Check numeric patterns
    for (const pattern of patterns.slice(0, 5)) {
      const match = trimmed.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return null;
  };

  // Handle playing a video from the last search results
  const handlePlayVideo = (video: YouTubeVideo) => {
    setActiveVideo({
      video_id: video.video_id,
      title: video.title,
      channel_title: video.channel_title,
      url: video.url,
      embed_url: video.embed_url,
    });
    toast.success(`Now playing: ${video.title.substring(0, 50)}...`);
  };

  // Handle video selection from YouTubeResults component
  const handleVideoSelect = (video: YouTubeVideo) => {
    handlePlayVideo(video);
  };

  const handleSendMessage = async (content: string, documentIds: string[] = []) => {
    if (!content.trim() || isSending) return;

    // Check if this is a play command
    const playIndex = parsePlayCommand(content);
    if (playIndex !== null) {
      console.log('[YouTube] Play command detected:', playIndex, 'Available results:', lastYouTubeResults.length);
      
      if (lastYouTubeResults.length > 0) {
        const videoIndex = playIndex - 1; // Convert 1-based to 0-based
        if (videoIndex >= 0 && videoIndex < lastYouTubeResults.length) {
          const video = lastYouTubeResults[videoIndex];
          handlePlayVideo(video);
          
          // Add a synthetic user message and assistant response
          const userMessage: Message = {
            id: `temp-${Date.now()}`,
            chat_id: chatId,
            role: 'user',
            content,
            thinking: null,
            actions: [],
            document_ids: [],
            model_used: null,
            token_usage: null,
            created_at: new Date().toISOString(),
          };
          
          const assistantMessage: Message = {
            id: `temp-${Date.now() + 1}`,
            chat_id: chatId,
            role: 'assistant',
            content: `▶️ Now playing: **${video.title}** by ${video.channel_title}`,
            thinking: null,
            actions: [],
            document_ids: [],
            model_used: null,
            token_usage: null,
            created_at: new Date().toISOString(),
          };
          
          setMessages(prev => [...prev, userMessage, assistantMessage]);
          return;
        } else {
          toast.error(`Invalid video number. Please choose 1-${lastYouTubeResults.length}`);
          return;
        }
      } else {
        // No YouTube results available, show helpful message
        toast.error('No video search results available. Search for a video first!');
        return;
      }
    }

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
      if (chunk.data.title) {
        setChat(prev => prev ? { ...prev, title: chunk.data.title } : null);
        useUIStore.getState().refreshChatList();
      }
      return;
    }
    
    if (chunk.type === 'memories_used') {
      setMemoriesUsed(chunk.data.memories || []);
      return;
    }
    
    if (chunk.type === 'memories_pending') {
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
      
      case 'action_start':
        // Tool is starting - show it as running
        console.log('[Stream] action_start received:', chunk.data.name, chunk.data);
        streamingMessageRef.current = { 
          ...current, 
          actions: [...(current.actions || []), chunk.data as MessageAction] 
        };
        setStreamingMessage(streamingMessageRef.current);
        break;
        
      case 'action_complete':
        // Track YouTube search results for play commands
        const actionData = chunk.data;
        console.log('[Stream] action_complete received:', actionData.name, actionData);
        
        if (actionData.name === 'youtube_search' && actionData.result) {
          // Handle both direct result and wrapped result structures
          const result = actionData.result;
          console.log('[Stream] YouTube result:', result);
          const ytData = result.type === 'youtube_results' ? result : 
                        (result.result?.type === 'youtube_results' ? result.result : result);
          
          if (ytData.videos && ytData.videos.length > 0) {
            console.log('[YouTube] Setting lastYouTubeResults:', ytData.videos.length, 'videos');
            setLastYouTubeResults(ytData.videos);
          }
        }
        
        // Update existing action (from action_start) or add new one
        const existingActions = current.actions || [];
        const actionIndex = existingActions.findIndex(a => a.id === actionData.id);
        
        if (actionIndex >= 0) {
          // Update existing action
          const updatedActions = [...existingActions];
          updatedActions[actionIndex] = chunk.data as MessageAction;
          streamingMessageRef.current = { ...current, actions: updatedActions };
        } else {
          // Add as new action (fallback)
          streamingMessageRef.current = { 
            ...current, 
            actions: [...existingActions, chunk.data as MessageAction] 
          };
        }
        console.log('[Stream] Updated actions:', streamingMessageRef.current.actions);
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
        console.log('[Stream] saved - streamingMessageRef actions:', streamingMessageRef.current?.actions);
        const finalMessage: Message = {
          ...streamingMessageRef.current,
          id: chunk.data.message_id,
        } as Message;
        console.log('[Stream] saved - finalMessage actions:', finalMessage.actions);
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
              onVideoSelect={handleVideoSelect}
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
              onVideoSelect={handleVideoSelect}
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
        chat={chat}
        onChatUpdate={setChat}
      />
      
      {/* Floating Video Player - rendered outside chat container */}
      {activeVideo && (
        <VideoPlayer 
          video={activeVideo} 
          onClose={() => setActiveVideo(null)} 
        />
      )}
    </div>
  );
}
