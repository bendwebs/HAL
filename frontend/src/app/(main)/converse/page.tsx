'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { chats as chatsApi, messages as messagesApi, tts, personas as personasApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { ArrowLeft, Volume2, VolumeX, ChevronDown, Mic } from 'lucide-react';
import { Chat, StreamChunk } from '@/types';
import toast from 'react-hot-toast';
import Link from 'next/link';

// Configuration
const SILENCE_TIMEOUT = 1500;
const INTERRUPT_THRESHOLD = 0.15;

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
  
  // Audio visualization - store frequency data for waveform
  const [ttsAudioLevel, setTtsAudioLevel] = useState(0);
  const [frequencyData, setFrequencyData] = useState<number[]>(new Array(64).fill(0));
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
      setCaption('Sorry, I encountered an error.');
      setCaptionType('assistant');
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [chat, ttsEnabled]);

  // Handle speech result
  const handleSpeechResult = useCallback((transcript: string, isFinal: boolean) => {
    if (isSpeaking && audioLevel > INTERRUPT_THRESHOLD) {
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
      
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      
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
  }, [sendMessage, captionType, isSpeaking, stopAIAudio]);

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

  // Update frequency data for user audio (simulated from level)
  useEffect(() => {
    if (isListening && !isSpeaking) {
      // Generate simulated frequency data from audio level
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
  }, []);

  const loadPersonas = async () => {
    try {
      const data = await personasApi.list();
      setPersonas(data);
    } catch (err) {
      console.error('Failed to load personas:', err);
    }
  };

  // Initialize chat
  useEffect(() => {
    const initializeChat = async () => {
      try {
        setIsLoading(true);
        const existingChats = await chatsApi.list(false, false);
        const recentVoiceChat = existingChats.find((c: any) => 
          c.title === 'Voice Conversation' && 
          c.is_owner &&
          new Date(c.updated_at).getTime() > Date.now() - 60 * 60 * 1000
        );
        
        if (recentVoiceChat) {
          setChat(recentVoiceChat as Chat);
        } else {
          const newChat = await chatsApi.create({ title: 'Voice Conversation' });
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
    
    return () => {
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if (audioRef.current) audioRef.current.pause();
      if (ttsAnimationRef.current) cancelAnimationFrame(ttsAnimationRef.current);
      if (ttsAudioContextRef.current?.state !== 'closed') {
        ttsAudioContextRef.current?.close();
      }
    };
  }, []);

  const handleMicToggleRef = useRef<() => void>(() => {});

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
      if (isSpeaking) stopAIAudio();
      resetTranscript();
      setUserInput('');
      setCaption('');
      setCaptionType('status');
      startListening();
    }
  }, [isListening, stopListening, userInput, sendMessage, isSpeaking, stopAIAudio, resetTranscript, startListening]);

  useEffect(() => {
    handleMicToggleRef.current = handleMicToggle;
  }, [handleMicToggle]);

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
    if (chat) {
      try {
        await chatsApi.update(chat.id, { persona_id: persona?.id || null });
        toast.success(persona ? `Switched to ${persona.name}` : 'Using default assistant');
      } catch (err) {
        console.error('Failed to update persona:', err);
      }
    }
  };

  const playTTS = async (text: string) => {
    if (!ttsEnabled || !text.trim()) return;
    setIsSpeaking(true);
    
    try {
      const blob = await tts.generate(text);
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
            
            // Convert to normalized array for visualization
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
    <div className="h-full flex flex-col bg-[#0a0a1a] overflow-hidden">
      {/* Gradient background overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-purple-900/10 via-transparent to-purple-900/20 pointer-events-none" />
      
      {/* Header */}
      <header className="relative z-10 h-14 flex items-center justify-between px-4 bg-black/20 backdrop-blur-sm border-b border-white/5">
        <div className="flex items-center gap-3">
          <Link href="/chat" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <h1 className="font-medium text-white/90">Voice Mode</h1>
        </div>
        
        <div className="flex items-center gap-2">
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
              <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800/95 backdrop-blur-sm rounded-xl shadow-xl border border-white/10 py-2 z-50">
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
          >
            {ttsEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4">
        {/* Glowing Ring Visualizer */}
        <button
          onClick={handleMicToggle}
          disabled={isProcessing}
          className="relative focus:outline-none"
        >
          <GlowingRing 
            audioLevel={currentAudioLevel}
            isActive={isListening || isSpeaking}
            isProcessing={isProcessing}
            isAI={isSpeaking}
            isListening={isListening}
          />
        </button>

        {/* Status text */}
        <p className={`mt-8 text-xl font-light tracking-wide transition-colors ${
          isListening ? 'text-cyan-400' 
          : isSpeaking ? 'text-purple-400' 
          : isProcessing ? 'text-purple-300'
          : 'text-gray-400'
        }`}>
          {isListening ? "I'm listening..." 
           : isSpeaking ? 'Speaking...' 
           : isProcessing ? 'Thinking...' 
           : 'Tap to speak'}
        </p>

        {/* Waveform Visualizer */}
        <div className="mt-8 w-full max-w-lg">
          <WaveformVisualizer 
            frequencyData={frequencyData}
            isActive={isListening || isSpeaking}
            isAI={isSpeaking}
          />
        </div>

        {/* Caption display */}
        {caption && (
          <div className="mt-6 max-w-2xl text-center">
            <p className={`text-base leading-relaxed ${
              captionType === 'user' ? 'text-cyan-300/80' : 'text-purple-300/80'
            }`}>
              {caption}
            </p>
          </div>
        )}

        {/* Error display */}
        {speechError && !speechError.includes('No speech detected') && (
          <div className="mt-4 text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-lg">
            {speechError}
          </div>
        )}
      </div>

      {/* Bottom input bar (visual only for now) */}
      <div className="relative z-10 p-4">
        <div className="max-w-lg mx-auto flex items-center gap-3 bg-white/5 backdrop-blur-sm rounded-full px-4 py-3 border border-white/10">
          <div className="flex-1 text-gray-500 text-sm">
            {isListening ? 'Listening...' : 'Press space or tap circle to speak'}
          </div>
          <button
            onClick={handleMicToggle}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              isListening 
                ? 'bg-gradient-to-r from-cyan-500 to-purple-500 shadow-lg shadow-purple-500/30' 
                : 'bg-purple-600 hover:bg-purple-500'
            }`}
          >
            <Mic className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}


// Glowing Ring Component - inspired by first image
function GlowingRing({ 
  audioLevel, 
  isActive, 
  isProcessing,
  isAI = false,
  isListening = false
}: { 
  audioLevel: number;
  isActive: boolean;
  isProcessing: boolean;
  isAI?: boolean;
  isListening?: boolean;
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

    const size = 280;
    canvas.width = size;
    canvas.height = size;
    
    const centerX = size / 2;
    const centerY = size / 2;
    const baseRadius = 90;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      
      // Smooth audio level
      smoothedLevelRef.current += (audioLevel - smoothedLevelRef.current) * 0.15;
      const level = smoothedLevelRef.current;
      
      // Determine colors based on state
      let primaryColor = 'rgba(139, 92, 246, '; // purple
      let secondaryColor = 'rgba(79, 70, 229, '; // indigo
      let glowColor = 'rgba(139, 92, 246, ';
      
      if (isListening) {
        primaryColor = 'rgba(6, 182, 212, '; // cyan
        secondaryColor = 'rgba(139, 92, 246, '; // purple
        glowColor = 'rgba(6, 182, 212, ';
      } else if (isAI) {
        primaryColor = 'rgba(168, 85, 247, '; // purple
        secondaryColor = 'rgba(236, 72, 153, '; // pink
        glowColor = 'rgba(168, 85, 247, ';
      }

      // Outer glow layers
      const glowLayers = 4;
      for (let i = glowLayers; i >= 0; i--) {
        const glowRadius = baseRadius + 20 + i * 15 + level * 30;
        const alpha = (0.03 + level * 0.05) * (1 - i / glowLayers);
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = glowColor + alpha + ')';
        ctx.fill();
      }

      // Main ring with gradient
      const ringWidth = 4 + level * 6;
      const ringRadius = baseRadius + level * 15;
      
      // Create gradient for ring
      const gradient = ctx.createLinearGradient(
        centerX - ringRadius, centerY - ringRadius,
        centerX + ringRadius, centerY + ringRadius
      );
      gradient.addColorStop(0, primaryColor + '0.9)');
      gradient.addColorStop(0.5, secondaryColor + '0.9)');
      gradient.addColorStop(1, primaryColor + '0.9)');

      ctx.beginPath();
      ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = ringWidth;
      ctx.stroke();

      // Animated particles/dots around ring when active
      if (isActive || isProcessing) {
        const particleCount = isProcessing ? 8 : 16;
        const particleSpeed = isProcessing ? 2 : 1;
        
        for (let i = 0; i < particleCount; i++) {
          const angle = (i / particleCount) * Math.PI * 2 + phaseRef.current * particleSpeed;
          const particleRadius = ringRadius + 15 + Math.sin(angle * 3 + phaseRef.current * 2) * (5 + level * 10);
          
          const x = centerX + Math.cos(angle) * particleRadius;
          const y = centerY + Math.sin(angle) * particleRadius;
          
          const particleSize = 2 + level * 3 + Math.sin(phaseRef.current * 3 + i) * 1;
          const particleAlpha = 0.4 + level * 0.4 + Math.sin(phaseRef.current * 2 + i * 0.5) * 0.2;
          
          ctx.beginPath();
          ctx.arc(x, y, particleSize, 0, Math.PI * 2);
          ctx.fillStyle = primaryColor + particleAlpha + ')';
          ctx.fill();
        }
      }

      // Inner subtle ring
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius - 20, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.stroke();

      phaseRef.current += 0.02;
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [audioLevel, isActive, isProcessing, isAI, isListening]);

  return (
    <div className="relative cursor-pointer group">
      <canvas 
        ref={canvasRef} 
        className="w-[280px] h-[280px] transition-transform group-hover:scale-105 group-active:scale-95"
      />
    </div>
  );
}


// Waveform Visualizer Component - inspired by second image
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 500;
    const height = 120;
    canvas.width = width;
    canvas.height = height;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      
      // Smooth the frequency data
      for (let i = 0; i < smoothedDataRef.current.length; i++) {
        const target = frequencyData[i] || 0;
        smoothedDataRef.current[i] += (target - smoothedDataRef.current[i]) * 0.2;
      }
      
      const data = smoothedDataRef.current;
      const centerY = height / 2;
      
      // Determine colors
      let color1 = isAI ? 'rgba(168, 85, 247, ' : 'rgba(6, 182, 212, '; // purple or cyan
      let color2 = isAI ? 'rgba(236, 72, 153, ' : 'rgba(139, 92, 246, '; // pink or purple

      // Create flowing wave effect
      const points: { x: number; y: number }[] = [];
      const segments = 64;
      
      for (let i = 0; i <= segments; i++) {
        const x = (i / segments) * width;
        const dataIndex = Math.floor((i / segments) * data.length);
        const amplitude = (data[dataIndex] || 0) * 40;
        
        // Add wave motion
        const wave1 = Math.sin(i * 0.15 + phaseRef.current * 2) * 5;
        const wave2 = Math.sin(i * 0.08 + phaseRef.current * 1.5) * 8;
        
        const baseAmplitude = isActive ? amplitude + wave1 + wave2 : wave1 * 0.3;
        
        points.push({ x, y: centerY - baseAmplitude });
      }

      // Draw gradient fill for upper wave
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, color1 + '0.1)');
      gradient.addColorStop(0.3, color2 + '0.3)');
      gradient.addColorStop(0.5, color1 + '0.4)');
      gradient.addColorStop(0.7, color2 + '0.3)');
      gradient.addColorStop(1, color1 + '0.1)');

      // Upper wave fill
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(width, centerY);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Lower wave (mirrored)
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      points.forEach(p => ctx.lineTo(p.x, centerY + (centerY - p.y)));
      ctx.lineTo(width, centerY);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Draw the main wave lines
      const lineGradient = ctx.createLinearGradient(0, 0, width, 0);
      lineGradient.addColorStop(0, color1 + '0.3)');
      lineGradient.addColorStop(0.5, color2 + '0.8)');
      lineGradient.addColorStop(1, color1 + '0.3)');

      // Upper line
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const xc = (points[i].x + points[i - 1].x) / 2;
        const yc = (points[i].y + points[i - 1].y) / 2;
        ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
      }
      ctx.strokeStyle = lineGradient;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Lower line (mirrored)
      ctx.beginPath();
      const mirroredPoints = points.map(p => ({ x: p.x, y: centerY + (centerY - p.y) }));
      ctx.moveTo(mirroredPoints[0].x, mirroredPoints[0].y);
      for (let i = 1; i < mirroredPoints.length; i++) {
        const xc = (mirroredPoints[i].x + mirroredPoints[i - 1].x) / 2;
        const yc = (mirroredPoints[i].y + mirroredPoints[i - 1].y) / 2;
        ctx.quadraticCurveTo(mirroredPoints[i - 1].x, mirroredPoints[i - 1].y, xc, yc);
      }
      ctx.strokeStyle = lineGradient;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Center line
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.stroke();

      phaseRef.current += 0.03;
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [frequencyData, isActive, isAI]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-[120px] opacity-80"
    />
  );
}
