'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { voiceSettings, tts, VoiceInfo } from '@/lib/api';
import { 
  ArrowLeft, 
  Volume2, 
  Check, 
  RotateCcw, 
  Save,
  Mic,
  Play,
  Square,
  Loader2,
  MessageSquare,
  Star
} from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

const DEFAULT_TEST_TEXT = "Hello! I'm testing this voice to see how it sounds.";

export default function AdminVoicesPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalEnabled, setOriginalEnabled] = useState<Set<string>>(new Set());
  const [originalDefaultVoice, setOriginalDefaultVoice] = useState<string>('');
  const [defaultVoiceId, setDefaultVoiceId] = useState<string>('');
  
  // Voice preview state
  const [testText, setTestText] = useState(DEFAULT_TEST_TEXT);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (user?.role !== 'admin') {
      router.push('/chat');
      return;
    }
    loadVoices();
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [user, router]);

  const loadVoices = async () => {
    try {
      setIsLoading(true);
      const data = await voiceSettings.listAll();
      setVoices(data.voices);
      setDefaultVoiceId(data.default_voice_id);
      setOriginalDefaultVoice(data.default_voice_id);
      
      const enabledSet = new Set(
        data.voices.filter(v => v.enabled).map(v => v.id)
      );
      setOriginalEnabled(enabledSet);
    } catch (err) {
      console.error('Failed to load voices:', err);
      toast.error('Failed to load voices');
    } finally {
      setIsLoading(false);
    }
  };

  const checkForChanges = (newVoices: VoiceInfo[], newDefaultId: string) => {
    const newEnabled = new Set(newVoices.filter(v => v.enabled).map(v => v.id));
    const enabledChanged = 
      newEnabled.size !== originalEnabled.size ||
      [...newEnabled].some(id => !originalEnabled.has(id));
    const defaultChanged = newDefaultId !== originalDefaultVoice;
    setHasChanges(enabledChanged || defaultChanged);
  };

  const toggleVoice = (voiceId: string) => {
    const voice = voices.find(v => v.id === voiceId);
    if (!voice?.available) return;

    const newVoices = voices.map(v => 
      v.id === voiceId ? { ...v, enabled: !v.enabled } : v
    );
    setVoices(newVoices);
    
    // If disabling the default voice, clear default or pick another
    let newDefaultId = defaultVoiceId;
    if (voiceId === defaultVoiceId && voice.enabled) {
      const stillEnabled = newVoices.filter(v => v.enabled && v.id !== voiceId);
      newDefaultId = stillEnabled.length > 0 ? stillEnabled[0].id : '';
      setDefaultVoiceId(newDefaultId);
    }
    
    checkForChanges(newVoices, newDefaultId);
  };

  const setAsDefault = (voiceId: string) => {
    const voice = voices.find(v => v.id === voiceId);
    if (!voice?.enabled) {
      toast.error('Voice must be enabled to set as default');
      return;
    }
    setDefaultVoiceId(voiceId);
    checkForChanges(voices, voiceId);
  };

  const playVoicePreview = async (voiceId: string) => {
    if (playingVoiceId === voiceId) {
      stopPlayback();
      return;
    }
    
    stopPlayback();
    
    if (!testText.trim()) {
      toast.error('Please enter some text to test');
      return;
    }
    
    try {
      setLoadingVoiceId(voiceId);
      
      const audioBlob = await tts.generate(testText, voiceId, {
        useCache: false,
        useTurbo: true
      });
      
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.onended = () => {
        setPlayingVoiceId(null);
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.onerror = () => {
        setPlayingVoiceId(null);
        URL.revokeObjectURL(audioUrl);
        toast.error('Failed to play audio');
      };
      
      await audio.play();
      setPlayingVoiceId(voiceId);
      
    } catch (err) {
      console.error('Failed to generate voice preview:', err);
      toast.error('Failed to generate voice preview');
    } finally {
      setLoadingVoiceId(null);
    }
  };
  
  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingVoiceId(null);
  };

  const saveChanges = async () => {
    const enabledIds = voices.filter(v => v.enabled).map(v => v.id);
    
    if (enabledIds.length === 0) {
      toast.error('At least one voice must be enabled');
      return;
    }

    if (!defaultVoiceId || !enabledIds.includes(defaultVoiceId)) {
      toast.error('Please select a default voice from enabled voices');
      return;
    }

    try {
      setIsSaving(true);
      await voiceSettings.update(enabledIds, defaultVoiceId);
      setOriginalEnabled(new Set(enabledIds));
      setOriginalDefaultVoice(defaultVoiceId);
      setHasChanges(false);
      toast.success(`Saved ${enabledIds.length} voices with default: ${voices.find(v => v.id === defaultVoiceId)?.name}`);
    } catch (err) {
      console.error('Failed to save:', err);
      toast.error('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const resetToDefaults = async () => {
    try {
      setIsSaving(true);
      await voiceSettings.reset();
      await loadVoices();
      setHasChanges(false);
      toast.success('Reset to default voices');
    } catch (err) {
      console.error('Failed to reset:', err);
      toast.error('Failed to reset');
    } finally {
      setIsSaving(false);
    }
  };

  const enabledCount = voices.filter(v => v.enabled).length;
  const availableCount = voices.filter(v => v.available).length;
  const defaultVoice = voices.find(v => v.id === defaultVoiceId);

  const groupedVoices = {
    high: voices.filter(v => v.quality === 'High' && v.available),
    medium: voices.filter(v => v.quality === 'Medium' && v.available),
    low: voices.filter(v => v.quality === 'Low' && v.available),
  };

  if (user?.role !== 'admin') {
    return null;
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link 
            href="/admin"
            className="p-2 hover:bg-surface rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-text-secondary" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
              <Mic className="w-7 h-7 text-accent" />
              Voice Management
            </h1>
            <p className="text-text-secondary mt-1">
              Select which voices appear on the /converse page
            </p>
          </div>
        </div>

        {/* Voice Preview Input */}
        <div className="mb-6 p-4 bg-surface border border-border rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-accent" />
            <label className="text-sm font-medium text-text-primary">
              Test Phrase
            </label>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Enter text to test voices..."
              className="flex-1 px-4 py-2.5 bg-bg-tertiary border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
            />
            <button
              onClick={() => setTestText(DEFAULT_TEST_TEXT)}
              className="px-3 py-2 text-text-muted hover:text-text-secondary text-sm border border-border rounded-lg hover:bg-bg-tertiary transition-colors"
            >
              Reset
            </button>
          </div>
          <p className="text-xs text-text-muted mt-2">
            Click the play button to preview • Click the star to set as default
          </p>
        </div>

        {/* Stats & Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 p-4 bg-surface border border-border rounded-xl">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-sm text-text-muted">Enabled</p>
              <p className="text-2xl font-bold text-accent">{enabledCount}</p>
            </div>
            <div className="w-px h-10 bg-border" />
            <div>
              <p className="text-sm text-text-muted">Default</p>
              <p className="text-lg font-medium text-text-primary flex items-center gap-1">
                <Star className="w-4 h-4 text-warning fill-warning" />
                {defaultVoice?.name || 'None'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={resetToDefaults}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary border border-border rounded-lg transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <button
              onClick={saveChanges}
              disabled={!hasChanges || isSaving}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                hasChanges 
                  ? 'bg-accent hover:bg-accent-hover text-white' 
                  : 'bg-surface text-text-muted border border-border'
              }`}
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-surface animate-pulse rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {groupedVoices.high.length > 0 && (
              <VoiceSection
                title="High Quality"
                subtitle="Best audio quality, recommended for most uses"
                voices={groupedVoices.high}
                defaultVoiceId={defaultVoiceId}
                onToggle={toggleVoice}
                onSetDefault={setAsDefault}
                onPlay={playVoicePreview}
                playingVoiceId={playingVoiceId}
                loadingVoiceId={loadingVoiceId}
                badgeColor="bg-success/20 text-success"
              />
            )}

            {groupedVoices.medium.length > 0 && (
              <VoiceSection
                title="Medium Quality"
                subtitle="Good balance of quality and variety"
                voices={groupedVoices.medium}
                defaultVoiceId={defaultVoiceId}
                onToggle={toggleVoice}
                onSetDefault={setAsDefault}
                onPlay={playVoicePreview}
                playingVoiceId={playingVoiceId}
                loadingVoiceId={loadingVoiceId}
                badgeColor="bg-accent/20 text-accent"
              />
            )}

            {groupedVoices.low.length > 0 && (
              <VoiceSection
                title="Low Quality"
                subtitle="Faster generation, lower audio quality"
                voices={groupedVoices.low}
                defaultVoiceId={defaultVoiceId}
                onToggle={toggleVoice}
                onSetDefault={setAsDefault}
                onPlay={playVoicePreview}
                playingVoiceId={playingVoiceId}
                loadingVoiceId={loadingVoiceId}
                badgeColor="bg-warning/20 text-warning"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface VoiceSectionProps {
  title: string;
  subtitle: string;
  voices: VoiceInfo[];
  defaultVoiceId: string;
  onToggle: (id: string) => void;
  onSetDefault: (id: string) => void;
  onPlay: (id: string) => void;
  playingVoiceId: string | null;
  loadingVoiceId: string | null;
  badgeColor: string;
}

function VoiceSection({ 
  title, 
  subtitle, 
  voices, 
  defaultVoiceId,
  onToggle, 
  onSetDefault,
  onPlay,
  playingVoiceId,
  loadingVoiceId,
  badgeColor 
}: VoiceSectionProps) {
  const americanVoices = voices.filter(v => v.accent === 'American');
  const britishVoices = voices.filter(v => v.accent === 'British');

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <span className={`px-2 py-1 text-xs font-medium rounded ${badgeColor}`}>
            {title}
          </span>
        </div>
        <p className="text-sm text-text-muted mt-1">{subtitle}</p>
      </div>
      
      <div className="divide-y divide-border">
        {americanVoices.length > 0 && (
          <div className="p-4">
            <h4 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
              🇺🇸 American
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {americanVoices.map(voice => (
                <VoiceCard
                  key={voice.id}
                  voice={voice}
                  isDefault={voice.id === defaultVoiceId}
                  onToggle={onToggle}
                  onSetDefault={onSetDefault}
                  onPlay={onPlay}
                  isPlaying={playingVoiceId === voice.id}
                  isLoading={loadingVoiceId === voice.id}
                />
              ))}
            </div>
          </div>
        )}
        
        {britishVoices.length > 0 && (
          <div className="p-4">
            <h4 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
              🇬🇧 British
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {britishVoices.map(voice => (
                <VoiceCard
                  key={voice.id}
                  voice={voice}
                  isDefault={voice.id === defaultVoiceId}
                  onToggle={onToggle}
                  onSetDefault={onSetDefault}
                  onPlay={onPlay}
                  isPlaying={playingVoiceId === voice.id}
                  isLoading={loadingVoiceId === voice.id}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface VoiceCardProps {
  voice: VoiceInfo;
  isDefault: boolean;
  onToggle: (id: string) => void;
  onSetDefault: (id: string) => void;
  onPlay: (id: string) => void;
  isPlaying: boolean;
  isLoading: boolean;
}

function VoiceCard({ voice, isDefault, onToggle, onSetDefault, onPlay, isPlaying, isLoading }: VoiceCardProps) {
  return (
    <div
      className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
        isDefault
          ? 'bg-warning/10 border-warning/30 ring-1 ring-warning/20'
          : voice.enabled
            ? 'bg-accent/10 border-accent/30'
            : 'bg-bg-tertiary border-border'
      }`}
    >
      {/* Play/Stop Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPlay(voice.id);
        }}
        disabled={isLoading}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${
          isPlaying
            ? 'bg-error text-white hover:bg-error/80'
            : isLoading
              ? 'bg-accent/50 text-white cursor-wait'
              : 'bg-accent/20 text-accent hover:bg-accent/30'
        }`}
        title={isPlaying ? 'Stop' : 'Play preview'}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : isPlaying ? (
          <Square className="w-3 h-3" />
        ) : (
          <Play className="w-3.5 h-3.5 ml-0.5" />
        )}
      </button>
      
      {/* Voice Info - Clickable to toggle */}
      <button
        onClick={() => onToggle(voice.id)}
        className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-text-primary truncate text-sm">{voice.name}</span>
          <span className={`text-xs px-1 py-0.5 rounded shrink-0 ${
            voice.gender === 'Female' ? 'bg-pink-500/20 text-pink-400' :
            voice.gender === 'Male' ? 'bg-blue-500/20 text-blue-400' :
            'bg-purple-500/20 text-purple-400'
          }`}>
            {voice.gender}
          </span>
          {isDefault && (
            <Star className="w-3.5 h-3.5 text-warning fill-warning shrink-0" />
          )}
        </div>
        <p className="text-xs text-text-muted truncate">{voice.description}</p>
      </button>
      
      {/* Set Default Button */}
      <button
        onClick={() => onSetDefault(voice.id)}
        disabled={!voice.enabled}
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
          isDefault
            ? 'bg-warning text-white'
            : voice.enabled
              ? 'bg-surface border border-border hover:border-warning hover:text-warning'
              : 'bg-surface border border-border opacity-30 cursor-not-allowed'
        }`}
        title={isDefault ? 'Default voice' : voice.enabled ? 'Set as default' : 'Enable voice first'}
      >
        <Star className={`w-3.5 h-3.5 ${isDefault ? 'fill-white' : ''}`} />
      </button>
      
      {/* Enable/Disable Toggle */}
      <button
        onClick={() => onToggle(voice.id)}
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
          voice.enabled 
            ? 'bg-accent text-white' 
            : 'bg-surface border border-border hover:border-border-hover'
        }`}
        title={voice.enabled ? 'Enabled (click to disable)' : 'Disabled (click to enable)'}
      >
        {voice.enabled ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <Volume2 className="w-3.5 h-3.5 text-text-muted" />
        )}
      </button>
    </div>
  );
}
