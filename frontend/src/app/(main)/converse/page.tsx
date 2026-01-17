'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { chats as chatsApi, messages as messagesApi, tts } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { ClosedCaptions, CaptionEntry } from '@/components/converse/ClosedCaptions';
import { ConverseMic } from '@/components/converse/ConverseMic';
import { Settings, ArrowLeft, Volume2, VolumeX } from 'lucide-react';
import { Chat, StreamChunk } from '@/types';
import toast from 'react-hot-toast';
import Link from 'next/link';

// Silence detection timeout (ms) - send message after this much silence
const SILENCE_TIMEOUT = 1500;

export default function ConversePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  
  // Chat state
  const [chat, setChat] = useState<Chat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [voiceId, setVoiceId] = useState<string>('en-US-GuyNeural');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  
  // Caption entries for display
  const [captions, setCaptions] = useState<CaptionEntry[]>([]);
  
  // Current accumulated user input
  const [userInput, setUserInput] = useState('');
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTranscriptRef = useRef('');

  // Handle speech recognition result
  const handleSpeechResult = useCallback((transcript: string, isFinal: boolean) => {
    if (isFinal) {
      // Append final transcript to user input
      setUserInput(prev => {
        const updated = prev + (prev ? ' ' : '') + transcript;
        lastTranscriptRef.current = updated;
        return updated;
      });
      
      // Reset silence timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      
      // Start new silence timeout - send after pause
      silenceTimeoutRef.current = setTimeout(() => {
        if (lastTranscriptRef.current.trim()) {
          sendMessage(lastTranscriptRef.current.trim());
          setUserInput('');
          lastTranscriptRef.current = '';
        }
      }, SILENCE_TIMEOUT);
    }
  }, []);

  const {
    isListening,
    isSupported,
    interimTranscript,
    startListening,
    stopListening,
    resetTranscript,
    error: speechError,
  } = useSpeechRecognition({
    continuous: true,
    interimResults: true,
    language: 'en-US',
    onResult: handleSpeechResult,
    onError: (error) => {
      console.error('Speech recognition error:', error);
      toast.error(`Speech error: ${error}`);
    },
  });

  // Initialize or create chat on mount
  useEffect(() => {
    initializeChat();
    
    return () => {
      // Cleanup
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  const initializeChat = async () => {
    try {
      setIsLoading(true);
      // Create a new chat for this conversation session
      const newChat = await chatsApi.create({ 
        title: 'Voice Conversation',
      });
      
      // Enable TTS on this chat
      await chatsApi.update(newChat.id, { 
        tts_enabled: true 
      } as any);
      
      setChat(newChat);
    } catch (err) {
      console.error('Failed to create chat:', err);
      toast.error('Failed to start conversation');
      router.push('/chat');
    } finally {
      setIsLoading(false);
    }
  };


  // Play TTS for assistant response
  const playTTS = async (text: string) => {
    if (!ttsEnabled || !text.trim()) return;

    setIsSpeaking(true);
    
    try {
      const blob = await tts.generate(text, voiceId);
      
      // Clean up old audio
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      
      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onended = () => {
        setIsSpeaking(false);
        // Auto-restart listening after speaking
        if (isSupported && !isListening) {
          startListening();
        }
      };
      
      audio.onerror = () => {
        console.error('Audio playback error');
        setIsSpeaking(false);
      };
      
      await audio.play();
    } catch (err) {
      console.error('TTS error:', err);
      setIsSpeaking(false);
    }
  };

  // Send message to LLM
  const sendMessage = async (content: string) => {
    if (!chat || !content.trim() || isProcessing) return;

    // Stop listening while processing
    stopListening();
    resetTranscript();
    setIsProcessing(true);

    // Add user caption
    const userCaptionId = `user-${Date.now()}`;
    setCaptions(prev => [...prev, {
      id: userCaptionId,
      role: 'user',
      text: content,
      timestamp: new Date(),
    }]);

    let assistantContent = '';
    const assistantCaptionId = `assistant-${Date.now()}`;


    try {
      // Stream the response
      for await (const chunk of messagesApi.sendStream(chat.id, content)) {
        const streamChunk = chunk as StreamChunk;
        
        if (streamChunk.type === 'content' && streamChunk.data.delta) {
          assistantContent += streamChunk.data.delta;
          
          // Update caption with streaming content
          setCaptions(prev => {
            const existing = prev.find(c => c.id === assistantCaptionId);
            if (existing) {
              return prev.map(c => 
                c.id === assistantCaptionId 
                  ? { ...c, text: assistantContent }
                  : c
              );
            } else {
              return [...prev, {
                id: assistantCaptionId,
                role: 'assistant' as const,
                text: assistantContent,
                timestamp: new Date(),
              }];
            }
          });
        }
        
        if (streamChunk.type === 'title_updated' && streamChunk.data.title) {
          setChat(prev => prev ? { ...prev, title: streamChunk.data.title } : null);
        }
      }

      // Play TTS for the complete response
      if (assistantContent.trim()) {
        await playTTS(assistantContent);
      } else {
        // If no TTS needed, restart listening
        if (isSupported) {
          startListening();
        }
      }
      
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error('Failed to get response');
      
      // Add error caption
      setCaptions(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        text: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      }]);
      
      // Restart listening on error
      if (isSupported) {
        startListening();
      }
    } finally {
      setIsProcessing(false);
    }
  };


  // Toggle mic listening
  const handleMicToggle = () => {
    if (isListening) {
      stopListening();
      
      // Send any pending input
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      if (userInput.trim()) {
        sendMessage(userInput.trim());
        setUserInput('');
        lastTranscriptRef.current = '';
      }
    } else {
      resetTranscript();
      setUserInput('');
      startListening();
    }
  };

  // Toggle TTS
  const handleTTSToggle = () => {
    setTtsEnabled(!ttsEnabled);
    if (audioRef.current && !ttsEnabled === false) {
      audioRef.current.pause();
      setIsSpeaking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-primary">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-3xl">🤖</span>
          </div>
          <p className="text-text-secondary">Starting conversation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-bg-secondary">
        <div className="flex items-center gap-3">
          <Link
            href="/chat"
            className="p-2 hover:bg-surface rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-text-secondary" />
          </Link>
          <h1 className="font-semibold text-text-primary">Voice Conversation</h1>
        </div>
        
        <div className="flex items-center gap-2">
          {/* TTS Toggle */}
          <button
            onClick={handleTTSToggle}
            className={`p-2 rounded-lg transition-colors ${
              ttsEnabled 
                ? 'bg-accent/10 text-accent' 
                : 'text-text-muted hover:bg-surface'
            }`}
            title={ttsEnabled ? 'Disable voice response' : 'Enable voice response'}
          >
            {ttsEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          
          {/* Settings */}
          <button
            onClick={() => router.push('/settings')}
            className="p-2 hover:bg-surface rounded-lg transition-colors text-text-muted"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>


      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8">
        {/* Visual waveform / mic interface */}
        <ConverseMic
          isListening={isListening}
          isSpeaking={isSpeaking}
          isProcessing={isProcessing}
          isSupported={isSupported}
          onToggle={handleMicToggle}
        />

        {/* Closed captions area */}
        <div className="w-full max-w-2xl">
          <ClosedCaptions
            entries={captions}
            currentInterim={isListening ? (userInput + (interimTranscript ? ' ' + interimTranscript : '')) : undefined}
            isListening={isListening}
            isSpeaking={isSpeaking}
          />
        </div>

        {/* Error display */}
        {speechError && (
          <div className="text-error text-sm bg-error/10 px-4 py-2 rounded-lg">
            Speech recognition error: {speechError}
          </div>
        )}
      </div>

      {/* Footer hints */}
      <footer className="p-4 border-t border-border bg-bg-secondary">
        <div className="max-w-2xl mx-auto text-center text-text-muted text-xs">
          <p>
            {chat ? (
              <>This conversation is saved as "{chat.title}" and can be found in your chat history.</>
            ) : (
              <>Starting a new voice conversation...</>
            )}
          </p>
        </div>
      </footer>
    </div>
  );
}
