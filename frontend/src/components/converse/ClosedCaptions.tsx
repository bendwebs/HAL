'use client';

import { useEffect, useRef } from 'react';
import { Mic, Bot } from 'lucide-react';

interface CaptionEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isInterim?: boolean;
  timestamp: Date;
}

interface ClosedCaptionsProps {
  entries: CaptionEntry[];
  currentInterim?: string;
  isListening?: boolean;
  isSpeaking?: boolean;
}

export function ClosedCaptions({
  entries,
  currentInterim,
  isListening,
  isSpeaking,
}: ClosedCaptionsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries, currentInterim]);

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Captions Display */}
      <div
        ref={containerRef}
        className="bg-black/80 backdrop-blur-sm rounded-xl p-4 max-h-48 overflow-y-auto"
      >
        {entries.length === 0 && !currentInterim && (
          <p className="text-white/60 text-center text-sm">
            {isListening ? 'Listening...' : 'Captions will appear here'}
          </p>
        )}

        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-start gap-2 ${
                entry.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {entry.role === 'assistant' && (
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-accent" />
                </div>
              )}
              
              <div
                className={`max-w-[85%] ${
                  entry.role === 'user'
                    ? 'bg-accent/30 text-white'
                    : 'bg-white/10 text-white'
                } rounded-lg px-3 py-2`}
              >
                <p className="text-sm leading-relaxed">{entry.text}</p>
              </div>

              {entry.role === 'user' && (
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                  <Mic className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          ))}

          {/* Current interim transcript */}
          {currentInterim && (
            <div className="flex items-start gap-2 justify-end">
              <div className="max-w-[85%] bg-accent/20 text-white/70 rounded-lg px-3 py-2 border border-accent/30">
                <p className="text-sm leading-relaxed italic">{currentInterim}</p>
              </div>
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
                <Mic className="w-4 h-4 text-white" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status indicators */}
      <div className="flex justify-center gap-4 mt-3">
        {isListening && (
          <div className="flex items-center gap-2 text-green-400 text-xs">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Listening
          </div>
        )}
        {isSpeaking && (
          <div className="flex items-center gap-2 text-accent text-xs">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            Speaking
          </div>
        )}
      </div>
    </div>
  );
}

export type { CaptionEntry };
