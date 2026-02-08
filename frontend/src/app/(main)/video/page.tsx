'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { videoProcessing, VideoProcessEvent, VideoJob } from '@/lib/api';
import {
  Youtube, Loader2, Play, FileText, Sparkles, AlertCircle,
  Trash2, Clock, Copy, ChevronDown, ChevronUp, History, RefreshCw,
  MessageSquare, Send, RotateCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

type ProcessStage = 'idle' | 'info' | 'downloading' | 'extracting_audio' | 'transcribing' | 'summarizing' | 'complete' | 'error';

interface ProcessingState {
  stage: ProcessStage;
  status: string;
  percent: string;
  videoInfo: { title?: string; channel?: string; duration?: number; thumbnail?: string } | null;
  result: { id?: string; transcript?: string; summary?: string; language?: string } | null;
  error: string | null;
}

interface QAMessage { role: 'user' | 'assistant'; content: string; }

const STAGE_LABELS: Record<ProcessStage, string> = {
  idle: 'Ready', info: 'Getting video info', downloading: 'Downloading video',
  extracting_audio: 'Extracting audio', transcribing: 'Transcribing',
  summarizing: 'Generating summary', complete: 'Complete', error: 'Error',
};
const STAGE_ORDER: ProcessStage[] = ['info', 'downloading', 'extracting_audio', 'transcribing', 'summarizing', 'complete'];

const stripMarkdown = (text: string) =>
  text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s+(.*)/g, '$1')
    .replace(/^[-*+]\s+/gm, '  •  ')
    .replace(/^\d+\.\s+/gm, m => `  ${m.trim()}  `)
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, m => m.replace(/`/g, ''))
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n');

const formatDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    : `${m}:${sec.toString().padStart(2, '0')}`;
};

export default function VideoPage() {
  const [url, setUrl] = useState('');
  const [processing, setProcessing] = useState<ProcessingState>({
    stage: 'idle', status: '', percent: '', videoInfo: null, result: null, error: null,
  });
  const [showTranscript, setShowTranscript] = useState(false);
  const [history, setHistory] = useState<VideoJob[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [qaMessages, setQaMessages] = useState<QAMessage[]>([]);
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const abortRef = useRef<boolean>(false);
  const qaEndRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const r = await videoProcessing.listJobs(20);
      setHistory(r.jobs);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (historyExpanded) loadHistory();
  }, []);

  const handleProcess = async () => {
    if (!url.trim()) { toast.error('Please enter a YouTube URL'); return; }
    abortRef.current = false;
    setQaMessages([]);
    setProcessing({ stage: 'info', status: 'Starting...', percent: '', videoInfo: null, result: null, error: null });
    try {
      for await (const event of videoProcessing.processVideo(url, { summarize: true, deleteVideo: true })) {
        if (abortRef.current) break;
        const ns: Partial<ProcessingState> = {
          stage: event.stage as ProcessStage,
          status: event.status || STAGE_LABELS[event.stage as ProcessStage] || '',
          percent: event.percent || '',
        };
        if (event.stage === 'info' && event.data) {
          ns.videoInfo = { title: event.data.title, channel: event.data.channel, duration: event.data.duration, thumbnail: event.data.thumbnail };
        }
        if (event.stage === 'complete' && event.result) {
          ns.result = { id: event.result.id, transcript: event.result.transcript, summary: event.result.summary || undefined, language: event.result.transcript_language };
          toast.success('Video processed!');
        }
        if (event.stage === 'error') {
          ns.error = event.error || 'An error occurred';
          toast.error(event.error || 'Processing failed');
        }
        setProcessing(prev => ({ ...prev, ...ns }));
      }
    } catch (err: any) {
      setProcessing(prev => ({ ...prev, stage: 'error', status: 'Failed', error: err.message || 'Processing failed' }));
      toast.error(err.message || 'Processing failed');
    }
  };

  const handleRegenerateSummary = async () => {
    if (!processing.result?.id) { toast.error('No job to regenerate'); return; }
    setRegenerating(true);
    try {
      const data = await videoProcessing.regenerateSummary(processing.result.id);
      if (data.success && data.summary) {
        setProcessing(prev => ({
          ...prev,
          result: prev.result ? { ...prev.result, summary: data.summary } : prev.result,
        }));
        toast.success('Summary regenerated');
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to regenerate summary';
      if (msg.toLowerCase().includes('transcript is empty') || msg.toLowerCase().includes('no transcript')) {
        toast.error('Transcript is empty — try "Retry without VAD" or "Full Redownload" below.');
      } else {
        toast.error(msg);
      }
    } finally {
      setRegenerating(false);
    }
  };

  const handleReprocess = async (mode: 'auto' | 'retranscribe' | 'full' = 'auto', disableVad = false) => {
    const jobId = processing.result?.id;
    if (!jobId) { toast.error('No job to reprocess'); return; }
    setReprocessing(true);
    setQaMessages([]);
    setProcessing(prev => ({
      ...prev, stage: 'info', status: 'Re-processing...', percent: '', result: null, error: null,
    }));
    try {
      for await (const event of videoProcessing.reprocessJob(jobId, { mode, disableVad })) {
        if (abortRef.current) break;
        const ns: Partial<ProcessingState> = {
          stage: event.stage as ProcessStage,
          status: event.status || STAGE_LABELS[event.stage as ProcessStage] || '',
          percent: event.percent || '',
        };
        if (event.stage === 'info' && event.data) {
          ns.videoInfo = { title: event.data.title, channel: event.data.channel, duration: event.data.duration, thumbnail: event.data.thumbnail };
        }
        if (event.stage === 'complete' && event.result) {
          ns.result = { id: event.result.id, transcript: event.result.transcript, summary: event.result.summary || undefined, language: event.result.transcript_language };
          toast.success('Video reprocessed!');
          loadHistory(); // refresh history since old job was replaced
        }
        if (event.stage === 'error') {
          ns.error = event.error || 'An error occurred';
          toast.error(event.error || 'Reprocessing failed');
        }
        setProcessing(prev => ({ ...prev, ...ns }));
      }
    } catch (err: any) {
      setProcessing(prev => ({ ...prev, stage: 'error', status: 'Failed', error: err.message || 'Reprocessing failed' }));
      toast.error(err.message || 'Reprocessing failed');
    } finally {
      setReprocessing(false);
    }
  };

  const handleAskQuestion = async () => {
    const q = qaInput.trim();
    if (!q || !processing.result?.transcript) return;
    setQaInput('');
    setQaMessages(prev => [...prev, { role: 'user', content: q }]);
    setQaLoading(true);
    try {
      const data = await videoProcessing.askQuestion(q, processing.result.transcript, processing.result.summary || '', processing.videoInfo?.title || '');
      setQaMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch {
      setQaMessages(prev => [...prev, { role: 'assistant', content: "Sorry, couldn't answer that. Try again." }]);
    } finally {
      setQaLoading(false);
      setTimeout(() => qaEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const handleDeleteJob = async (id: string) => {
    try {
      await videoProcessing.deleteJob(id);
      setHistory(prev => prev.filter(j => j._id !== id));
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const loadJobResult = (job: VideoJob) => {
    setUrl(job.url);
    setQaMessages([]);
    setProcessing({
      stage: 'complete', status: 'Loaded from history', percent: '100%',
      videoInfo: { title: job.title, channel: job.channel, duration: job.duration, thumbnail: job.thumbnail },
      result: { id: job._id, transcript: job.transcript, summary: job.summary || undefined, language: job.transcript_language },
      error: null,
    });
  };

  const isProcessing = !['idle', 'complete', 'error'].includes(processing.stage) || reprocessing;
  const currentStageIndex = STAGE_ORDER.indexOf(processing.stage);
  const hasResult = processing.result?.transcript || processing.result?.summary;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 space-y-4">

        {/* ── Header + URL Input ── */}
        <div className="space-y-3">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Youtube className="w-5 h-5 text-red-500" />Video
          </h1>
          <div className="flex gap-2">
            <input
              type="text" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="Paste a YouTube URL..."
              disabled={isProcessing}
              onKeyDown={e => e.key === 'Enter' && !isProcessing && url.trim() && handleProcess()}
              className="flex-1 min-w-0 px-3 py-2.5 bg-bg-primary border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            />
            <button
              onClick={handleProcess}
              disabled={isProcessing || !url.trim()}
              className={cn(
                'px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors text-sm flex-shrink-0',
                isProcessing || !url.trim()
                  ? 'bg-surface text-text-muted cursor-not-allowed'
                  : 'bg-accent text-white hover:bg-accent-hover'
              )}
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isProcessing ? 'Processing' : 'Process'}
            </button>
          </div>
        </div>

        {/* ── Video Info ── */}
        {processing.videoInfo && (
          <div className="flex gap-3 bg-surface border border-border rounded-lg p-3">
            {processing.videoInfo.thumbnail && (
              <img src={processing.videoInfo.thumbnail} alt="" className="w-28 h-16 object-cover rounded-lg flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm line-clamp-2">{processing.videoInfo.title}</h3>
              <p className="text-xs text-text-muted mt-0.5">{processing.videoInfo.channel}</p>
              {processing.videoInfo.duration && (
                <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />{formatDuration(processing.videoInfo.duration)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Progress ── */}
        {processing.stage !== 'idle' && processing.stage !== 'complete' && (
          <div className="bg-surface border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              {isProcessing && <Loader2 className="w-4 h-4 animate-spin text-accent" />}
              {processing.stage === 'error' && <AlertCircle className="w-4 h-4 text-error" />}
              <span className="text-sm font-medium">{processing.status || STAGE_LABELS[processing.stage]}</span>
              {processing.percent && <span className="text-xs text-text-muted ml-auto">{processing.percent}</span>}
            </div>
            <div className="flex items-center gap-1.5">
              {STAGE_ORDER.slice(0, -1).map((stage, idx) => {
                const isActive = stage === processing.stage;
                const isComplete = currentStageIndex > idx || processing.stage === 'complete';
                return (
                  <div key={stage} className="flex items-center gap-1.5">
                    <div className={cn('w-2 h-2 rounded-full transition-colors', isComplete ? 'bg-success' : isActive ? 'bg-accent animate-pulse' : 'bg-surface-hover')} />
                    {idx < STAGE_ORDER.length - 2 && <div className={cn('w-6 h-0.5 rounded transition-colors', isComplete ? 'bg-success/50' : 'bg-surface-hover')} />}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-text-muted mt-1">
              <span>Info</span><span>Download</span><span>Audio</span><span>Transcribe</span><span>Summary</span>
            </div>
            {processing.error && (
              <div className="mt-2 p-2 bg-error/10 border border-error/20 rounded text-xs text-error">{processing.error}</div>
            )}
          </div>
        )}

        {/* ── Summary ── */}
        {hasResult && processing.result?.summary && (
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium flex items-center gap-2 text-sm">
                <Sparkles className="w-4 h-4 text-accent" />Summary
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleRegenerateSummary}
                  disabled={regenerating || !processing.result?.id}
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    regenerating ? 'text-accent' : 'hover:bg-surface-hover text-text-muted hover:text-text-primary'
                  )}
                  title="Regenerate summary"
                >
                  <RotateCw className={cn('w-4 h-4', regenerating && 'animate-spin')} />
                </button>
                <button
                  onClick={() => handleCopy(processing.result!.summary!, 'Summary')}
                  className="p-1.5 hover:bg-surface-hover rounded-lg transition-colors"
                  title="Copy"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-text-secondary">
              {stripMarkdown(processing.result.summary)}
            </div>
          </div>
        )}

        {/* ── No summary / empty transcript — offer actions ── */}
        {hasResult && !processing.result?.summary && processing.result?.id && (
          <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <AlertCircle className="w-4 h-4" />
              {processing.result?.transcript?.trim()
                ? 'No summary was generated for this video.'
                : 'The transcript came back empty (VAD may have filtered all audio as non-speech).'
              }
            </div>
            <div className="flex flex-wrap gap-2">
              {processing.result?.transcript?.trim() ? (
                <button
                  onClick={handleRegenerateSummary}
                  disabled={regenerating || reprocessing}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors',
                    regenerating || reprocessing
                      ? 'bg-surface text-text-muted cursor-not-allowed'
                      : 'bg-accent text-white hover:bg-accent-hover'
                  )}
                >
                  {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {regenerating ? 'Generating...' : 'Generate Summary'}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleReprocess('retranscribe', true)}
                    disabled={reprocessing}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors',
                      reprocessing
                        ? 'bg-surface text-text-muted cursor-not-allowed'
                        : 'bg-accent text-white hover:bg-accent-hover'
                    )}
                    title="Re-transcribe using existing audio with VAD disabled"
                  >
                    {reprocessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                    Retry without VAD
                  </button>
                  <button
                    onClick={() => handleReprocess('full')}
                    disabled={reprocessing}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors',
                      reprocessing
                        ? 'bg-surface text-text-muted cursor-not-allowed'
                        : 'bg-surface-hover text-text-primary hover:bg-border'
                    )}
                    title="Re-download and process from scratch"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Full Redownload
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Transcript (collapsible) ── */}
        {hasResult && processing.result?.transcript && (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="w-full flex items-center justify-between p-3 hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span className="text-sm font-medium">Transcript</span>
                {processing.result.language && (
                  <span className="text-xs text-text-muted bg-bg-primary px-2 py-0.5 rounded">
                    {processing.result.language.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={e => { e.stopPropagation(); handleCopy(processing.result!.transcript!, 'Transcript'); }}
                  className="p-1 hover:bg-bg-primary rounded transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>
            {showTranscript && (
              <div className="px-3 pb-3">
                <div className="bg-bg-primary rounded-lg p-3 text-sm whitespace-pre-wrap leading-relaxed text-text-secondary max-h-[60vh] overflow-y-auto">
                  {processing.result.transcript || '(No speech detected)'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Q&A ── */}
        {hasResult && (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 p-3 border-b border-border">
              <MessageSquare className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">Ask about this video</span>
            </div>

            {/* Messages */}
            <div className="max-h-[350px] overflow-y-auto p-3 space-y-3">
              {qaMessages.length === 0 && (
                <div className="text-center text-text-muted py-3">
                  <p className="text-xs mb-2">Ask any question about the video</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {['Key points?', 'Main argument?', 'Quick summary?'].map(q => (
                      <button key={q} onClick={() => setQaInput(q)}
                        className="text-xs px-2.5 py-1 bg-bg-primary hover:bg-surface-hover rounded-full transition-colors"
                      >{q}</button>
                    ))}
                  </div>
                </div>
              )}
              {qaMessages.map((msg, i) => (
                <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm',
                    msg.role === 'user' ? 'bg-accent text-white' : 'bg-bg-primary'
                  )}>
                    <div className="whitespace-pre-wrap">
                      {msg.role === 'assistant' ? stripMarkdown(msg.content) : msg.content}
                    </div>
                  </div>
                </div>
              ))}
              {qaLoading && (
                <div className="flex justify-start">
                  <div className="bg-bg-primary rounded-lg px-3 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={qaEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text" value={qaInput}
                  onChange={e => setQaInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !qaLoading && handleAskQuestion()}
                  placeholder="Ask a question..."
                  disabled={qaLoading}
                  className="flex-1 px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                />
                <button
                  onClick={handleAskQuestion}
                  disabled={qaLoading || !qaInput.trim()}
                  className={cn('px-3 py-2 rounded-lg transition-colors',
                    qaLoading || !qaInput.trim()
                      ? 'bg-surface text-text-muted cursor-not-allowed'
                      : 'bg-accent text-white hover:bg-accent-hover'
                  )}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {!hasResult && processing.stage === 'idle' && (
          <div className="text-center text-text-muted py-12">
            <Youtube className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm max-w-xs mx-auto">
              Paste a YouTube URL above to transcribe and summarize the video.
            </p>
          </div>
        )}

        {/* ── History (always at bottom) ── */}
        <div className="border-t border-border pt-4">
          <button
            onClick={() => {
              setHistoryExpanded(!historyExpanded);
              if (!historyExpanded && history.length === 0) loadHistory();
            }}
            className="w-full flex items-center justify-between p-3 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
          >
            <div className="flex items-center gap-2">
              <History className="w-4 h-4" />
              <span className="text-sm font-medium">History</span>
              {history.length > 0 && (
                <span className="text-xs text-text-muted">({history.length})</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {loadingHistory && <Loader2 className="w-3 h-3 animate-spin" />}
              {historyExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {historyExpanded && (
            <div className="mt-2 space-y-1.5">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-accent" />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center text-text-muted py-4 text-sm">No processed videos yet</div>
              ) : (
                <>
                  <div className="flex justify-end mb-1">
                    <button onClick={loadHistory} disabled={loadingHistory}
                      className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1">
                      <RefreshCw className={cn('w-3 h-3', loadingHistory && 'animate-spin')} />Refresh
                    </button>
                  </div>
                  {history.map(job => (
                    <div
                      key={job._id}
                      onClick={() => loadJobResult(job)}
                      className="flex items-center gap-3 p-2.5 bg-surface border border-border rounded-lg hover:bg-surface-hover cursor-pointer transition-colors group"
                    >
                      {job.thumbnail && (
                        <img src={job.thumbnail} alt="" className="w-20 h-12 object-cover rounded flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-xs line-clamp-2">{job.title}</div>
                        <div className="text-[11px] text-text-muted mt-0.5 flex items-center gap-2">
                          <span>{job.channel}</span>
                          {job.duration && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />{formatDuration(job.duration)}
                            </span>
                          )}
                          <span className="hidden sm:inline">{new Date(job.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteJob(job._id); }}
                        className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-error/20 rounded transition-all flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-error" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
