'use client';

import { useState } from 'react';
import { Play, ExternalLink, Check, ChevronDown, ChevronUp, Maximize2 } from 'lucide-react';
import { youtube } from '@/lib/api';

interface YouTubeVideo {
  video_id: string;
  title: string;
  description: string;
  channel_title: string;
  thumbnail: string;
  url: string;
  embed_url: string;
  confidence?: number;
}

interface YouTubeResultsProps {
  action: 'play' | 'select' | 'no_results';
  videos: YouTubeVideo[];
  selectedVideo?: YouTubeVideo | null;
  searchId?: string;
  query: string;
  onVideoSelect?: (video: YouTubeVideo) => void;
}

export default function YouTubeResults({
  action,
  videos,
  selectedVideo: initialSelected,
  searchId,
  query,
  onVideoSelect
}: YouTubeResultsProps) {
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(
    initialSelected || (action === 'play' && videos.length > 0 ? videos[0] : null)
  );
  const [showAlternatives, setShowAlternatives] = useState(action === 'select');
  const [selectionRecorded, setSelectionRecorded] = useState(false);

  const handleVideoSelect = async (video: YouTubeVideo) => {
    setSelectedVideo(video);
    setShowAlternatives(false);
    
    // Record selection for training
    if (searchId && !selectionRecorded) {
      try {
        await youtube.recordSelection(searchId, video.video_id);
        setSelectionRecorded(true);
      } catch (err) {
        console.error('Failed to record selection:', err);
      }
    }
    
    onVideoSelect?.(video);
  };

  if (action === 'no_results' || videos.length === 0) {
    return (
      <div className="bg-bg-tertiary border border-border rounded-xl p-4 my-2">
        <p className="text-text-muted text-sm">
          No videos found for "{query}"
        </p>
      </div>
    );
  }

  return (
    <div className="my-3 space-y-3">
      {/* Video Player */}
      {selectedVideo && (
        <div className="bg-bg-tertiary border border-border rounded-xl overflow-hidden">
          {/* Embed iframe */}
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`${selectedVideo.embed_url}?autoplay=0&rel=0`}
              title={selectedVideo.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          
          {/* Video Info */}
          <div className="p-3">
            <h3 className="font-medium text-text-primary line-clamp-2">
              {selectedVideo.title}
            </h3>
            <p className="text-sm text-text-muted mt-1">
              {selectedVideo.channel_title}
            </p>
            <div className="flex items-center gap-3 mt-2">
              <a
                href={selectedVideo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Open on YouTube
              </a>
              {onVideoSelect && (
                <button
                  onClick={() => onVideoSelect(selectedVideo)}
                  className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-accent transition-colors"
                  title="Pop out to floating player"
                >
                  <Maximize2 className="w-3 h-3" />
                  Pop out
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alternative Videos Toggle */}
      {videos.length > 1 && (
        <div>
          <button
            onClick={() => setShowAlternatives(!showAlternatives)}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            {showAlternatives ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {action === 'select' && !selectedVideo
              ? 'Select a video to play'
              : `${videos.length - 1} other result${videos.length > 2 ? 's' : ''}`
            }
          </button>

          {/* Video Selection List */}
          {showAlternatives && (
            <div className="mt-2 space-y-2">
              {videos.map((video) => (
                <button
                  key={video.video_id}
                  onClick={() => handleVideoSelect(video)}
                  className={`w-full flex gap-3 p-2 rounded-lg border transition-colors text-left ${
                    selectedVideo?.video_id === video.video_id
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50 hover:bg-surface'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="relative w-32 h-18 flex-shrink-0 rounded overflow-hidden bg-bg-secondary">
                    {video.thumbnail ? (
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Play className="w-8 h-8 text-text-muted" />
                      </div>
                    )}
                    {selectedVideo?.video_id === video.video_id && (
                      <div className="absolute inset-0 bg-accent/20 flex items-center justify-center">
                        <Check className="w-6 h-6 text-accent" />
                      </div>
                    )}
                  </div>

                  {/* Video Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-text-primary line-clamp-2">
                      {video.title}
                    </h4>
                    <p className="text-xs text-text-muted mt-1">
                      {video.channel_title}
                    </p>
                    {video.confidence !== undefined && (
                      <span className={`text-xs mt-1 inline-block px-1.5 py-0.5 rounded ${
                        video.confidence >= 0.75 
                          ? 'bg-success/20 text-success' 
                          : video.confidence >= 0.5 
                            ? 'bg-warning/20 text-warning'
                            : 'bg-text-muted/20 text-text-muted'
                      }`}>
                        {Math.round(video.confidence * 100)}% match
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
