'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { chats as chatsApi, messages as messagesApi, tts, personas as personasApi, voiceSettings, stt } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { useWhisperSTT } from '@/hooks/useWhisperSTT';
import { ArrowLeft, Volume2, VolumeX, ChevronDown, Mic, Globe, Cpu } from 'lucide-react';
import { Chat, StreamChunk } from '@/types';
import toast from 'react-hot-toast';
import Link from 'next/link';

// Configuration
const SILENCE_TIMEOUT = 1500;
const INTERRUPT_THRESHOLD = 0.15;
const UI_HIDE_DELAY = 3000;

interface Persona {
  id: string;
  name: string;
  description: string;
  avatar_emoji: string;
  system_prompt?: string;
}

interface Voice {
  id: string;
  name: string;
  model?: string;
  downloaded?: boolean;
  source?: string;
  accent?: string;
  quality?: string;
  gender?: string;
  description?: string;
  available?: boolean;
}

export default function ConversePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { refreshChatList } = useUIStore();
  
  // Chat state
  const [chat, setChat] = useState<Chat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // UI visibility state
  const [showUI, setShowUI] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const uiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Persona state
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  
  // Voice state
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  
  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Audio visualization
  const [ttsAudioLevel, setTtsAudioLevel] = useState(0);
  const [frequencyData, setFrequencyData] = useState<number[]>(new Array(64).fill(0));
  const ttsAnalyserRef = useRef<AnalyserNode | null>(null);
  const ttsAnimationRef = useRef<number | null>(null);
  const ttsAudioContextRef = useRef<AudioContext | null>(null);
  
  // Captions
  const [caption, setCaption] = useState<string>('');
  const [captionType, setCaptionType] = useState<'user' | 'assistant' | 'status'>('status');
  
  // STT status
  const [sttReady, setSttReady] = useState<boolean | null>(null);
  
  // Input management
  const isProcessingRef = useRef(false);
  const chatInitializedRef = useRef(false);
  const selectedPersonaRef = useRef(selectedPersona);
  
  // Keep ref in sync
  useEffect(() => {
    selectedPersonaRef.current = selectedPersona;
  }, [selectedPersona]);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Try to enter fullscreen on mobile (hides URL bar)
  const requestFullscreen = useCallback(() => {
    if (!isMobile) return;
    
    const elem = document.documentElement;
    if (elem.requestFullscreen && !document.fullscreenElement) {
      elem.requestFullscreen().catch(() => {
        // Fullscreen not supported or denied - that's ok
      });
    } else if ((elem as any).webkitRequestFullscreen && !(document as any).webkitFullscreenElement) {
      // Safari/iOS
      (elem as any).webkitRequestFullscreen().catch(() => {});
    }
  }, [isMobile]);

  // Auto-hide UI on mobile after inactivity
  const resetUITimer = useCallback(() => {
    if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
    setShowUI(true);
    if (isMobile) {
      uiTimeoutRef.current = setTimeout(() => {
        if (!showPersonaMenu && !showVoiceMenu) setShowUI(false);
      }, UI_HIDE_DELAY);
    }
  }, [isMobile, showPersonaMenu, showVoiceMenu]);

  // Handle screen tap to toggle UI
  const handleScreenTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // Don't toggle if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
      return;
    }
    
    if (isMobile) {
      if (showUI) {
        setShowUI(false);
        if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
      } else {
        resetUITimer();
      }
    }
  }, [isMobile, showUI, resetUITimer]);

  // Stop AI audio
  const stopAIAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
    setTtsAudioLevel(0);
    setFrequencyData(new Array(64).fill(0));
    if (ttsAnimationRef.current) {
      cancelAnimationFrame(ttsAnimationRef.current);
    }
  }, []);

  // Send message function
  const sendMessage = useCallback(async (content: string) => {
    if (!chat || !content.trim() || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setIsProcessing(true);

    let assistantContent = '';

    try {
      for await (const chunk of messagesApi.sendStream(chat.id, content)) {
        const streamChunk = chunk as StreamChunk;
        
        if (streamChunk.type === 'content' && streamChunk.data.delta) {
          assistantContent += streamChunk.data.delta;
          setCaption(assistantContent);
          setCaptionType('assistant');
        }
        
        if (streamChunk.type === 'title_updated' && streamChunk.data.title) {
          setChat(prev => prev ? { ...prev, title: streamChunk.data.title } : null);
        }
      }

      if (assistantContent.trim() && ttsEnabled) {
        await playTTS(assistantContent);
      }
      
      // Refresh chat list to show updated conversation
      refreshChatList();
      
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error('Failed to get response');
      setCaption('Sorry, I encountered an error.');
      setCaptionType('assistant');
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [chat, ttsEnabled, refreshChatList]);

  // Handle Whisper transcription result - much simpler than Web Speech API
  const handleWhisperTranscript = useCallback((text: string, isFinal: boolean) => {
    // Check for interrupt - if user starts speaking while AI is speaking
    if (isSpeaking) {
      stopAIAudio();
    }
    
    const trimmedText = text.trim();
    if (!trimmedText) return;
    
    // Show the transcribed text
    setCaption(trimmedText);
    setCaptionType('user');
    
    // Whisper gives us clean, final transcripts - send immediately
    if (isFinal && !isProcessingRef.current) {
      console.log('[Whisper] Sending transcribed text:', trimmedText);
      sendMessage(trimmedText);
    }
  }, [sendMessage, isSpeaking, stopAIAudio]);

  // Use Whisper STT hook - optimized for low latency
  const {
    isListening,
    isProcessing: isTranscribing,
    isSupported,
    audioLevel,
    transcript,
    error: speechError,
    startListening,
    stopListening,
    resetTranscript,
  } = useWhisperSTT({
    language: 'en',              // Specify language to skip detection (faster)
    silenceThreshold: 0.015,     // Sensitive silence detection
    silenceDuration: 700,        // Send after 700ms silence (fast response)
    maxRecordingDuration: 10000, // Max 10s chunks for faster processing
    onTranscript: handleWhisperTranscript,
    onError: (error) => {
      toast.error(error);
    },
  });

  // Check STT service status on mount
  useEffect(() => {
    const checkSTT = async () => {
      try {
        const status = await stt.status();
        setSttReady(status.ready);
        if (!status.ready) {
          console.log('[Converse] STT not ready, initializing...');
          // Try to initialize in background
          stt.initialize().then(() => {
            setSttReady(true);
            toast.success('Voice transcription ready');
          }).catch((err) => {
            console.error('[Converse] STT init failed:', err);
          });
        }
      } catch (err) {
        console.error('[Converse] Failed to check STT status:', err);
        setSttReady(false);
      }
    };
    checkSTT();
  }, []);

  // Update frequency data for user audio
  useEffect(() => {
    if (isListening && !isSpeaking) {
      const newData = new Array(64).fill(0).map((_, i) => {
        const wave = Math.sin(i * 0.3 + Date.now() * 0.005) * 0.3 + 0.7;
        return audioLevel * wave * (0.5 + Math.random() * 0.5);
      });
      setFrequencyData(newData);
    }
  }, [audioLevel, isListening, isSpeaking]);

  // Check for interrupt
  useEffect(() => {
    if (isListening && isSpeaking && audioLevel > INTERRUPT_THRESHOLD) {
      stopAIAudio();
    }
  }, [audioLevel, isListening, isSpeaking, stopAIAudio]);

  // Load personas
  useEffect(() => {
    loadPersonas();
    loadVoices();
  }, []);

  const loadPersonas = async () => {
    try {
      const data = await personasApi.list();
      setPersonas(data);
      
      // Prefer "Voice Assistant" persona for /converse
      const voicePersona = data.find((p: Persona) => 
        p.name === 'Voice Assistant' ||
        p.name.toLowerCase().includes('voice')
      );
      if (voicePersona && !selectedPersona) {
        setSelectedPersona(voicePersona);
      }
    } catch (err) {
      console.error('Failed to load personas:', err);
    }
  };

  const loadVoices = async () => {
    try {
      // Try to load admin-enabled voices first, fall back to TTS voices if not available
      let voiceList: Voice[] = [];
      
      try {
        const enabledData = await voiceSettings.listEnabled();
        voiceList = enabledData.voices as Voice[];
      } catch {
        // Fall back to TTS voices endpoint
      }
      
      // Fallback: use TTS voices filtered to Medium/High quality
      if (voiceList.length === 0) {
        const data = await tts.voices();
        voiceList = data.voices.filter((v: Voice) => 
          v.quality === 'Medium' || v.quality === 'High'
        );
      }
      
      setVoices(voiceList);
      
      // Try to restore saved voice from localStorage, otherwise default to Amy
      const savedVoiceId = typeof window !== 'undefined' ? localStorage.getItem('hal-preferred-voice') : null;
      const savedVoice = savedVoiceId ? voiceList.find((v: Voice) => v.id === savedVoiceId) : null;
      const defaultVoice = savedVoice || voiceList.find((v: Voice) => v.id === 'amy');
      if (defaultVoice && !selectedVoice) {
        setSelectedVoice(defaultVoice);
      }
    } catch (err) {
      console.error('Failed to load voices:', err);
    }
  };

  // Initialize chat - reuse empty voice chats or defer creation until first message
  useEffect(() => {
    const initializeChat = async () => {
      // Prevent duplicate initialization
      if (chatInitializedRef.current) return;
      if (personas.length === 0) return;
      
      chatInitializedRef.current = true;
      
      try {
        setIsLoading(true);
        const existingChats = await chatsApi.list(false, false);
        
        // First, look for any voice chat with messages from the last hour
        const recentActiveVoiceChat = existingChats.find((c: any) => 
          c.title === 'Voice Conversation' && 
          c.is_owner &&
          c.message_count > 0 &&
          new Date(c.updated_at).getTime() > Date.now() - 60 * 60 * 1000
        );
        
        if (recentActiveVoiceChat) {
          // Reuse recent active voice chat
          setChat(recentActiveVoiceChat as Chat);
          const currentPersona = selectedPersonaRef.current;
          if (currentPersona && recentActiveVoiceChat.persona_id !== currentPersona.id) {
            await chatsApi.update(recentActiveVoiceChat.id, { persona_id: currentPersona.id });
          }
        } else {
          // Look for any empty voice chat to reuse (avoid creating duplicates)
          const emptyVoiceChat = existingChats.find((c: any) => 
            c.title === 'Voice Conversation' && 
            c.is_owner &&
            c.message_count === 0
          );
          
          if (emptyVoiceChat) {
            // Reuse the empty chat instead of creating a new one
            setChat(emptyVoiceChat as Chat);
            const currentPersona = selectedPersonaRef.current;
            if (currentPersona && emptyVoiceChat.persona_id !== currentPersona.id) {
              await chatsApi.update(emptyVoiceChat.id, { persona_id: currentPersona.id });
            }
          } else {
            // No voice chat exists - create one
            const currentPersona = selectedPersonaRef.current;
            const newChat = await chatsApi.create({ 
              title: 'Voice Conversation',
              persona_id: currentPersona?.id 
            });
            await chatsApi.update(newChat.id, { tts_enabled: true, voice_mode: true } as any);
            setChat(newChat);
            // Don't refresh sidebar yet - wait until first message is sent
            // This prevents empty voice chats from cluttering the list
          }
        }
      } catch (err) {
        console.error('Failed to create chat:', err);
        toast.error('Failed to start conversation');
        router.push('/chat');
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeChat();
    
    return () => {
      if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
      if (audioRef.current) audioRef.current.pause();
      if (ttsAnimationRef.current) cancelAnimationFrame(ttsAnimationRef.current);
      if (ttsAudioContextRef.current?.state !== 'closed') {
        ttsAudioContextRef.current?.close();
      }
    };
  }, [personas.length, router]); // Only depend on personas.length, not selectedPersona

  const handleMicToggleRef = useRef<() => void>(() => {});

  const handleMicToggle = useCallback(async () => {
    resetUITimer();
    requestFullscreen(); // Try to enter fullscreen on first interaction
    
    if (isListening) {
      stopListening();
    } else {
      if (isSpeaking) stopAIAudio();
      resetTranscript();
      setCaption('');
      setCaptionType('status');
      await startListening();
    }
  }, [isListening, stopListening, isSpeaking, stopAIAudio, resetTranscript, startListening, resetUITimer, requestFullscreen]);

  useEffect(() => {
    handleMicToggleRef.current = handleMicToggle;
  }, [handleMicToggle]);

  // Desktop: space bar to toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        handleMicToggleRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handlePersonaChange = async (persona: Persona | null) => {
    setSelectedPersona(persona);
    setShowPersonaMenu(false);
    resetUITimer();
    if (chat) {
      try {
        await chatsApi.update(chat.id, { persona_id: persona?.id || null });
        toast.success(persona ? `Switched to ${persona.name}` : 'Using default assistant');
      } catch (err) {
        console.error('Failed to update persona:', err);
      }
    }
  };

  const handleVoiceChange = (voice: Voice) => {
    setSelectedVoice(voice);
    setShowVoiceMenu(false);
    resetUITimer();
    // Persist voice preference
    if (typeof window !== 'undefined') {
      localStorage.setItem('hal-preferred-voice', voice.id);
    }
    toast.success(`Voice changed to ${voice.name}`);
  };

  const playTTS = async (text: string) => {
    if (!ttsEnabled || !text.trim()) return;
    setIsSpeaking(true);
    
    try {
      const blob = await tts.generate(text, selectedVoice?.id);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      
      try {
        if (ttsAudioContextRef.current?.state !== 'closed') {
          await ttsAudioContextRef.current?.close();
        }
        
        const audioContext = new AudioContext();
        ttsAudioContextRef.current = audioContext;
        
        const source = audioContext.createMediaElementSource(audio);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.7;
        
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        ttsAnalyserRef.current = analyser;
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        const updateLevel = () => {
          if (ttsAnalyserRef.current && audioRef.current && !audioRef.current.paused) {
            ttsAnalyserRef.current.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            setTtsAudioLevel(Math.min(1, average / 128));
            
            const normalized = Array.from(dataArray).map(v => v / 255);
            setFrequencyData(normalized);
            
            ttsAnimationRef.current = requestAnimationFrame(updateLevel);
          }
        };
        updateLevel();
      } catch (e) {
        console.error('Audio analyzer setup failed:', e);
      }
      
      audio.onended = () => {
        setIsSpeaking(false);
        setTtsAudioLevel(0);
        setFrequencyData(new Array(64).fill(0));
        if (ttsAnimationRef.current) cancelAnimationFrame(ttsAnimationRef.current);
        URL.revokeObjectURL(url);
      };
      
      audio.onerror = () => {
        setIsSpeaking(false);
        setTtsAudioLevel(0);
      };
      
      await audio.play();
    } catch (err) {
      console.error('TTS error:', err);
      setIsSpeaking(false);
      setTtsAudioLevel(0);
    }
  };

  const handleTTSToggle = () => {
    setTtsEnabled(!ttsEnabled);
    resetUITimer();
    if (audioRef.current && ttsEnabled) stopAIAudio();
  };

  const currentAudioLevel = isSpeaking ? ttsAudioLevel : audioLevel;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0a1a]">
        <div className="text-center">
          <GlowingRing audioLevel={0} isActive={false} isProcessing={true} />
          <p className="text-gray-400 mt-6">Starting voice conversation...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="h-full flex flex-col bg-[#0a0a1a] overflow-hidden relative"
      onClick={handleScreenTap}
      onTouchEnd={handleScreenTap}
    >
      {/* Full-screen gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-purple-900/10 via-transparent to-purple-900/20 pointer-events-none" />
      
      {/* Header - auto-hides on mobile */}
      <header className={`absolute top-0 left-0 right-0 z-20 h-14 flex items-center justify-between px-4 bg-black/40 backdrop-blur-sm border-b border-white/5 transition-all duration-300 ${
        showUI ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
      }`}>
        <div className="flex items-center gap-3">
          <Link href="/chat" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <h1 className="font-medium text-white/90">Voice Mode</h1>
          {/* STT Status indicator */}
          {sttReady !== null && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
              sttReady ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
            }`}>
              <Cpu className="w-3 h-3" />
              <span className="hidden sm:inline">{sttReady ? 'Whisper' : 'Loading...'}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowPersonaMenu(!showPersonaMenu); setShowVoiceMenu(false); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              <span className="text-lg">{selectedPersona?.avatar_emoji || '🤖'}</span>
              <span className="text-sm text-gray-300 hidden sm:inline">
                {selectedPersona?.name || 'Default'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            
            {showPersonaMenu && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800/95 backdrop-blur-sm rounded-xl shadow-xl border border-white/10 py-2 z-50">
                <button
                  onClick={(e) => { e.stopPropagation(); handlePersonaChange(null); }}
                  className={`w-full px-4 py-2 text-left hover:bg-white/10 flex items-center gap-3 ${!selectedPersona ? 'bg-white/5' : ''}`}
                >
                  <span className="text-xl">🤖</span>
                  <div>
                    <div className="text-white text-sm">Default Assistant</div>
                    <div className="text-gray-500 text-xs">Standard HAL voice</div>
                  </div>
                </button>
                {personas.map(p => (
                  <button
                    key={p.id}
                    onClick={(e) => { e.stopPropagation(); handlePersonaChange(p); }}
                    className={`w-full px-4 py-2 text-left hover:bg-white/10 flex items-center gap-3 ${selectedPersona?.id === p.id ? 'bg-white/5' : ''}`}
                  >
                    <span className="text-xl">{p.avatar_emoji}</span>
                    <div>
                      <div className="text-white text-sm">{p.name}</div>
                      <div className="text-gray-500 text-xs truncate">{p.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <button
            onClick={(e) => { e.stopPropagation(); handleTTSToggle(); }}
            className={`p-2 rounded-lg transition-colors ${ttsEnabled ? 'bg-purple-500/20 text-purple-400' : 'text-gray-500 hover:bg-white/10'}`}
          >
            {ttsEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          
          {/* Voice Selection */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowVoiceMenu(!showVoiceMenu); setShowPersonaMenu(false); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              <Globe className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-300 hidden sm:inline">
                {selectedVoice?.accent === 'British' ? '🇬🇧' : '🇺🇸'} {selectedVoice?.name || 'Amy'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            
            {showVoiceMenu && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-slate-800/95 backdrop-blur-sm rounded-xl shadow-xl border border-white/10 py-2 z-50 max-h-80 overflow-y-auto">
                {/* American voices */}
                <div className="px-4 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  🇺🇸 American
                </div>
                {voices.filter(v => v.accent === 'American').map(v => (
                  <button
                    key={v.id}
                    onClick={(e) => { e.stopPropagation(); handleVoiceChange(v); }}
                    className={`w-full px-4 py-2 text-left hover:bg-white/10 flex items-center justify-between ${selectedVoice?.id === v.id ? 'bg-white/5' : ''}`}
                  >
                    <div>
                      <div className="text-white text-sm">{v.name}</div>
                      <div className="text-gray-500 text-xs">{v.quality} • {v.gender}</div>
                    </div>
                    {selectedVoice?.id === v.id && (
                      <div className="w-2 h-2 rounded-full bg-purple-500" />
                    )}
                  </button>
                ))}
                
                {/* British voices */}
                <div className="px-4 py-1 mt-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-t border-white/10 pt-2">
                  🇬🇧 British
                </div>
                {voices.filter(v => v.accent === 'British').map(v => (
                  <button
                    key={v.id}
                    onClick={(e) => { e.stopPropagation(); handleVoiceChange(v); }}
                    className={`w-full px-4 py-2 text-left hover:bg-white/10 flex items-center justify-between ${selectedVoice?.id === v.id ? 'bg-white/5' : ''}`}
                  >
                    <div>
                      <div className="text-white text-sm">{v.name}</div>
                      <div className="text-gray-500 text-xs">{v.quality} • {v.gender}</div>
                    </div>
                    {selectedVoice?.id === v.id && (
                      <div className="w-2 h-2 rounded-full bg-purple-500" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content - full screen visualization */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
        {/* Glowing Ring - clickable to toggle mic */}
        <button
          onClick={(e) => { e.stopPropagation(); handleMicToggle(); }}
          disabled={isProcessing}
          className="relative focus:outline-none z-10"
        >
          <GlowingRing 
            audioLevel={currentAudioLevel}
            isActive={isListening || isSpeaking}
            isProcessing={isProcessing}
            isAI={isSpeaking}
            isListening={isListening}
            fullScreen={isMobile}
          />
        </button>

        {/* Status text */}
        <p className={`mt-8 text-xl font-light tracking-wide transition-colors z-10 ${
          isTranscribing ? 'text-yellow-400'
          : isListening ? 'text-cyan-400' 
          : isSpeaking ? 'text-purple-400' 
          : isProcessing ? 'text-purple-300'
          : 'text-gray-400'
        }`}>
          {isTranscribing ? 'Transcribing...'
           : isListening ? "I'm listening..." 
           : isSpeaking ? 'Speaking...' 
           : isProcessing ? 'Thinking...' 
           : 'Tap to speak'}
        </p>

        {/* Waveform Visualizer */}
        <div className="mt-8 w-full max-w-lg z-10">
          <WaveformVisualizer 
            frequencyData={frequencyData}
            isActive={isListening || isSpeaking}
            isAI={isSpeaking}
          />
        </div>

        {/* Caption display */}
        {caption && (
          <div className="mt-6 max-w-2xl text-center z-10 px-4">
            <p className={`text-base leading-relaxed ${
              captionType === 'user' ? 'text-cyan-300/80' : 'text-purple-300/80'
            }`}>
              {caption}
            </p>
          </div>
        )}

        {/* Error display */}
        {speechError && !speechError.includes('No speech detected') && (
          <div className="mt-4 text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-lg z-10">
            {speechError}
          </div>
        )}
      </div>

      {/* Bottom controls - ONLY show on desktop */}
      {!isMobile && (
        <div className={`absolute bottom-0 left-0 right-0 z-20 p-4 transition-all duration-300 ${
          showUI ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
        }`}>
          <div className="max-w-lg mx-auto flex items-center gap-3 bg-white/5 backdrop-blur-sm rounded-full px-4 py-3 border border-white/10">
            <div className="flex-1 text-gray-500 text-sm">
              {isTranscribing ? 'Transcribing...' : isListening ? 'Listening...' : 'Press space or tap circle to speak'}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleMicToggle(); }}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                isListening 
                  ? 'bg-gradient-to-r from-cyan-500 to-purple-500 shadow-lg shadow-purple-500/30' 
                  : 'bg-purple-600 hover:bg-purple-500'
              }`}
            >
              <Mic className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// Glowing Ring Component
function GlowingRing({ 
  audioLevel, 
  isActive, 
  isProcessing,
  isAI = false,
  isListening = false,
  fullScreen = false
}: { 
  audioLevel: number;
  isActive: boolean;
  isProcessing: boolean;
  isAI?: boolean;
  isListening?: boolean;
  fullScreen?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const smoothedLevelRef = useRef(0);
  const historyRef = useRef<number[]>(new Array(60).fill(0));
  const peakRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = fullScreen ? 400 : 320;
    canvas.width = size;
    canvas.height = size;
    
    const centerX = size / 2;
    const centerY = size / 2;
    const baseRadius = fullScreen ? 100 : 80;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      
      smoothedLevelRef.current += (audioLevel - smoothedLevelRef.current) * 0.3;
      const level = smoothedLevelRef.current;
      
      if (level > peakRef.current) {
        peakRef.current = level;
      } else {
        peakRef.current *= 0.95;
      }
      
      historyRef.current.push(level);
      historyRef.current.shift();
      
      let hue1 = 270;
      let hue2 = 280;
      
      if (isListening) {
        hue1 = 185;
        hue2 = 270;
      } else if (isAI) {
        hue1 = 280;
        hue2 = 330;
      }

      const glowIntensity = 0.15 + level * 0.4 + peakRef.current * 0.2;
      for (let i = 5; i >= 0; i--) {
        const glowRadius = baseRadius + 30 + i * 20 + level * 40;
        const alpha = glowIntensity * (1 - i / 6) * 0.4;
        
        const gradient = ctx.createRadialGradient(
          centerX, centerY, baseRadius,
          centerX, centerY, glowRadius
        );
        gradient.addColorStop(0, `hsla(${hue1}, 80%, 60%, ${alpha})`);
        gradient.addColorStop(1, `hsla(${hue2}, 80%, 50%, 0)`);
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      const segments = 120;
      const ringRadius = baseRadius + 10 + level * 25;
      
      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        
        const wave1 = Math.sin(angle * 8 + phaseRef.current * 3) * (8 + level * 20);
        const wave2 = Math.sin(angle * 4 - phaseRef.current * 2) * (4 + level * 12);
        const wave3 = Math.sin(angle * 12 + phaseRef.current * 5) * (level * 8);
        
        const historyIndex = Math.floor((i / segments) * historyRef.current.length);
        const historyLevel = historyRef.current[historyIndex] || 0;
        const audioWave = historyLevel * 30;
        
        const totalWave = (isActive || isProcessing) 
          ? wave1 + wave2 + wave3 + audioWave 
          : wave1 * 0.3;
        
        const r = ringRadius + totalWave;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      
      const ringGradient = ctx.createLinearGradient(
        centerX - ringRadius - 50, centerY - ringRadius - 50,
        centerX + ringRadius + 50, centerY + ringRadius + 50
      );
      ringGradient.addColorStop(0, `hsla(${hue1}, 85%, 65%, 0.9)`);
      ringGradient.addColorStop(0.5, `hsla(${(hue1 + hue2) / 2}, 80%, 60%, 1)`);
      ringGradient.addColorStop(1, `hsla(${hue2}, 85%, 55%, 0.9)`);
      
      ctx.strokeStyle = ringGradient;
      ctx.lineWidth = 3 + level * 4;
      ctx.stroke();
      
      const fillGradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, ringRadius + 40
      );
      fillGradient.addColorStop(0, `hsla(${hue1}, 70%, 20%, ${0.1 + level * 0.15})`);
      fillGradient.addColorStop(0.7, `hsla(${hue2}, 70%, 15%, ${0.05 + level * 0.1})`);
      fillGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = fillGradient;
      ctx.fill();

      if (isActive || isProcessing) {
        const particleCount = Math.floor(12 + level * 20);
        
        for (let i = 0; i < particleCount; i++) {
          const angle = (i / particleCount) * Math.PI * 2 + phaseRef.current * (isProcessing ? 2 : 0.5);
          const distance = ringRadius + 20 + Math.sin(angle * 3 + phaseRef.current * 4) * (15 + level * 25);
          const extraDist = historyRef.current[i % historyRef.current.length] * 40;
          
          const x = centerX + Math.cos(angle) * (distance + extraDist);
          const y = centerY + Math.sin(angle) * (distance + extraDist);
          
          const particleSize = 1.5 + level * 3 + Math.sin(phaseRef.current * 4 + i) * 1.5;
          const alpha = 0.3 + level * 0.5;
          
          ctx.beginPath();
          ctx.arc(x, y, particleSize, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue1 + (i * 3)}, 80%, 70%, ${alpha})`;
          ctx.fill();
          
          if (level > 0.1) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            const trailX = centerX + Math.cos(angle) * (distance - 10);
            const trailY = centerY + Math.sin(angle) * (distance - 10);
            ctx.lineTo(trailX, trailY);
            ctx.strokeStyle = `hsla(${hue1 + (i * 3)}, 80%, 70%, ${alpha * 0.3})`;
            ctx.lineWidth = particleSize * 0.5;
            ctx.stroke();
          }
        }
      }

      const coreRadius = 25 + level * 15 + Math.sin(phaseRef.current * 2) * 5;
      const coreGradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, coreRadius
      );
      coreGradient.addColorStop(0, `hsla(${hue1}, 70%, 80%, ${0.3 + level * 0.4})`);
      coreGradient.addColorStop(0.5, `hsla(${hue2}, 70%, 60%, ${0.2 + level * 0.3})`);
      coreGradient.addColorStop(1, 'transparent');
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      ctx.fillStyle = coreGradient;
      ctx.fill();

      phaseRef.current += 0.025 + level * 0.02;
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [audioLevel, isActive, isProcessing, isAI, isListening, fullScreen]);

  const sizeClass = fullScreen ? 'w-[400px] h-[400px]' : 'w-[320px] h-[320px]';

  return (
    <div className="relative cursor-pointer group">
      <canvas 
        ref={canvasRef} 
        className={`${sizeClass} transition-transform group-hover:scale-105 group-active:scale-95`}
      />
    </div>
  );
}


// Waveform Visualizer Component
function WaveformVisualizer({ 
  frequencyData, 
  isActive,
  isAI = false
}: { 
  frequencyData: number[];
  isActive: boolean;
  isAI: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const smoothedDataRef = useRef<number[]>(new Array(64).fill(0));
  const velocityRef = useRef<number[]>(new Array(64).fill(0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 600;
    const height = 150;
    canvas.width = width;
    canvas.height = height;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      
      for (let i = 0; i < smoothedDataRef.current.length; i++) {
        const target = frequencyData[i] || 0;
        const current = smoothedDataRef.current[i];
        const diff = target - current;
        
        velocityRef.current[i] += diff * 0.3;
        velocityRef.current[i] *= 0.7;
        smoothedDataRef.current[i] += velocityRef.current[i];
      }
      
      const data = smoothedDataRef.current;
      const centerY = height / 2;
      const avgLevel = data.reduce((a, b) => a + b, 0) / data.length;
      
      const hue1 = isAI ? 280 : 185;
      const hue2 = isAI ? 330 : 270;

      for (let layer = 2; layer >= 0; layer--) {
        const layerOffset = layer * 0.3;
        const layerAlpha = 0.15 + (2 - layer) * 0.25;
        const layerScale = 0.6 + (2 - layer) * 0.2;
        
        const points: { x: number; y: number }[] = [];
        const segments = 80;
        
        for (let i = 0; i <= segments; i++) {
          const x = (i / segments) * width;
          const dataIndex = Math.floor((i / segments) * data.length);
          
          const d0 = data[Math.max(0, dataIndex - 1)] || 0;
          const d1 = data[dataIndex] || 0;
          const d2 = data[Math.min(data.length - 1, dataIndex + 1)] || 0;
          const interpolated = (d0 + d1 * 2 + d2) / 4;
          
          const amplitude = interpolated * 50 * layerScale;
          
          const wave1 = Math.sin(i * 0.12 + phaseRef.current * 2 + layerOffset) * (6 + avgLevel * 15);
          const wave2 = Math.sin(i * 0.06 + phaseRef.current * 1.3 - layerOffset) * (10 + avgLevel * 20);
          const wave3 = Math.sin(i * 0.2 + phaseRef.current * 3 + layer) * (avgLevel * 10);
          
          const totalY = isActive 
            ? amplitude + wave1 + wave2 + wave3
            : wave1 * 0.4 + wave2 * 0.3;
          
          points.push({ x, y: centerY - totalY });
        }

        ctx.beginPath();
        ctx.moveTo(0, centerY);
        
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[Math.max(0, i - 1)];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = points[Math.min(points.length - 1, i + 2)];
          
          const cp1x = p1.x + (p2.x - p0.x) / 6;
          const cp1y = p1.y + (p2.y - p0.y) / 6;
          const cp2x = p2.x - (p3.x - p1.x) / 6;
          const cp2y = p2.y - (p3.y - p1.y) / 6;
          
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
        
        ctx.lineTo(width, centerY);
        ctx.closePath();
        
        const fillGradient = ctx.createLinearGradient(0, centerY - 60, 0, centerY);
        fillGradient.addColorStop(0, `hsla(${hue1}, 80%, 60%, ${layerAlpha * 0.5})`);
        fillGradient.addColorStop(1, `hsla(${hue2}, 80%, 50%, ${layerAlpha * 0.1})`);
        ctx.fillStyle = fillGradient;
        ctx.fill();
        
        const strokeGradient = ctx.createLinearGradient(0, 0, width, 0);
        strokeGradient.addColorStop(0, `hsla(${hue1}, 85%, 65%, ${layerAlpha * 0.5})`);
        strokeGradient.addColorStop(0.5, `hsla(${(hue1 + hue2) / 2}, 85%, 70%, ${layerAlpha})`);
        strokeGradient.addColorStop(1, `hsla(${hue2}, 85%, 65%, ${layerAlpha * 0.5})`);
        ctx.strokeStyle = strokeGradient;
        ctx.lineWidth = 2 - layer * 0.5;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[Math.max(0, i - 1)];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = points[Math.min(points.length - 1, i + 2)];
          
          const mirrorY = (y: number) => centerY + (centerY - y);
          
          const cp1x = p1.x + (p2.x - p0.x) / 6;
          const cp1y = mirrorY(p1.y + (p2.y - p0.y) / 6);
          const cp2x = p2.x - (p3.x - p1.x) / 6;
          const cp2y = mirrorY(p2.y - (p3.y - p1.y) / 6);
          
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, mirrorY(p2.y));
        }
        ctx.lineTo(width, centerY);
        ctx.closePath();
        
        const mirrorFillGradient = ctx.createLinearGradient(0, centerY, 0, centerY + 60);
        mirrorFillGradient.addColorStop(0, `hsla(${hue2}, 80%, 50%, ${layerAlpha * 0.1})`);
        mirrorFillGradient.addColorStop(1, `hsla(${hue1}, 80%, 60%, ${layerAlpha * 0.5})`);
        ctx.fillStyle = mirrorFillGradient;
        ctx.fill();
        ctx.strokeStyle = strokeGradient;
        ctx.stroke();
      }

      const glowGradient = ctx.createLinearGradient(0, 0, width, 0);
      glowGradient.addColorStop(0, `hsla(${hue1}, 70%, 70%, 0)`);
      glowGradient.addColorStop(0.5, `hsla(${hue2}, 70%, 80%, ${0.3 + avgLevel * 0.4})`);
      glowGradient.addColorStop(1, `hsla(${hue1}, 70%, 70%, 0)`);
      
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.strokeStyle = glowGradient;
      ctx.lineWidth = 1 + avgLevel * 2;
      ctx.stroke();

      phaseRef.current += 0.025;
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [frequencyData, isActive, isAI]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-[150px]"
    />
  );
}
