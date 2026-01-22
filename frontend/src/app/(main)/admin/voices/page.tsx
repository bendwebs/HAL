'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { voiceSettings, VoiceInfo } from '@/lib/api';
import { 
  ArrowLeft, 
  Volume2, 
  Check, 
  X, 
  RotateCcw, 
  Save,
  Clock,
  Mic
} from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function AdminVoicesPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalEnabled, setOriginalEnabled] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user?.role !== 'admin') {
      router.push('/chat');
      return;
    }
    loadVoices();
  }, [user, router]);

  const loadVoices = async () => {
    try {
      setIsLoading(true);
      const data = await voiceSettings.listAll();
      setVoices(data.voices);
      
      // Track original state for change detection
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

  const toggleVoice = (voiceId: string) => {
    const voice = voices.find(v => v.id === voiceId);
    if (!voice?.available) return;

    setVoices(prev => prev.map(v => 
      v.id === voiceId ? { ...v, enabled: !v.enabled } : v
    ));
    
    // Check if there are changes
    const newEnabled = new Set(
      voices.map(v => v.id === voiceId ? { ...v, enabled: !v.enabled } : v)
        .filter(v => v.enabled)
        .map(v => v.id)
    );
    
    const hasChanges = 
      newEnabled.size !== originalEnabled.size ||
      [...newEnabled].some(id => !originalEnabled.has(id));
    setHasChanges(hasChanges);
  };

  const saveChanges = async () => {
    const enabledIds = voices.filter(v => v.enabled).map(v => v.id);
    
    if (enabledIds.length === 0) {
      toast.error('At least one voice must be enabled');
      return;
    }

    try {
      setIsSaving(true);
      await voiceSettings.update(enabledIds);
      setOriginalEnabled(new Set(enabledIds));
      setHasChanges(false);
      toast.success(`Saved ${enabledIds.length} enabled voices`);
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

  // Group voices by quality then accent
  const groupedVoices = {
    high: voices.filter(v => v.quality === 'High' && v.available),
    medium: voices.filter(v => v.quality === 'Medium' && v.available),
    low: voices.filter(v => v.quality === 'Low' && v.available),
    coming_soon: voices.filter(v => !v.available),
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

        {/* Stats & Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 p-4 bg-surface border border-border rounded-xl">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-sm text-text-muted">Enabled</p>
              <p className="text-2xl font-bold text-accent">{enabledCount}</p>
            </div>
            <div className="w-px h-10 bg-border" />
            <div>
              <p className="text-sm text-text-muted">Available</p>
              <p className="text-2xl font-bold text-text-primary">{availableCount}</p>
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
            {/* High Quality */}
            {groupedVoices.high.length > 0 && (
              <VoiceSection
                title="High Quality"
                subtitle="Best audio quality, recommended for most uses"
                voices={groupedVoices.high}
                onToggle={toggleVoice}
                badgeColor="bg-success/20 text-success"
              />
            )}

            {/* Medium Quality */}
            {groupedVoices.medium.length > 0 && (
              <VoiceSection
                title="Medium Quality"
                subtitle="Good balance of quality and variety"
                voices={groupedVoices.medium}
                onToggle={toggleVoice}
                badgeColor="bg-accent/20 text-accent"
              />
            )}

            {/* Low Quality */}
            {groupedVoices.low.length > 0 && (
              <VoiceSection
                title="Low Quality"
                subtitle="Faster generation, lower audio quality"
                voices={groupedVoices.low}
                onToggle={toggleVoice}
                badgeColor="bg-warning/20 text-warning"
              />
            )}

            {/* Coming Soon */}
            {groupedVoices.coming_soon.length > 0 && (
              <VoiceSection
                title="Coming Soon"
                subtitle="Premium cloud-based voices (not yet available)"
                voices={groupedVoices.coming_soon}
                onToggle={() => {}}
                badgeColor="bg-purple-500/20 text-purple-400"
                disabled
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
  onToggle: (id: string) => void;
  badgeColor: string;
  disabled?: boolean;
}

function VoiceSection({ title, subtitle, voices, onToggle, badgeColor, disabled }: VoiceSectionProps) {
  // Group by accent
  const americanVoices = voices.filter(v => v.accent === 'American');
  const britishVoices = voices.filter(v => v.accent === 'British');

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <span className={`px-2 py-1 text-xs font-medium rounded ${badgeColor}`}>
            {title}
          </span>
          {disabled && (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Clock className="w-3 h-3" />
              Coming Soon
            </span>
          )}
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
                  onToggle={onToggle}
                  disabled={disabled}
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
                  onToggle={onToggle}
                  disabled={disabled}
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
  onToggle: (id: string) => void;
  disabled?: boolean;
}

function VoiceCard({ voice, onToggle, disabled }: VoiceCardProps) {
  return (
    <button
      onClick={() => !disabled && onToggle(voice.id)}
      disabled={disabled}
      className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
        disabled
          ? 'opacity-50 cursor-not-allowed bg-bg-tertiary border-border'
          : voice.enabled
            ? 'bg-accent/10 border-accent/30 hover:bg-accent/15'
            : 'bg-bg-tertiary border-border hover:border-border-hover hover:bg-surface-hover'
      }`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
        voice.enabled ? 'bg-accent text-white' : 'bg-surface border border-border'
      }`}>
        {voice.enabled ? (
          <Check className="w-4 h-4" />
        ) : disabled ? (
          <Clock className="w-4 h-4 text-text-muted" />
        ) : (
          <Volume2 className="w-4 h-4 text-text-muted" />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary truncate">{voice.name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            voice.gender === 'Female' ? 'bg-pink-500/20 text-pink-400' :
            voice.gender === 'Male' ? 'bg-blue-500/20 text-blue-400' :
            'bg-purple-500/20 text-purple-400'
          }`}>
            {voice.gender}
          </span>
        </div>
        <p className="text-xs text-text-muted truncate">{voice.description}</p>
      </div>
    </button>
  );
}
