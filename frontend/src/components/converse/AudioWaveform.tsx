'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Mic } from 'lucide-react';

interface AudioWaveformProps {
  audioLevel: number;  // 0-1 normalized audio level
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  width?: number;
  height?: number;
}

export function AudioWaveform({ 
  audioLevel, 
  isListening, 
  isSpeaking,
  isProcessing,
  width = 400, 
  height = 150 
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const smoothedLevelRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Smooth the audio level for less jittery animation
    smoothedLevelRef.current += (audioLevel - smoothedLevelRef.current) * 0.3;
    const smoothLevel = smoothedLevelRef.current;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    const centerY = height / 2;
    const isActive = isListening || isSpeaking || isProcessing;
    
    if (!isActive) {
      // Idle state - subtle ambient wave
      drawIdleWave(ctx, width, height, centerY);
    } else if (isProcessing) {
      // Processing state - pulsing animation
      drawProcessingWave(ctx, width, height, centerY);
    } else {
      // Active state - audio-reactive waveform
      drawActiveWave(ctx, width, height, centerY, smoothLevel, isSpeaking);
    }
    
    phaseRef.current += 0.03;
    animationRef.current = requestAnimationFrame(draw);
  }, [audioLevel, isListening, isSpeaking, isProcessing, width, height]);

  const drawIdleWave = (
    ctx: CanvasRenderingContext2D, 
    w: number, 
    h: number, 
    centerY: number
  ) => {
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)');   // Blue
    gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.4)'); // Purple
    gradient.addColorStop(1, 'rgba(236, 72, 153, 0.4)');   // Pink
    
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    
    for (let x = 0; x < w; x++) {
      const wave1 = Math.sin((x * 0.015) + phaseRef.current) * 15;
      const wave2 = Math.sin((x * 0.025) + phaseRef.current * 1.5) * 8;
      const y = centerY + wave1 + wave2;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  const drawProcessingWave = (
    ctx: CanvasRenderingContext2D, 
    w: number, 
    h: number, 
    centerY: number
  ) => {
    const bars = 40;
    const barWidth = w / bars;
    const maxBarHeight = h * 0.6;
    
    for (let i = 0; i < bars; i++) {
      const x = i * barWidth + barWidth * 0.15;
      
      // Create a traveling wave effect
      const normalizedPos = i / bars;
      const wave = Math.sin((normalizedPos * Math.PI * 4) + phaseRef.current * 4);
      const barHeight = maxBarHeight * 0.3 * (0.5 + wave * 0.5);
      
      // Purple gradient for processing
      const gradient = ctx.createLinearGradient(x, centerY - barHeight / 2, x, centerY + barHeight / 2);
      gradient.addColorStop(0, 'rgba(139, 92, 246, 0.8)');
      gradient.addColorStop(1, 'rgba(168, 85, 247, 0.8)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, centerY - barHeight / 2, barWidth * 0.7, barHeight, 4);
      ctx.fill();
    }
  };

  const drawActiveWave = (
    ctx: CanvasRenderingContext2D, 
    w: number, 
    h: number, 
    centerY: number,
    level: number,
    isAI: boolean
  ) => {
    const bars = 50;
    const barWidth = w / bars;
    const maxBarHeight = h * 0.8;
    
    // Add glow effect
    ctx.shadowBlur = 15;
    ctx.shadowColor = isAI ? 'rgba(236, 72, 153, 0.5)' : 'rgba(59, 130, 246, 0.5)';
    
    for (let i = 0; i < bars; i++) {
      const x = i * barWidth + barWidth * 0.1;
      
      // Create natural wave pattern
      const normalizedPos = (i / bars) * 2 - 1; // -1 to 1
      const distanceFromCenter = Math.abs(normalizedPos);
      const baseAmplitude = 1 - Math.pow(distanceFromCenter, 1.5) * 0.8;
      
      // Multiple wave frequencies for organic feel
      const wave1 = Math.sin((i * 0.3) + phaseRef.current * 3) * 0.3;
      const wave2 = Math.sin((i * 0.5) + phaseRef.current * 2) * 0.2;
      const wave3 = Math.sin((i * 0.15) + phaseRef.current * 4) * 0.15;
      
      const audioInfluence = Math.max(0.15, level) * (1 + wave1 + wave2 + wave3);
      const barHeight = maxBarHeight * baseAmplitude * audioInfluence;
      
      // Create gradient - different colors for user (blue) vs AI (pink)
      const gradient = ctx.createLinearGradient(
        x, centerY - barHeight / 2, 
        x, centerY + barHeight / 2
      );
      
      if (isAI) {
        // AI speaking - pink to purple
        gradient.addColorStop(0, 'rgba(236, 72, 153, 0.95)');
        gradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.9)');
        gradient.addColorStop(1, 'rgba(139, 92, 246, 0.85)');
      } else {
        // User speaking - blue to purple
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.95)');
        gradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.9)');
        gradient.addColorStop(1, 'rgba(139, 92, 246, 0.85)');
      }
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, centerY - barHeight / 2, barWidth * 0.8, barHeight, 4);
      ctx.fill();
    }
    
    ctx.shadowBlur = 0;
  };

  useEffect(() => {
    draw();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [draw]);

  return (
    <div className="relative flex flex-col items-center gap-4">
      {/* Microphone icon */}
      <div className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
        isListening 
          ? 'border-blue-400 text-blue-400 bg-blue-400/10' 
          : isSpeaking
          ? 'border-pink-400 text-pink-400 bg-pink-400/10'
          : isProcessing
          ? 'border-purple-400 text-purple-400 bg-purple-400/10 animate-pulse'
          : 'border-gray-500 text-gray-500 bg-transparent'
      }`}>
        <Mic className={`w-6 h-6 ${isListening ? 'animate-pulse' : ''}`} />
      </div>

      {/* Status label */}
      <span className={`text-sm font-medium tracking-wide transition-colors ${
        isListening 
          ? 'text-blue-400' 
          : isSpeaking
          ? 'text-pink-400'
          : isProcessing
          ? 'text-purple-400'
          : 'text-gray-400'
      }`}>
        {isListening ? 'listening...' : isSpeaking ? 'speaking...' : isProcessing ? 'thinking...' : 'voice assistant'}
      </span>

      {/* Waveform canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded-xl"
        style={{ 
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 27, 75, 0.9) 100%)'
        }}
      />
    </div>
  );
}
