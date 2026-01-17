'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// Web Speech API types (browser-native, not always available)
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new(): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface UseSpeechRecognitionOptions {
  continuous?: boolean;
  interimResults?: boolean;
  language?: string;
  deviceId?: string | null;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  onAudioLevel?: (level: number) => void;
}

export interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  audioLevel: number;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  error: string | null;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const {
    continuous = true,
    interimResults = true,
    language = 'en-US',
    deviceId = null,
    onResult,
    onError,
    onEnd,
    onAudioLevel,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isStoppingRef = useRef(false);
  const noSpeechCountRef = useRef(0);
  
  // Audio analysis refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Check browser support
  useEffect(() => {
    const SpeechRecognitionAPI = 
      window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognitionAPI);
  }, []);

  // Cleanup audio analyzer
  const cleanupAudioAnalyzer = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // Setup audio analyzer for waveform visualization
  const setupAudioAnalyzer = useCallback(async () => {
    // Clean up any existing analyzer first
    cleanupAudioAnalyzer();
    
    try {
      // Build audio constraints with optional device selection
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      
      // Add device ID if specified
      if (deviceId) {
        audioConstraints.deviceId = { exact: deviceId };
      }
      
      console.log('Setting up audio analyzer with device:', deviceId || 'default');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: audioConstraints
      });
      mediaStreamRef.current = stream;
      
      // Log which device we got
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const settings = audioTrack.getSettings();
        console.log('Audio track settings:', settings);
        console.log('Using device:', audioTrack.label);
      }
      
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      const updateLevel = () => {
        if (analyserRef.current && !isStoppingRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          
          // Calculate weighted average (emphasize mid frequencies for voice)
          let sum = 0;
          let count = 0;
          for (let i = 2; i < dataArray.length / 2; i++) {
            sum += dataArray[i];
            count++;
          }
          const average = sum / count;
          const normalizedLevel = Math.min(1, average / 128);
          
          setAudioLevel(normalizedLevel);
          onAudioLevel?.(normalizedLevel);
          
          animationFrameRef.current = requestAnimationFrame(updateLevel);
        }
      };
      
      updateLevel();
      return true;
    } catch (err) {
      console.error('Audio analyzer setup failed:', err);
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          setError('Microphone permission denied. Please allow microphone access.');
          onError?.('Microphone permission denied. Please allow microphone access.');
        } else if (err.name === 'NotFoundError') {
          setError('Selected microphone not found. Please choose a different device.');
          onError?.('Selected microphone not found. Please choose a different device.');
        } else if (err.name === 'OverconstrainedError') {
          setError('Selected microphone is not available. Please choose a different device.');
          onError?.('Selected microphone is not available. Please choose a different device.');
        }
      }
      return false;
    }
  }, [deviceId, onAudioLevel, onError, cleanupAudioAnalyzer]);

  const startListening = useCallback(async () => {
    const SpeechRecognitionAPI = 
      window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognitionAPI) {
      setError('Speech recognition not supported');
      onError?.('Speech recognition not supported');
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    // Setup audio analyzer first to verify mic access
    const audioSetupSuccess = await setupAudioAnalyzer();
    if (!audioSetupSuccess) {
      return; // Error already set by setupAudioAnalyzer
    }

    isStoppingRef.current = false;
    noSpeechCountRef.current = 0;
    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;

    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = language;

    recognition.onstart = () => {
      console.log('Speech recognition started');
      setIsListening(true);
      setError(null);
    };

    recognition.onaudiostart = () => {
      console.log('Audio capture started');
    };

    recognition.onsoundstart = () => {
      console.log('Sound detected');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Reset no-speech counter on successful result
      noSpeechCountRef.current = 0;
      
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      if (finalText) {
        setTranscript(prev => prev + finalText);
        onResult?.(finalText, true);
      }
      
      setInterimTranscript(interimText);
      if (interimText) {
        onResult?.(interimText, false);
      }
    };

    recognition.onerror = (event: Event) => {
      const errorEvent = event as Event & { error?: string };
      const errorCode = errorEvent.error || 'unknown';
      
      console.log('Speech recognition error:', errorCode);
      
      // Don't report abort as error when we're stopping
      if (errorCode === 'aborted' && isStoppingRef.current) {
        return;
      }
      
      // Handle no-speech error - this is common and expected
      if (errorCode === 'no-speech') {
        noSpeechCountRef.current++;
        console.log(`No speech detected (count: ${noSpeechCountRef.current})`);
        
        // Only show error after multiple consecutive no-speech events
        if (noSpeechCountRef.current >= 5) {
          const errorMsg = 'No speech detected. Please check your microphone selection and speak clearly.';
          setError(errorMsg);
          onError?.(errorMsg);
        }
        
        // Auto-restart if continuous mode (silently)
        if (continuous && !isStoppingRef.current) {
          setTimeout(() => {
            try {
              if (recognitionRef.current) {
                recognitionRef.current.start();
              }
            } catch (e) {
              // Ignore - may already be started
            }
          }, 100);
        }
        return;
      }
      
      // Map error codes to user-friendly messages
      const errorMessages: Record<string, string> = {
        'audio-capture': 'No microphone found. Please check your audio input device.',
        'not-allowed': 'Microphone permission denied. Please allow microphone access in your browser.',
        'network': 'Network error. Please check your internet connection.',
        'service-not-allowed': 'Speech service not available. Please try a different browser.',
      };
      
      const errorMsg = errorMessages[errorCode] || `Speech recognition error: ${errorCode}`;
      setError(errorMsg);
      onError?.(errorMsg);
      setIsListening(false);
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      
      // Auto-restart if continuous and not manually stopped
      if (continuous && !isStoppingRef.current && recognitionRef.current) {
        try {
          recognition.start();
        } catch (e) {
          // Ignore if already started or other error
          setIsListening(false);
          setInterimTranscript('');
          cleanupAudioAnalyzer();
          onEnd?.();
        }
      } else {
        setIsListening(false);
        setInterimTranscript('');
        cleanupAudioAnalyzer();
        onEnd?.();
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recognition:', e);
      setError('Failed to start recognition');
      onError?.('Failed to start recognition');
      cleanupAudioAnalyzer();
    }
  }, [continuous, interimResults, language, onResult, onError, onEnd, setupAudioAnalyzer, cleanupAudioAnalyzer]);

  const stopListening = useCallback(() => {
    console.log('Stopping speech recognition');
    isStoppingRef.current = true;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
    cleanupAudioAnalyzer();
  }, [cleanupAudioAnalyzer]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
    noSpeechCountRef.current = 0;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isStoppingRef.current = true;
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      cleanupAudioAnalyzer();
    };
  }, [cleanupAudioAnalyzer]);

  return {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    audioLevel,
    startListening,
    stopListening,
    resetTranscript,
    error,
  };
}
