'use client';

import { useState, useEffect, useCallback } from 'react';
import { imageGen, API_URL } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import {
  Image as ImageIcon,
  Loader2,
  Settings2,
  Trash2,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Zap,
  AlertCircle,
  CheckCircle,
  Play,
  Square,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface GeneratedImage {
  filename: string;
  url: string;
  created_at?: number;
}

interface GenerationResult {
  success: boolean;
  images?: GeneratedImage[];
  prompt?: string;
  negative_prompt?: string;
  seed?: number;
  steps?: number;
  cfg_scale?: number;
  sampler?: string;
  width?: number;
  height?: number;
  generation_time_ms?: number;
  error?: string;
}

// Common dimension presets
const DIMENSION_PRESETS = [
  { label: 'Square (512×512)', width: 512, height: 512 },
  { label: 'Square (768×768)', width: 768, height: 768 },
  { label: 'Portrait (512×768)', width: 512, height: 768 },
  { label: 'Landscape (768×512)', width: 768, height: 512 },
  { label: 'Wide (896×512)', width: 896, height: 512 },
  { label: 'Tall (512×896)', width: 512, height: 896 },
];

export default function GeneratePage() {
  const { user } = useAuthStore();

  // SD Status
  const [sdStatus, setSdStatus] = useState<{
    available: boolean;
    starting: boolean;
    subprocess_running: boolean;
    auto_start_configured: boolean;
    models?: string[];
    samplers?: string[];
  } | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  // Generation settings
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);
  const [steps, setSteps] = useState(20);
  const [cfgScale, setCfgScale] = useState(7.0);
  const [sampler, setSampler] = useState('DPM++ 2M Karras');
  const [seed, setSeed] = useState(-1);
  const [batchSize, setBatchSize] = useState(1);

  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentResult, setCurrentResult] = useState<GenerationResult | null>(null);
  const [gallery, setGallery] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [isLoadingGallery, setIsLoadingGallery] = useState(true);

  // Check SD status
  const checkStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    try {
      const status = await imageGen.getStatus();
      setSdStatus(status);
      if (status.samplers && status.samplers.length > 0 && !status.samplers.includes(sampler)) {
        setSampler(status.samplers[0]);
      }
    } catch (err) {
      console.error('Failed to check SD status:', err);
      setSdStatus(null);
    } finally {
      setIsCheckingStatus(false);
    }
  }, [sampler]);

  // Load gallery
  const loadGallery = useCallback(async () => {
    setIsLoadingGallery(true);
    try {
      const result = await imageGen.listMyImages();
      setGallery(result.images || []);
    } catch (err) {
      console.error('Failed to load gallery:', err);
    } finally {
      setIsLoadingGallery(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    checkStatus();
    loadGallery();
  }, [checkStatus, loadGallery]);

  // Start SD
  const handleStartSD = async () => {
    try {
      toast.loading('Starting Stable Diffusion...', { id: 'sd-start' });
      const result = await imageGen.start();
      if (result.success) {
        toast.success('Stable Diffusion started!', { id: 'sd-start' });
        // Poll for status
        const pollStatus = async () => {
          for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 3000));
            const status = await imageGen.getStatus();
            setSdStatus(status);
            if (status.available) {
              toast.success('Stable Diffusion is ready!');
              return;
            }
          }
          toast.error('Timeout waiting for SD to start');
        };
        pollStatus();
      } else {
        toast.error(result.error || 'Failed to start SD', { id: 'sd-start' });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to start SD', { id: 'sd-start' });
    }
  };

  // Stop SD
  const handleStopSD = async () => {
    try {
      const result = await imageGen.stop();
      if (result.success) {
        toast.success('Stable Diffusion stopped');
        checkStatus();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to stop SD');
    }
  };

  // Generate image
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    setCurrentResult(null);

    try {
      const result = await imageGen.generate({
        prompt: prompt.trim(),
        negative_prompt: negativePrompt.trim(),
        width,
        height,
        steps,
        cfg_scale: cfgScale,
        sampler_name: sampler,
        seed,
        batch_size: batchSize,
      });

      setCurrentResult(result);
      
      if (result.success && result.images) {
        toast.success(`Generated ${result.images.length} image(s)!`);
        // Refresh gallery
        loadGallery();
      }
    } catch (err: any) {
      toast.error(err.message || 'Generation failed');
      setCurrentResult({ success: false, error: err.message });
    } finally {
      setIsGenerating(false);
    }
  };

  // Delete image with in-app confirmation
  const handleDeleteImage = async (filename: string) => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <span>Delete this image?</span>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await imageGen.deleteImage(filename);
                toast.success('Image deleted');
                setGallery(prev => prev.filter(img => img.filename !== filename));
                if (selectedImage?.filename === filename) {
                  setSelectedImage(null);
                }
              } catch (err: any) {
                toast.error(err.message || 'Failed to delete image');
              }
            }}
            className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
          >
            Delete
          </button>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    ), { duration: 10000 });
  };

  // Download image
  const handleDownloadImage = (image: GeneratedImage) => {
    const link = document.createElement('a');
    link.href = `${API_URL}${image.url}`;
    link.download = image.filename;
    link.click();
  };

  // Use seed from result
  const handleUseSeed = (resultSeed: number) => {
    setSeed(resultSeed);
    toast.success(`Seed set to ${resultSeed}`);
  };

  // Dimension preset handler
  const handleDimensionPreset = (preset: typeof DIMENSION_PRESETS[0]) => {
    setWidth(preset.width);
    setHeight(preset.height);
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
      {/* Left Panel - Controls */}
      <div className="lg:w-96 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
        {/* SD Status Card */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Stable Diffusion
            </h2>
            <button
              onClick={checkStatus}
              disabled={isCheckingStatus}
              className="p-1.5 hover:bg-surface-hover rounded-lg transition-colors"
              title="Refresh status"
            >
              <RefreshCw className={cn("w-4 h-4", isCheckingStatus && "animate-spin")} />
            </button>
          </div>

          {isCheckingStatus && !sdStatus ? (
            <div className="flex items-center gap-2 text-text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking status...
            </div>
          ) : sdStatus?.available ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle className="w-4 h-4" />
                Ready
              </div>
              {sdStatus.subprocess_running && (
                <button
                  onClick={handleStopSD}
                  className="flex items-center gap-2 text-sm text-text-muted hover:text-error transition-colors"
                >
                  <Square className="w-3 h-3" />
                  Stop SD
                </button>
              )}
            </div>
          ) : sdStatus?.starting ? (
            <div className="flex items-center gap-2 text-warning">
              <Loader2 className="w-4 h-4 animate-spin" />
              Starting...
            </div>
          ) : sdStatus?.auto_start_configured ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-text-muted">
                <AlertCircle className="w-4 h-4" />
                Not running
              </div>
              <button
                onClick={handleStartSD}
                className="flex items-center gap-2 px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm"
              >
                <Play className="w-4 h-4" />
                Start SD
              </button>
            </div>
          ) : (
            <div className="text-text-muted text-sm">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              SD not configured. Set SD_WEBUI_PATH in backend .env
            </div>
          )}
        </div>

        {/* Prompt Input */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <label className="block text-sm font-medium mb-2">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A beautiful sunset over mountains, golden hour, dramatic clouds..."
            className="w-full h-32 px-3 py-2 bg-bg-primary border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-accent"
          />

          <label className="block text-sm font-medium mt-4 mb-2">Negative Prompt</label>
          <textarea
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="blurry, bad quality, distorted..."
            className="w-full h-20 px-3 py-2 bg-bg-primary border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-accent text-sm"
          />
        </div>

        {/* Quick Settings */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Settings</h3>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary"
            >
              {showAdvanced ? 'Less' : 'More'}
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {/* Dimension Presets */}
          <div className="mb-4">
            <label className="block text-sm text-text-muted mb-2">Dimensions</label>
            <div className="flex flex-wrap gap-2">
              {DIMENSION_PRESETS.slice(0, 4).map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handleDimensionPreset(preset)}
                  className={cn(
                    "px-2 py-1 text-xs rounded border transition-colors",
                    width === preset.width && height === preset.height
                      ? "bg-accent text-white border-accent"
                      : "border-border hover:border-accent"
                  )}
                >
                  {preset.width}×{preset.height}
                </button>
              ))}
            </div>
          </div>

          {/* Steps Slider */}
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <label className="text-text-muted">Steps</label>
              <span>{steps}</span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              value={steps}
              onChange={(e) => setSteps(parseInt(e.target.value))}
              className="w-full accent-accent"
            />
          </div>

          {/* Advanced Settings */}
          {showAdvanced && (
            <div className="space-y-4 pt-4 border-t border-border">
              {/* CFG Scale */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <label className="text-text-muted">CFG Scale</label>
                  <span>{cfgScale}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={0.5}
                  value={cfgScale}
                  onChange={(e) => setCfgScale(parseFloat(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>

              {/* Sampler */}
              {sdStatus?.samplers && (
                <div>
                  <label className="block text-sm text-text-muted mb-1">Sampler</label>
                  <select
                    value={sampler}
                    onChange={(e) => setSampler(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm"
                  >
                    {sdStatus.samplers.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Seed */}
              <div>
                <label className="block text-sm text-text-muted mb-1">Seed (-1 for random)</label>
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value) || -1)}
                  className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm"
                />
              </div>

              {/* Batch Size */}
              <div>
                <label className="block text-sm text-text-muted mb-1">Batch Size</label>
                <select
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>{n} image{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>

              {/* More Dimension Presets */}
              <div>
                <label className="block text-sm text-text-muted mb-2">More Sizes</label>
                <div className="flex flex-wrap gap-2">
                  {DIMENSION_PRESETS.slice(4).map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => handleDimensionPreset(preset)}
                      className={cn(
                        "px-2 py-1 text-xs rounded border transition-colors",
                        width === preset.width && height === preset.height
                          ? "bg-accent text-white border-accent"
                          : "border-border hover:border-accent"
                      )}
                    >
                      {preset.width}×{preset.height}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !sdStatus?.available || !prompt.trim()}
          className={cn(
            "w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors",
            isGenerating || !sdStatus?.available || !prompt.trim()
              ? "bg-surface text-text-muted cursor-not-allowed"
              : "bg-accent text-white hover:bg-accent-hover"
          )}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Generate
            </>
          )}
        </button>
      </div>

      {/* Right Panel - Results & Gallery */}
      <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
        {/* Current Result */}
        {(currentResult || isGenerating) && (
          <div className="bg-surface border border-border rounded-lg p-4">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              {isGenerating ? 'Generating...' : 'Result'}
            </h3>

            {isGenerating ? (
              <div className="flex items-center justify-center h-64 bg-bg-primary rounded-lg">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 animate-spin text-accent mx-auto mb-3" />
                  <p className="text-text-muted">Creating your image...</p>
                </div>
              </div>
            ) : currentResult?.success && currentResult.images ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {currentResult.images.map((img) => (
                    <div
                      key={img.filename}
                      className="relative aspect-square bg-bg-primary rounded-lg overflow-hidden cursor-pointer group"
                      onClick={() => setSelectedImage(img)}
                    >
                      <img
                        src={`${API_URL}${img.url}`}
                        alt="Generated"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownloadImage(img); }}
                          className="p-2 bg-white/20 rounded-full hover:bg-white/30"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteImage(img.filename); }}
                          className="p-2 bg-white/20 rounded-full hover:bg-red-500/50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Generation Info */}
                <div className="flex flex-wrap gap-3 text-xs text-text-muted">
                  {currentResult.seed && currentResult.seed !== -1 && (
                    <button
                      onClick={() => handleUseSeed(currentResult.seed!)}
                      className="hover:text-accent transition-colors"
                      title="Click to use this seed"
                    >
                      Seed: {currentResult.seed}
                    </button>
                  )}
                  {currentResult.generation_time_ms && (
                    <span>Time: {(currentResult.generation_time_ms / 1000).toFixed(1)}s</span>
                  )}
                  <span>{currentResult.width}×{currentResult.height}</span>
                  <span>{currentResult.steps} steps</span>
                </div>
              </div>
            ) : currentResult?.error ? (
              <div className="text-error flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                {currentResult.error}
              </div>
            ) : null}
          </div>
        )}

        {/* Gallery */}
        <div className="flex-1 bg-surface border border-border rounded-lg p-4 overflow-hidden flex flex-col">
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Gallery ({gallery.length})
          </h3>

          {isLoadingGallery ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : gallery.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-text-muted">
              <div className="text-center">
                <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No images yet. Generate your first one!</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {gallery.map((img) => (
                  <div
                    key={img.filename}
                    className="relative aspect-square bg-bg-primary rounded-lg overflow-hidden cursor-pointer group"
                    onClick={() => setSelectedImage(img)}
                  >
                    <img
                      src={`${API_URL}${img.url}`}
                      alt="Generated"
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownloadImage(img); }}
                        className="p-1.5 bg-white/20 rounded-full hover:bg-white/30"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteImage(img.filename); }}
                        className="p-1.5 bg-white/20 rounded-full hover:bg-red-500/50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Image Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-full">
            <img
              src={`${API_URL}${selectedImage.url}`}
              alt="Generated"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); handleDownloadImage(selectedImage); }}
                className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteImage(selectedImage.filename); }}
                className="px-4 py-2 bg-red-500/50 backdrop-blur-sm rounded-lg hover:bg-red-500/70 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
