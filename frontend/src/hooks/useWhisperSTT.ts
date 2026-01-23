'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { stt } from '@/lib/api';

export interface UseWhisperSTTOptions {
  language?: string;
  silenceThreshold?: number;      // Audio level below which we consider silence (0-1)
  silenceDuration?: number;       // How long silence must last before we send (ms)
  maxRecordingDuration?: number;  // Max recording length before auto-send (ms)
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onAudioLevel?: (level: number) => void;
}

export interface UseWhisperSTTReturn {
  isListening: boolean;
  isProcessing: boolean;
  isSupported: boolean;
  audioLevel: number;
  transcript: string;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  resetTranscript: () => void;
}

export function useWhisperSTT(options: UseWhisperSTTOptions = {}): UseWhisperSTTReturn {
  const {
    language,
    silenceThreshold = 0.015,      // Lowered - more sensitive to silence
    silenceDuration = 800,         // Reduced from 1500ms for faster response
    maxRecordingDuration = 15000,  // Reduced from 30s - shorter chunks = faster
    onTranscript,
    onError,
    onAudioLevel,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  // Refs for audio handling
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  // Silence detection refs
  const silenceStartRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number | null>(null);
  const isStoppingRef = useRef(false);

  // Check browser support
  useEffect(() => {
    const supported = !!(
      navigator.mediaDevices?.getUserMedia &&
      window.MediaRecorder &&
      window.AudioContext
    );
    setIsSupported(supported);
  }, []);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    
    chunksRef.current = [];
    silenceStartRef.current = null;
    recordingStartRef.current = null;
    setAudioLevel(0);
  }, []);

  // Send audio for transcription
  const sendForTranscription = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size < 1000) {
      console.log('[Whisper] Audio too small, skipping');
      return;
    }

    setIsProcessing(true);
    
    try {
      console.log(`[Whisper] Sending ${(audioBlob.size / 1024).toFixed(1)}KB for transcription`);
      const result = await stt.transcribe(audioBlob, language);
      
      if (result.text.trim()) {
        console.log(`[Whisper] Transcribed: "${result.text}" (${result.metadata.transcribe_time.toFixed(2)}s)`);
        setTranscript(prev => {
          const newText = prev ? prev + ' ' + result.text.trim() : result.text.trim();
          return newText;
        });
        onTranscript?.(result.text.trim(), true);
      } else {
        console.log('[Whisper] No speech detected in audio');
      }
    } catch (err) {
      console.error('[Whisper] Transcription error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Transcription failed';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  }, [language, onTranscript, onError]);

  // Process recorded audio
  const processRecording = useCallback(() => {
    if (chunksRef.current.length === 0) return;
    
    const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
    chunksRef.current = [];
    
    sendForTranscription(audioBlob);
  }, [sendForTranscription]);

  // Start listening
  const startListening = useCallback(async () => {
    if (isListening) return;
    
    setError(null);
    isStoppingRef.current = false;
    
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      mediaStreamRef.current = stream;
      
      // Setup audio analyzer for level detection
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      // Setup MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        if (!isStoppingRef.current) {
          processRecording();
        }
      };
      
      // Start recording
      mediaRecorderRef.current.start(100); // Collect chunks every 100ms
      recordingStartRef.current = Date.now();
      setIsListening(true);
      
      // Audio level monitoring and silence detection
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      const checkAudioLevel = () => {
        if (!analyserRef.current || isStoppingRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate RMS level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length) / 255;
        
        setAudioLevel(rms);
        onAudioLevel?.(rms);

        // Silence detection
        if (rms < silenceThreshold) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current > silenceDuration) {
            // Silence detected - send current recording
            console.log('[Whisper] Silence detected, sending audio');
            if (mediaRecorderRef.current?.state === 'recording') {
              mediaRecorderRef.current.stop();
              // Restart recording for next utterance
              setTimeout(() => {
                if (!isStoppingRef.current && mediaStreamRef.current) {
                  chunksRef.current = [];
                  mediaRecorderRef.current?.start(100);
                  recordingStartRef.current = Date.now();
                  silenceStartRef.current = null;
                }
              }, 100);
            }
          }
        } else {
          silenceStartRef.current = null;
        }
        
        // Max duration check
        if (recordingStartRef.current && Date.now() - recordingStartRef.current > maxRecordingDuration) {
          console.log('[Whisper] Max duration reached, sending audio');
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            setTimeout(() => {
              if (!isStoppingRef.current && mediaStreamRef.current) {
                chunksRef.current = [];
                mediaRecorderRef.current?.start(100);
                recordingStartRef.current = Date.now();
              }
            }, 100);
          }
        }
        
        animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
      };
      
      checkAudioLevel();
      console.log('[Whisper] Started listening');
      
    } catch (err) {
      console.error('[Whisper] Failed to start:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to access microphone';
      setError(errorMsg);
      onError?.(errorMsg);
      cleanup();
    }
  }, [isListening, silenceThreshold, silenceDuration, maxRecordingDuration, onAudioLevel, onError, cleanup, processRecording]);

  // Stop listening
  const stopListening = useCallback(() => {
    console.log('[Whisper] Stopping...');
    isStoppingRef.current = true;
    
    // Process any remaining audio
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      // Wait a bit for final chunk then process
      setTimeout(() => {
        if (chunksRef.current.length > 0) {
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
          chunksRef.current = [];
          sendForTranscription(audioBlob);
        }
        cleanup();
      }, 200);
    } else {
      cleanup();
    }
    
    setIsListening(false);
  }, [cleanup, sendForTranscription]);

  // Reset transcript
  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isStoppingRef.current = true;
      cleanup();
    };
  }, [cleanup]);

  return {
    isListening,
    isProcessing,
    isSupported,
    audioLevel,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
