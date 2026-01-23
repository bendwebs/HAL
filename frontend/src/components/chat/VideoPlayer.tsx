'use client';

import { useState } from 'react';
import { X, ExternalLink, Minimize2, Maximize2 } from 'lucide-react';

export interface VideoPlayerVideo {
  video_id: string;
  title: string;
  channel_title?: string;
  url: string;
  embed_url: string;
}

interface VideoPlayerProps {
  video: VideoPlayerVideo;
  onClose: () => void;
}

export default function VideoPlayer({ video, onClose }: VideoPlayerProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only allow drag from the header
    if ((e.target as HTMLElement).closest('.video-header')) {
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition(prev => ({
      x: Math.max(0, prev.x + e.movementX),
      y: Math.max(0, prev.y + e.movementY)
    }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      className="fixed z-50"
      style={{ 
        right: `${position.x}px`, 
        bottom: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'default'
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className={`bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700 overflow-hidden transition-all ${
        isMinimized ? 'w-72' : 'w-[480px]'
      }`}>
        {/* Header */}
        <div 
          className="video-header flex items-center justify-between px-3 py-2 bg-zinc-800 cursor-grab"
          onMouseDown={handleMouseDown}
        >
          <span className="text-sm text-zinc-300 truncate max-w-[300px] select-none">
            {video.title || 'YouTube Video'}
          </span>
          <div className="flex items-center gap-1">
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
              title="Open on YouTube"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button 
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
              title={isMinimized ? 'Expand' : 'Minimize'}
            >
              {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            </button>
            <button 
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 rounded transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video */}
        {!isMinimized && (
          <div className="relative w-full aspect-video bg-black">
            <iframe
              src={`${video.embed_url}?autoplay=1&rel=0`}
              title={video.title || 'YouTube video player'}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
            />
          </div>
        )}

        {/* Channel info when minimized */}
        {isMinimized && video.channel_title && (
          <div className="px-3 py-2 text-xs text-zinc-500">
            {video.channel_title}
          </div>
        )}
      </div>
    </div>
  );
}
