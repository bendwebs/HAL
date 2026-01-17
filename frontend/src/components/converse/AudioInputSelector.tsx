'use client';

import { useState, useEffect, useCallback } from 'react';
import { Mic, ChevronDown, RefreshCw } from 'lucide-react';

interface AudioInputSelectorProps {
  selectedDeviceId: string | null;
  onDeviceChange: (deviceId: string) => void;
  disabled?: boolean;
}

export function AudioInputSelector({
  selectedDeviceId,
  onDeviceChange,
  disabled = false,
}: AudioInputSelectorProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const loadDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First, request microphone permission if not already granted
      // This is required to get device labels
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Stop the stream immediately - we just needed it for permissions
      stream.getTracks().forEach(track => track.stop());
      setHasPermission(true);

      // Now enumerate devices
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter(device => device.kind === 'audioinput');
      
      setDevices(audioInputs);

      // If no device selected yet, select the default one
      if (!selectedDeviceId && audioInputs.length > 0) {
        const defaultDevice = audioInputs.find(d => d.deviceId === 'default') || audioInputs[0];
        onDeviceChange(defaultDevice.deviceId);
      }
    } catch (err) {
      console.error('Failed to load audio devices:', err);
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Microphone permission denied');
        setHasPermission(false);
      } else {
        setError('Failed to access microphone');
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedDeviceId, onDeviceChange]);

  // Load devices on mount
  useEffect(() => {
    loadDevices();

    // Listen for device changes (e.g., plugging in a new mic)
    const handleDeviceChange = () => {
      loadDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [loadDevices]);

  const selectedDevice = devices.find(d => d.deviceId === selectedDeviceId);
  const displayName = selectedDevice?.label || 'Select microphone...';

  // Get a friendly name for the device
  const getDeviceName = (device: MediaDeviceInfo) => {
    if (device.label) {
      // Clean up common label patterns
      let name = device.label;
      // Remove device ID suffix if present
      name = name.replace(/\s*\([0-9a-f:]+\)\s*$/i, '');
      return name;
    }
    return `Microphone ${devices.indexOf(device) + 1}`;
  };

  if (hasPermission === false) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-error/10 text-error rounded-lg text-sm">
        <Mic className="w-4 h-4" />
        <span>Microphone access denied</span>
        <button
          onClick={loadDevices}
          className="ml-auto p-1 hover:bg-error/20 rounded"
          title="Retry"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        className={`flex items-center gap-2 px-3 py-2 bg-surface hover:bg-surface-hover rounded-lg transition-colors text-sm w-full ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <Mic className="w-4 h-4 text-text-muted flex-shrink-0" />
        <span className="text-text-primary truncate flex-1 text-left">
          {isLoading ? 'Loading...' : getDeviceName(selectedDevice || {} as MediaDeviceInfo) || 'Select microphone...'}
        </span>
        <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg z-20 overflow-hidden">
            <div className="max-h-60 overflow-y-auto">
              {devices.length === 0 ? (
                <div className="px-3 py-2 text-text-muted text-sm">
                  No microphones found
                </div>
              ) : (
                devices.map((device, index) => (
                  <button
                    key={device.deviceId || index}
                    onClick={() => {
                      onDeviceChange(device.deviceId);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-hover transition-colors flex items-center gap-2 ${
                      device.deviceId === selectedDeviceId ? 'bg-accent/10 text-accent' : 'text-text-primary'
                    }`}
                  >
                    <Mic className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{getDeviceName(device)}</span>
                    {device.deviceId === 'default' && (
                      <span className="text-xs text-text-muted ml-auto">(System Default)</span>
                    )}
                  </button>
                ))
              )}
            </div>
            
            {/* Refresh button */}
            <div className="border-t border-border px-3 py-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  loadDevices();
                }}
                className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh devices</span>
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <p className="text-error text-xs mt-1">{error}</p>
      )}
    </div>
  );
}
