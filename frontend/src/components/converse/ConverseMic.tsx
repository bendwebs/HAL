'use client';

import { Mic, MicOff, Loader2 } from 'lucide-react';

interface ConverseMicProps {
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  isSupported: boolean;
  onToggle: () => void;
}

export function ConverseMic({
  isListening,
  isSpeaking,
  isProcessing,
  isSupported,
  onToggle,
}: ConverseMicProps) {
  if (!isSupported) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="w-32 h-32 rounded-full bg-error/20 flex items-center justify-center">
          <MicOff className="w-16 h-16 text-error" />
        </div>
        <p className="text-error text-sm">Speech recognition not supported</p>
        <p className="text-text-muted text-xs">Please use Chrome or Edge browser</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Main mic button with ripple effect */}
      <div className="relative">
        {/* Ripple animation when listening */}
        {isListening && (
          <>
            <div className="absolute inset-0 w-32 h-32 rounded-full bg-accent/30 animate-ping" />
            <div className="absolute inset-2 w-28 h-28 rounded-full bg-accent/20 animate-pulse" />
          </>
        )}
        
        {/* Speaking indicator */}
        {isSpeaking && (
          <div className="absolute inset-0 w-32 h-32 rounded-full border-4 border-accent animate-pulse" />
        )}

        <button
          onClick={onToggle}
          disabled={isProcessing || isSpeaking}
          className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
            isListening
              ? 'bg-accent shadow-lg shadow-accent/30'
              : isSpeaking
              ? 'bg-accent/50 cursor-not-allowed'
              : isProcessing
              ? 'bg-surface cursor-wait'
              : 'bg-surface hover:bg-surface-hover hover:scale-105'
          } disabled:cursor-not-allowed`}
        >
          {isProcessing ? (
            <Loader2 className="w-12 h-12 text-accent animate-spin" />
          ) : isListening ? (
            <Mic className="w-12 h-12 text-white animate-pulse" />
          ) : (
            <Mic className="w-12 h-12 text-text-muted" />
          )}
        </button>
      </div>

      {/* Status text */}
      <p className="text-text-secondary text-sm">
        {isProcessing
          ? 'Processing...'
          : isSpeaking
          ? 'HAL is speaking...'
          : isListening
          ? 'Listening... Click to stop'
          : 'Click to start speaking'}
      </p>

      {/* Instructions */}
      <div className="text-center text-text-muted text-xs max-w-xs">
        <p>Speak naturally. When you pause, your message will be sent automatically.</p>
      </div>
    </div>
  );
}
