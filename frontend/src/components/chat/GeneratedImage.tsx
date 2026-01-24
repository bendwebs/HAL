'use client';

import { useState } from 'react';
import { Download, Expand, X, RefreshCw, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GeneratedImageData {
  filename: string;
  filepath: string;
  base64: string;
  url: string;
}

export interface GeneratedImageResult {
  type: 'generated_image';
  images: GeneratedImageData[];
  prompt: string;
  negative_prompt?: string;
  width: number;
  height: number;
  steps: number;
  seed?: number;
  message?: string;
}

interface GeneratedImageProps {
  result: GeneratedImageResult;
}

export default function GeneratedImage({ result }: GeneratedImageProps) {
  const [selectedImage, setSelectedImage] = useState<GeneratedImageData | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  
  const { images, prompt, negative_prompt, width, height, steps, seed } = result;
  
  if (!images || images.length === 0) {
    return (
      <div className="bg-zinc-800 rounded-lg p-4 text-zinc-400">
        No images were generated.
      </div>
    );
  }

  const handleDownload = (image: GeneratedImageData) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${image.base64}`;
    link.download = image.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-3">
      {/* Image Grid */}
      <div className={cn(
        "grid gap-3",
        images.length === 1 ? "grid-cols-1" : "grid-cols-2"
      )}>
        {images.map((image, idx) => (
          <div 
            key={idx}
            className="relative group rounded-xl overflow-hidden bg-zinc-900 border border-zinc-700"
          >
            <img
              src={`data:image/png;base64,${image.base64}`}
              alt={`Generated image ${idx + 1}`}
              className="w-full h-auto"
              style={{ maxHeight: '512px', objectFit: 'contain' }}
            />
            
            {/* Overlay controls */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                onClick={() => setSelectedImage(image)}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                title="View fullscreen"
              >
                <Expand className="w-5 h-5 text-white" />
              </button>
              <button
                onClick={() => handleDownload(image)}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                title="Download image"
              >
                <Download className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {/* Prompt info toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
      >
        <Info className="w-4 h-4" />
        <span>{showDetails ? 'Hide' : 'Show'} generation details</span>
      </button>
      
      {/* Generation details */}
      {showDetails && (
        <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2 text-sm">
          <div>
            <span className="text-zinc-500">Prompt: </span>
            <span className="text-zinc-300">{prompt}</span>
          </div>
          {negative_prompt && (
            <div>
              <span className="text-zinc-500">Negative: </span>
              <span className="text-zinc-400">{negative_prompt}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-zinc-400">
            <span>{width}×{height}</span>
            <span>{steps} steps</span>
            {seed && seed !== -1 && <span>Seed: {seed}</span>}
          </div>
        </div>
      )}
      
      {/* Fullscreen modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div 
            className="relative max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={`data:image/png;base64,${selectedImage.base64}`}
              alt="Generated image fullscreen"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            
            {/* Close button */}
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>
            
            {/* Download button */}
            <button
              onClick={() => handleDownload(selectedImage)}
              className="absolute bottom-4 right-4 p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <Download className="w-5 h-5 text-white" />
              <span className="text-white text-sm">Download</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
