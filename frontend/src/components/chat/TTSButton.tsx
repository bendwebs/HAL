'use client';

import { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, Loader2, Square } from 'lucide-react';
import { tts } from '@/lib/api';

interface TTSButtonProps {
  text: string;
  voiceId?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export function TTSButton({ text, voiceId, disabled, size = 'sm' }: TTSButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const handlePlay = async () => {
    if (isLoading) return;

    // If already playing, stop
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Generate speech
      const blob = await tts.generate(text, voiceId);
      
      // Clean up old audio URL
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      
      // Create new audio
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      
      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onended = () => {
        setIsPlaying(false);
      };
      
      audio.onerror = () => {
        setError('Failed to play audio');
        setIsPlaying(false);
      };
      
      await audio.play();
      setIsPlaying(true);
      
    } catch (err) {
      console.error('TTS error:', err);
      setError('Failed to generate speech');
    } finally {
      setIsLoading(false);
    }
  };

  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const buttonSize = size === 'sm' ? 'p-1.5' : 'p-2';

  return (
    <button
      onClick={handlePlay}
      disabled={disabled || isLoading}
      title={error || (isPlaying ? 'Stop' : 'Read aloud')}
      className={`${buttonSize} rounded-lg transition-colors ${
        error 
          ? 'text-error hover:bg-error/10' 
          : isPlaying 
            ? 'text-accent bg-accent/10' 
            : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {isLoading ? (
        <Loader2 className={`${iconSize} animate-spin`} />
      ) : isPlaying ? (
        <Square className={iconSize} />
      ) : (
        <Volume2 className={iconSize} />
      )}
    </button>
  );
}
