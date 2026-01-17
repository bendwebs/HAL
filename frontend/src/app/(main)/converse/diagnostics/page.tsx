'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, RefreshCw, Check, X, Volume2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface AudioDevice {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

export default function AudioDiagnosticsPage() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Audio test state
  const [isTesting, setIsTesting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [activeTrackLabel, setActiveTrackLabel] = useState<string>('');
  
  // Speech recognition test
  const [isTestingSpeech, setIsTestingSpeech] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechResult, setSpeechResult] = useState<string>('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  
  // Refs
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);

  const addDebug = (msg: string) => {
    console.log('[Audio Debug]', msg);
    setDebugInfo(prev => [...prev.slice(-19), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  // Load devices
  const loadDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      addDebug('Requesting microphone permission...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      addDebug(`Permission granted. Default track: ${track.label}`);
      stream.getTracks().forEach(track => track.stop());
      setHasPermission(true);
      
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
          isDefault: d.deviceId === 'default',
        }));
      
      addDebug(`Found ${audioInputs.length} audio input devices`);
      setDevices(audioInputs);
      
      const defaultDevice = audioInputs.find(d => d.isDefault) || audioInputs[0];
      if (defaultDevice && !selectedDeviceId) {
        setSelectedDeviceId(defaultDevice.deviceId);
      }
    } catch (err: any) {
      console.error('Failed to load devices:', err);
      addDebug(`Permission error: ${err.message}`);
      setHasPermission(false);
      setError(err.message || 'Failed to access microphone');
    } finally {
      setIsLoading(false);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechSupported(!!SpeechRecognition);
  }, []);

  useEffect(() => {
    loadDevices();
    
    navigator.mediaDevices.addEventListener('devicechange', loadDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
      stopAudioTest();
      stopSpeechTest();
    };
  }, []);

  const startAudioTest = async (deviceId: string) => {
    stopAudioTest();
    setIsTesting(true);
    setPeakLevel(0);
    setDebugInfo([]);
    setActiveTrackLabel('');
    
    try {
      // Build constraints
      let audioConstraints: MediaTrackConstraints | boolean;
      
      if (deviceId === 'default') {
        audioConstraints = true;
        addDebug('Using default device (no specific deviceId)');
      } else {
        audioConstraints = { 
          deviceId: { exact: deviceId },
        };
        addDebug(`Requesting specific device: ${deviceId.slice(0, 20)}...`);
      }
      
      addDebug('Calling getUserMedia...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: audioConstraints 
      });
      streamRef.current = stream;
      
      const track = stream.getAudioTracks()[0];
      if (!track) {
        addDebug('ERROR: No audio track in stream!');
        throw new Error('No audio track received');
      }
      
      setActiveTrackLabel(track.label);
      addDebug(`Got track: ${track.label}`);
      addDebug(`Track enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`);
      
      const settings = track.getSettings();
      addDebug(`Sample rate: ${settings.sampleRate || 'unknown'}, channels: ${settings.channelCount || 'unknown'}`);
      if (settings.deviceId) {
        addDebug(`Actual device ID: ${settings.deviceId.slice(0, 20)}...`);
      }
      
      // Create audio context
      addDebug('Creating AudioContext...');
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      addDebug(`AudioContext state: ${audioContext.state}, sampleRate: ${audioContext.sampleRate}`);
      
      // Resume if suspended (required by some browsers)
      if (audioContext.state === 'suspended') {
        addDebug('AudioContext suspended, resuming...');
        await audioContext.resume();
        addDebug(`AudioContext state after resume: ${audioContext.state}`);
      }
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048; // Larger for better resolution
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;
      addDebug(`Analyser created: fftSize=${analyser.fftSize}, frequencyBinCount=${analyser.frequencyBinCount}`);
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      addDebug('Source connected to analyser');
      
      // Use time domain data for better voice detection
      const timeDomainData = new Uint8Array(analyser.fftSize);
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      
      let frameCount = 0;
      const updateLevel = () => {
        if (!analyserRef.current || !audioContextRef.current) return;
        
        // Get time domain data (waveform)
        analyserRef.current.getByteTimeDomainData(timeDomainData);
        
        // Calculate RMS from time domain
        let sumSquares = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
          const normalized = (timeDomainData[i] - 128) / 128; // Convert to -1 to 1
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / timeDomainData.length);
        
        // Also check frequency data
        analyserRef.current.getByteFrequencyData(frequencyData);
        let freqSum = 0;
        for (let i = 0; i < frequencyData.length; i++) {
          freqSum += frequencyData[i];
        }
        const freqAvg = freqSum / frequencyData.length / 255;
        
        // Use the higher of the two methods
        const level = Math.max(rms, freqAvg);
        
        setAudioLevel(level);
        setPeakLevel(prev => Math.max(prev, level));
        
        // Log periodically
        frameCount++;
        if (frameCount % 60 === 0) { // Every ~1 second
          addDebug(`Level: ${(level * 100).toFixed(1)}%, RMS: ${(rms * 100).toFixed(1)}%, Freq: ${(freqAvg * 100).toFixed(1)}%`);
        }
        
        animationRef.current = requestAnimationFrame(updateLevel);
      };
      
      addDebug('Starting audio level monitoring...');
      updateLevel();
      
    } catch (err: any) {
      console.error('Audio test failed:', err);
      addDebug(`ERROR: ${err.name}: ${err.message}`);
      setError(`Failed to access device: ${err.message}`);
      setIsTesting(false);
    }
  };

  const stopAudioTest = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        addDebug(`Stopped track: ${track.label}`);
      });
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setIsTesting(false);
    setAudioLevel(0);
    setActiveTrackLabel('');
  };

  const startSpeechTest = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    stopSpeechTest();
    setIsTestingSpeech(true);
    setSpeechResult('');
    setSpeechError(null);
    addDebug('Starting speech recognition test...');
    
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => addDebug('Speech recognition started');
    recognition.onaudiostart = () => addDebug('Speech audio capture started');
    recognition.onsoundstart = () => addDebug('Sound detected!');
    recognition.onspeechstart = () => addDebug('Speech detected!');
    
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setSpeechResult(transcript);
      addDebug(`Transcript: "${transcript}"`);
    };
    
    recognition.onerror = (event: any) => {
      addDebug(`Speech error: ${event.error}`);
      setSpeechError(event.error);
      setIsTestingSpeech(false);
    };
    
    recognition.onend = () => {
      addDebug('Speech recognition ended');
      setIsTestingSpeech(false);
    };
    
    recognition.start();
  };

  const stopSpeechTest = () => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsTestingSpeech(false);
  };

  return (
    <div className="h-full overflow-y-auto bg-bg-primary p-6">
      <div className="max-w-3xl mx-auto space-y-6 pb-12">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Audio Diagnostics</h1>
          <Link href="/converse" className="text-accent hover:underline text-sm">
            ← Back to Voice Chat
          </Link>
        </div>

        {/* Permission Status */}
        <div className="bg-surface rounded-lg p-4">
          <h2 className="font-semibold text-text-primary mb-2">Microphone Permission</h2>
          <div className="flex items-center gap-2">
            {hasPermission === null ? (
              <span className="text-text-muted">Checking...</span>
            ) : hasPermission ? (
              <>
                <Check className="w-5 h-5 text-green-500" />
                <span className="text-green-500">Granted</span>
              </>
            ) : (
              <>
                <X className="w-5 h-5 text-red-500" />
                <span className="text-red-500">Denied - Please allow microphone access</span>
              </>
            )}
          </div>
        </div>

        {/* Available Devices */}
        <div className="bg-surface rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-text-primary">Available Microphones</h2>
            <button
              onClick={loadDevices}
              disabled={isLoading}
              className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          
          {devices.length === 0 ? (
            <p className="text-text-muted">No microphones found</p>
          ) : (
            <div className="space-y-2">
              {devices.map((device, index) => (
                <div
                  key={device.deviceId || index}
                  className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                    selectedDeviceId === device.deviceId
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50'
                  }`}
                  onClick={() => {
                    setSelectedDeviceId(device.deviceId);
                    if (isTesting) {
                      startAudioTest(device.deviceId);
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-text-muted" />
                    <span className="text-text-primary flex-1">{device.label}</span>
                    {device.isDefault && (
                      <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded">
                        System Default
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audio Level Test */}
        <div className="bg-surface rounded-lg p-4">
          <h2 className="font-semibold text-text-primary mb-4">Audio Level Test</h2>
          <p className="text-text-muted text-sm mb-4">
            Tests audio capture from the selected device using Web Audio API.
          </p>
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => isTesting ? stopAudioTest() : startAudioTest(selectedDeviceId)}
                disabled={!selectedDeviceId}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isTesting
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-accent hover:bg-accent/80 text-white'
                } disabled:opacity-50`}
              >
                {isTesting ? 'Stop Test' : 'Start Audio Test'}
              </button>
              
              {isTesting && (
                <button
                  onClick={() => setPeakLevel(0)}
                  className="px-4 py-2 rounded-lg border border-border hover:bg-surface-hover transition-colors text-text-secondary"
                >
                  Reset Peak
                </button>
              )}
            </div>
            
            {activeTrackLabel && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-text-muted">Active device:</span>
                <span className="text-text-primary font-medium">{activeTrackLabel}</span>
              </div>
            )}
            
            {isTesting && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-text-muted text-sm w-20">Current:</span>
                  <div className="flex-1 h-6 bg-bg-primary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-75"
                      style={{ width: `${Math.min(100, audioLevel * 100)}%` }}
                    />
                  </div>
                  <span className="text-text-primary text-sm w-16 text-right font-mono">
                    {(audioLevel * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-text-muted text-sm w-20">Peak:</span>
                  <div className="flex-1 h-6 bg-bg-primary rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-green-500/30"
                      style={{ width: `${peakLevel * 100}%` }}
                    />
                    <div 
                      className="absolute top-0 bottom-0 w-1 bg-green-500"
                      style={{ left: `${peakLevel * 100}%` }}
                    />
                  </div>
                  <span className="text-text-primary text-sm w-16 text-right font-mono">
                    {(peakLevel * 100).toFixed(1)}%
                  </span>
                </div>
                
                {peakLevel < 0.01 && (
                  <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div className="text-yellow-500 text-sm">
                      <p className="font-medium">No audio detected!</p>
                      <ul className="mt-1 space-y-1 text-yellow-400">
                        <li>• Check if the microphone is muted on your headset</li>
                        <li>• Make sure the mic boom is in the correct position</li>
                        <li>• Try speaking louder or closer to the mic</li>
                        <li>• Check Windows Sound Settings to ensure the mic is enabled</li>
                      </ul>
                    </div>
                  </div>
                )}
                {peakLevel >= 0.01 && peakLevel < 0.1 && (
                  <p className="text-yellow-500 text-sm">
                    ⚠️ Low audio level detected. Try speaking louder or moving closer to the microphone.
                  </p>
                )}
                {peakLevel >= 0.1 && (
                  <p className="text-green-500 text-sm">
                    ✓ Audio is being captured successfully!
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Speech Recognition Test */}
        <div className="bg-surface rounded-lg p-4">
          <h2 className="font-semibold text-text-primary mb-4">Speech Recognition Test</h2>
          <p className="text-text-muted text-sm mb-4">
            Tests browser speech-to-text. <strong className="text-yellow-500">Always uses system default mic!</strong>
          </p>
          
          <div className="space-y-4">
            {!speechSupported ? (
              <p className="text-red-500">Speech recognition not supported in this browser.</p>
            ) : (
              <>
                <button
                  onClick={() => isTestingSpeech ? stopSpeechTest() : startSpeechTest()}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    isTestingSpeech
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-accent hover:bg-accent/80 text-white'
                  }`}
                >
                  {isTestingSpeech ? 'Stop Test' : 'Start Speech Test'}
                </button>
                
                {isTestingSpeech && (
                  <div className="flex items-center gap-2 text-accent">
                    <Volume2 className="w-5 h-5 animate-pulse" />
                    <span>Listening... Say something!</span>
                  </div>
                )}
                
                {speechResult && (
                  <div className="p-3 bg-bg-primary rounded-lg">
                    <span className="text-text-muted text-sm">Heard:</span>
                    <p className="text-text-primary text-lg">&quot;{speechResult}&quot;</p>
                  </div>
                )}
                
                {speechError && (
                  <div className="p-3 bg-red-500/10 text-red-500 rounded-lg">
                    <span className="font-medium">Error:</span> {speechError}
                    {speechError === 'no-speech' && (
                      <p className="text-sm mt-1">
                        No speech detected. Set your Stealth headset as the <strong>system default</strong> in Windows Sound Settings.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Debug Log */}
        <div className="bg-surface rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-text-primary">Debug Log</h2>
            <button
              onClick={() => setDebugInfo([])}
              className="text-xs text-text-muted hover:text-text-primary"
            >
              Clear
            </button>
          </div>
          <div className="bg-bg-primary rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs">
            {debugInfo.length === 0 ? (
              <span className="text-text-muted">Start a test to see debug output...</span>
            ) : (
              debugInfo.map((line, i) => (
                <div key={i} className={`${line.includes('ERROR') ? 'text-red-400' : 'text-text-secondary'}`}>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <h2 className="font-semibold text-yellow-500 mb-2">Setting Up Your Stealth Headset</h2>
          <ol className="text-text-secondary text-sm space-y-2 list-decimal list-inside">
            <li>Open <strong>Windows Settings</strong> → <strong>System</strong> → <strong>Sound</strong></li>
            <li>Under <strong>Input</strong>, select <strong>&quot;Microphone (Stealth 700PC Gen 3)&quot;</strong></li>
            <li>Click on it and ensure the volume slider is up and it&apos;s not muted</li>
            <li>Check that your headset&apos;s mic boom is lowered/enabled</li>
            <li>Refresh this page and test again</li>
          </ol>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 rounded-lg p-4">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
