'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { chats as chatsApi, messages as messagesApi, tts, personas as personasApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { Settings, ArrowLeft, Volume2, VolumeX, User, ChevronDown } from 'lucide-react';
import { Chat, StreamChunk } from '@/types';
import toast from 'react-hot-toast';
import Link from 'next/link';

// Configuration
const SILENCE_TIMEOUT = 1500; // Send message after this much silence
const INTERRUPT_THRESHOLD = 0.15; // Audio level to consider user speaking

// Voice conversation system prompt addition for conversational style
const VOICE_SYSTEM_PROMPT_ADDITION = `

You are in a voice conversation. Keep these guidelines in mind:
- Be conversational and engaging - ask follow-up questions to keep the dialogue flowing
- Keep responses concise (1-3 sentences unless explaining something complex)
- Show genuine curiosity about what the user shares
- Don't just answer questions - also share relevant thoughts, ask about their experience, or offer interesting related information
- Use natural conversational fillers occasionally like "That's interesting..." or "You know what..."
- If the user gives a short response, ask a thoughtful follow-up question
- Vary your response patterns - don't always start with "That's great!" or similar
- Remember context from earlier in the conversation and reference it naturally`;

interface Persona {
  id: string;
  name: string;
  description: string;
  avatar_emoji: string;
  system_prompt?: string;
}

export default function ConversePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  
  // Chat state
  const [chat, setChat] = useState<Chat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Persona state
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  
  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Audio visualization
  const [ttsAudioLevel, setTtsAudioLevel] = useState(0);
  const [userAudioLevel, setUserAudioLevel] = useState(0);
  const ttsAnalyserRef = useRef<AnalyserNode | null>(null);
  const ttsAnimationRef = useRef<number | null>(null);
  const ttsAudioContextRef = useRef<AudioContext | null>(null);
  
  // Captions
  const [caption, setCaption] = useState<string>('');
  const [captionType, setCaptionType] = useState<'user' | 'assistant' | 'status'>('status');
  
  // Input management
  const [userInput, setUserInput] = useState('');
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTranscriptRef = useRef('');
  const isProcessingRef = useRef(false);
  
  // Interrupt detection
  const wasListeningRef = useRef(false);

  // Stop AI audio when user starts speaking
  const stopAIAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
    setTtsAudioLevel(0);
    if (ttsAnimationRef.current) {
      cancelAnimationFrame(ttsAnimationRef.current);
    }
  }, []);

  // Send message function
  const sendMessage = useCallback(async (content: string) => {
    if (!chat || !content.trim() || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setIsProcessing(true);
    
    setCaption(content);
    setCaptionType('user');

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
      
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error('Failed to get response');
      setCaption('Sorry, I encountered an error. Please try again.');
      setCaptionType('assistant');
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [chat, ttsEnabled]);

  // Handle speech result with interrupt detection
  const handleSpeechResult = useCallback((transcript: string, isFinal: boolean) => {
    // If AI is speaking and user starts talking, interrupt
    if (isSpeaking && userAudioLevel > INTERRUPT_THRESHOLD) {
      stopAIAudio();
    }
    
    if (isFinal && !isProcessingRef.current) {
      setUserInput(prev => {
        const updated = prev + (prev ? ' ' : '') + transcript;
        lastTranscriptRef.current = updated;
        return updated;
      });
      
      setCaption(prev => {
        const updated = (prev && captionType === 'user' ? prev + ' ' : '') + transcript;
        return updated;
      });
      setCaptionType('user');
      
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      
      silenceTimeoutRef.current = setTimeout(() => {
        const textToSend = lastTranscriptRef.current.trim();
        if (textToSend && !isProcessingRef.current) {
          setUserInput('');
          lastTranscriptRef.current = '';
          sendMessage(textToSend);
        }
      }, SILENCE_TIMEOUT);
    } else if (!isFinal) {
      const currentText = lastTranscriptRef.current;
      setCaption(currentText + (currentText ? ' ' : '') + transcript);
      setCaptionType('user');
    }
  }, [sendMessage, captionType, isSpeaking, userAudioLevel, stopAIAudio]);

  const {
    isListening,
    isSupported,
    audioLevel,
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
      if (!error.includes('No speech detected')) {
        toast.error(error);
      }
    },
  });

  // Update user audio level for visualization
  useEffect(() => {
    setUserAudioLevel(audioLevel);
    
    // Check for interrupt
    if (isListening && isSpeaking && audioLevel > INTERRUPT_THRESHOLD) {
      stopAIAudio();
    }
  }, [audioLevel, isListening, isSpeaking, stopAIAudio]);

  // Load personas on mount
  useEffect(() => {
    loadPersonas();
  }, []);

  const loadPersonas = async () => {
    try {
      const data = await personasApi.list();
      setPersonas(data);
    } catch (err) {
      console.error('Failed to load personas:', err);
    }
  };

  // Initialize chat - only once on mount
  useEffect(() => {
    const initializeChat = async () => {
      try {
        setIsLoading(true);
        
        // Try to find a recent voice conversation to reuse (within last hour)
        const existingChats = await chatsApi.list(false, false);
        const recentVoiceChat = existingChats.find((c: any) => 
          c.title === 'Voice Conversation' && 
          c.is_owner &&
          // Created within last hour
          new Date(c.updated_at).getTime() > Date.now() - 60 * 60 * 1000
        );
        
        if (recentVoiceChat) {
          // Reuse existing voice chat
          setChat(recentVoiceChat as Chat);
        } else {
          // Create new voice chat
          const newChat = await chatsApi.create({ 
            title: 'Voice Conversation',
          });
          
          // Enable voice mode for conversational responses
          await chatsApi.update(newChat.id, { tts_enabled: true, voice_mode: true } as any);
          setChat(newChat);
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
    
    // Cleanup on unmount
    return () => {
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if (audioRef.current) audioRef.current.pause();
      if (ttsAnimationRef.current) cancelAnimationFrame(ttsAnimationRef.current);
      if (ttsAudioContextRef.current?.state !== 'closed') {
        ttsAudioContextRef.current?.close();
      }
    };
  }, []); // Empty deps - only run once

  // Ref to hold the latest handleMicToggle without causing re-renders
  const handleMicToggleRef = useRef<() => void>(() => {});

  // Toggle mic function
  const handleMicToggle = useCallback(() => {
    if (isListening) {
      stopListening();
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if (userInput.trim() && !isProcessingRef.current) {
        sendMessage(userInput.trim());
        setUserInput('');
        lastTranscriptRef.current = '';
      }
    } else {
      // If AI is speaking, stop it
      if (isSpeaking) stopAIAudio();
      resetTranscript();
      setUserInput('');
      setCaption('');
      setCaptionType('status');
      startListening();
    }
  }, [isListening, stopListening, userInput, sendMessage, isSpeaking, stopAIAudio, resetTranscript, startListening]);

  // Keep ref updated
  useEffect(() => {
    handleMicToggleRef.current = handleMicToggle;
  }, [handleMicToggle]);

  // Keyboard listener - separate effect using ref
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        handleMicToggleRef.current();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // Empty deps - listener uses ref

  // Update chat when persona changes
  const handlePersonaChange = async (persona: Persona | null) => {
    setSelectedPersona(persona);
    setShowPersonaMenu(false);
    
    if (chat) {
      try {
        await chatsApi.update(chat.id, { persona_id: persona?.id || null });
        toast.success(persona ? `Switched to ${persona.name}` : 'Using default assistant');
      } catch (err) {
        console.error('Failed to update persona:', err);
      }
    }
  };

  // Play TTS with interrupt support
  const playTTS = async (text: string) => {
    if (!ttsEnabled || !text.trim()) return;

    setIsSpeaking(true);
    
    try {
      const blob = await tts.generate(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      
      // Setup audio analyzer for visualization
      try {
        if (ttsAudioContextRef.current?.state !== 'closed') {
          await ttsAudioContextRef.current?.close();
        }
        
        const audioContext = new AudioContext();
        ttsAudioContextRef.current = audioContext;
        
        const source = audioContext.createMediaElementSource(audio);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        ttsAnalyserRef.current = analyser;
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        const updateLevel = () => {
          if (ttsAnalyserRef.current && audioRef.current && !audioRef.current.paused) {
            ttsAnalyserRef.current.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            setTtsAudioLevel(Math.min(1, average / 128));
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

  // Toggle TTS
  const handleTTSToggle = () => {
    setTtsEnabled(!ttsEnabled);
    if (audioRef.current && ttsEnabled) {
      stopAIAudio();
    }
  };

  // Current audio level for visualization
  const currentAudioLevel = isSpeaking ? ttsAudioLevel : audioLevel;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-b from-slate-900 via-purple-900/20 to-slate-900">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-4xl">🎙️</span>
          </div>
          <p className="text-gray-400">Starting voice conversation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-900 via-purple-900/20 to-slate-900 overflow-hidden">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-white/10 bg-black/30 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link href="/chat" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <h1 className="font-semibold text-white">Voice Mode</h1>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Persona selector */}
          <div className="relative">
            <button
              onClick={() => setShowPersonaMenu(!showPersonaMenu)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              <span className="text-lg">{selectedPersona?.avatar_emoji || '🤖'}</span>
              <span className="text-sm text-gray-300 hidden sm:inline">
                {selectedPersona?.name || 'Default'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            
            {showPersonaMenu && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 rounded-xl shadow-xl border border-white/10 py-2 z-50">
                <button
                  onClick={() => handlePersonaChange(null)}
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
                    onClick={() => handlePersonaChange(p)}
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
            onClick={handleTTSToggle}
            className={`p-2 rounded-lg transition-colors ${ttsEnabled ? 'bg-purple-500/20 text-purple-400' : 'text-gray-500 hover:bg-white/10'}`}
            title={ttsEnabled ? 'Disable voice' : 'Enable voice'}
          >
            {ttsEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main visualization area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8">
        {/* Large circular visualizer */}
        <button
          onClick={handleMicToggle}
          disabled={isProcessing}
          className="relative group cursor-pointer disabled:cursor-not-allowed transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          {/* Outer glow ring */}
          <div className={`absolute inset-0 rounded-full transition-all duration-500 ${
            isListening 
              ? 'bg-blue-500/20 shadow-[0_0_60px_20px_rgba(59,130,246,0.3)]' 
              : isSpeaking 
              ? 'bg-pink-500/20 shadow-[0_0_60px_20px_rgba(236,72,153,0.3)]'
              : isProcessing
              ? 'bg-purple-500/20 shadow-[0_0_40px_15px_rgba(139,92,246,0.2)] animate-pulse'
              : 'bg-gray-800/50'
          }`} style={{ transform: `scale(${1 + currentAudioLevel * 0.3})` }} />
          
          {/* Main circle */}
          <div className={`relative w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 rounded-full flex items-center justify-center transition-all duration-300 ${
            isListening 
              ? 'bg-gradient-to-br from-blue-600 to-cyan-500' 
              : isSpeaking 
              ? 'bg-gradient-to-br from-pink-600 to-purple-500'
              : isProcessing
              ? 'bg-gradient-to-br from-purple-600 to-indigo-500'
              : 'bg-gradient-to-br from-gray-700 to-gray-800 group-hover:from-gray-600 group-hover:to-gray-700'
          }`}>
            {/* Inner visualization */}
            <div className="absolute inset-4 rounded-full overflow-hidden">
              <VoiceVisualizer 
                audioLevel={currentAudioLevel} 
                isActive={isListening || isSpeaking}
                isAI={isSpeaking}
                isProcessing={isProcessing}
              />
            </div>
            
            {/* Center icon/emoji */}
            <div className={`relative z-10 text-6xl sm:text-7xl md:text-8xl transition-transform ${
              isListening || isSpeaking ? 'scale-110' : ''
            }`}>
              {selectedPersona?.avatar_emoji || (isProcessing ? '💭' : isSpeaking ? '🗣️' : '🎙️')}
            </div>
          </div>
        </button>
        
        {/* Status text */}
        <div className="mt-6 text-center">
          <p className={`text-lg sm:text-xl font-medium transition-colors ${
            isListening ? 'text-blue-400' : isSpeaking ? 'text-pink-400' : isProcessing ? 'text-purple-400' : 'text-gray-400'
          }`}>
            {isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : isProcessing ? 'Thinking...' : 'Tap to speak'}
          </p>
          
          {/* Caption display */}
          {caption && (
            <p className={`mt-4 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed transition-colors ${
              captionType === 'user' ? 'text-blue-300' : captionType === 'assistant' ? 'text-pink-300' : 'text-gray-400'
            }`}>
              {caption}
            </p>
          )}
        </div>
        
        {/* Error display */}
        {speechError && !speechError.includes('No speech detected') && (
          <div className="mt-4 text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-lg">
            {speechError}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <footer className="p-4 text-center">
        <p className="text-gray-500 text-xs">
          {isListening ? 'Speak naturally • Pausing will send your message' : 'Click the circle or press space to start'}
        </p>
      </footer>
    </div>
  );
}


// Voice visualizer component - shows audio-reactive bars inside the circle
function VoiceVisualizer({ 
  audioLevel, 
  isActive, 
  isAI,
  isProcessing 
}: { 
  audioLevel: number; 
  isActive: boolean;
  isAI: boolean;
  isProcessing: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const smoothedLevelRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2;

      // Smooth audio level
      smoothedLevelRef.current += (audioLevel - smoothedLevelRef.current) * 0.3;
      const level = smoothedLevelRef.current;

      ctx.clearRect(0, 0, width, height);

      if (isProcessing) {
        // Processing: rotating dots
        const dots = 12;
        for (let i = 0; i < dots; i++) {
          const angle = (i / dots) * Math.PI * 2 + phaseRef.current * 3;
          const dist = radius * 0.6;
          const x = centerX + Math.cos(angle) * dist;
          const y = centerY + Math.sin(angle) * dist;
          const size = 4 + Math.sin(phaseRef.current * 4 + i * 0.5) * 2;
          
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(168, 85, 247, ${0.5 + Math.sin(phaseRef.current * 4 + i * 0.5) * 0.3})`;
          ctx.fill();
        }
      } else if (isActive) {
        // Active: audio-reactive bars in a circle
        const bars = 32;
        for (let i = 0; i < bars; i++) {
          const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
          
          // Create wave pattern
          const wave1 = Math.sin(i * 0.5 + phaseRef.current * 4) * 0.3;
          const wave2 = Math.sin(i * 0.3 + phaseRef.current * 2) * 0.2;
          const barLevel = Math.max(0.1, level * (1 + wave1 + wave2));
          
          const innerRadius = radius * 0.3;
          const outerRadius = innerRadius + (radius * 0.5) * barLevel;
          
          const x1 = centerX + Math.cos(angle) * innerRadius;
          const y1 = centerY + Math.sin(angle) * innerRadius;
          const x2 = centerX + Math.cos(angle) * outerRadius;
          const y2 = centerY + Math.sin(angle) * outerRadius;
          
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          
          if (isAI) {
            ctx.strokeStyle = `rgba(236, 72, 153, ${0.6 + barLevel * 0.4})`;
          } else {
            ctx.strokeStyle = `rgba(59, 130, 246, ${0.6 + barLevel * 0.4})`;
          }
          ctx.stroke();
        }
      } else {
        // Idle: subtle ambient ring
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      phaseRef.current += 0.02;
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [audioLevel, isActive, isAI, isProcessing]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={300}
      className="w-full h-full"
    />
  );
}
