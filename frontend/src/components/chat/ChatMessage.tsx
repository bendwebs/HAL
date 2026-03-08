'use client';

import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Message, MessageAction } from '@/types';
import { formatTime, cn } from '@/lib/utils';
import { 
  ChevronDown, 
  ChevronRight, 
  Brain, 
  Wrench, 
  Bot,
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  Youtube,
  ImageIcon,
  Copy,
  Check as CheckIcon
} from 'lucide-react';
import { TTSButton } from './TTSButton';
import YouTubeResults from './YouTubeResults';
import GeneratedImage from './GeneratedImage';

// Code block with copy button
function CodeBlock({ children, className, ...props }: any) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = useCallback(() => {
    const code = String(children).replace(/\n$/, '');
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  // Inline code (no className from highlight)
  const isInline = !className && typeof children === 'string' && !children.includes('\n');
  if (isInline) {
    return <code className={className} {...props}>{children}</code>;
  }

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-secondary opacity-0 group-hover:opacity-100 transition-all z-10"
        title="Copy code"
      >
        {copied ? (
          <CheckIcon className="w-3.5 h-3.5 text-success" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
      <code className={className} {...props}>
        {children}
      </code>
    </div>
  );
}

interface ChatMessageProps {
  message: Message;
  showThinking?: boolean;
  showActions?: boolean;
  isStreaming?: boolean;
  ttsEnabled?: boolean;
  ttsVoiceId?: string;
  onVideoSelect?: (video: any) => void;
}

const actionTypeIcons: Record<string, any> = {
  tool_call: Wrench,
  sub_agent: Bot,
  rag_search: Search,
  memory_recall: Brain,
  youtube_search: Youtube,
  generate_image: ImageIcon,
};

const actionStatusIcons = {
  pending: Clock,
  running: Loader2,
  complete: CheckCircle,
  failed: AlertCircle,
};

export default function ChatMessage({ 
  message, 
  showThinking = true, 
  showActions = true,
  isStreaming = false,
  ttsEnabled = false,
  ttsVoiceId,
  onVideoSelect
}: ChatMessageProps) {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(true);
  const [messageCopied, setMessageCopied] = useState(false);
  
  const handleCopyMessage = useCallback(() => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
      setMessageCopied(true);
      setTimeout(() => setMessageCopied(false), 2000);
    }
  }, [message.content]);

  const isUser = message.role === 'user';
  const hasThinking = message.thinking && showThinking;
  const hasActions = message.actions && message.actions.length > 0 && showActions;
  
  // Check if this message has a YouTube result - if so, we'll hide the text response
  const hasYouTubeResult = message.actions?.some(
    action => action.name === 'youtube_search' && 
    action.result && 
    typeof action.result === 'object' &&
    'type' in action.result &&
    action.result.type === 'youtube_results'
  );
  
  // Check if this message has a generated image result
  const hasGeneratedImageResult = message.actions?.some(
    action => {
      const isMatch = action.name === 'generate_image' && 
        action.result && 
        typeof action.result === 'object' &&
        'type' in action.result &&
        action.result.type === 'generated_image';
      
      if (action.name === 'generate_image') {
        console.log('[ChatMessage] Checking generate_image action:', {
          hasResult: !!action.result,
          resultType: typeof action.result,
          resultTypeField: (action.result as any)?.type,
          isMatch,
          status: action.status
        });
      }
      return isMatch;
    }
  );
  
  // YouTube and image results should always be shown, even if showActions is false
  const hasYouTubeAction = message.actions?.some(action => action.name === 'youtube_search');
  const hasGenerateImageAction = message.actions?.some(action => action.name === 'generate_image');
  const shouldShowActions = hasActions || hasYouTubeAction || hasGenerateImageAction;
  
  // Hide text response if we have visual results
  const hasVisualResult = hasYouTubeResult || hasGeneratedImageResult;
  
  // Debug logging
  if (!isUser && message.actions && message.actions.length > 0) {
    console.log('[ChatMessage] msgId:', message.id, 'Actions:', message.actions);
    console.log('[ChatMessage] msgId:', message.id, 'hasYouTubeResult:', hasYouTubeResult);
    console.log('[ChatMessage] msgId:', message.id, 'hasGeneratedImageResult:', hasGeneratedImageResult);
    console.log('[ChatMessage] msgId:', message.id, 'shouldShowActions:', shouldShowActions);
  }

  return (
    <div className={cn(
      "flex gap-3",
      isUser ? "justify-end" : "justify-start"
    )}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
          <span className="text-lg">🤖</span>
        </div>
      )}
      
      <div className={cn(
        "max-w-[85%] md:max-w-[75%]",
        isUser ? "items-end" : "items-start"
      )}>
        {/* Thinking section */}
        {hasThinking && (
          <div className="mb-2">
            <button
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
              className="flex items-center gap-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              {thinkingExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <Brain className="w-4 h-4" />
              <span>Thinking</span>
            </button>
            
            {thinkingExpanded && (
              <div className="mt-2 p-3 bg-bg-tertiary border border-border rounded-lg">
                <p className="text-sm text-text-secondary font-mono whitespace-pre-wrap">
                  {message.thinking}
                </p>
              </div>
            )}
          </div>
        )}
        
        {/* Actions section - always show for YouTube/image results */}
        {shouldShowActions && (
          <div className="mb-2">
            {/* Only show the toggle button if there are non-visual actions */}
            {hasActions && !hasVisualResult && (
              <button
                onClick={() => setActionsExpanded(!actionsExpanded)}
                className="flex items-center gap-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
              >
                {actionsExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <Wrench className="w-4 h-4" />
                <span>Actions ({message.actions.length})</span>
              </button>
            )}
            
            {(actionsExpanded || hasVisualResult) && (
              <div className={cn("space-y-2", !hasVisualResult && "mt-2")}>
                {message.actions.map((action, idx) => (
                  <ActionItem key={action.id || idx} action={action} onVideoSelect={onVideoSelect} />
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Message content - hide if visual results are displayed */}
        {!hasVisualResult && (
          <div className={cn(
            "px-4 py-3 rounded-2xl",
            isUser 
              ? "bg-accent text-white rounded-br-md" 
              : "bg-surface border border-border rounded-bl-md"
          )}>
            <div className={cn(
              "prose prose-sm max-w-none prose-invert",
              "prose-p:my-1 prose-p:leading-relaxed",
              "prose-headings:text-text-primary prose-headings:mt-3 prose-headings:mb-1",
              "prose-code:text-accent prose-code:bg-bg-tertiary prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none",
              "prose-pre:bg-bg-tertiary prose-pre:border prose-pre:border-border prose-pre:rounded-lg prose-pre:my-2",
              "prose-a:text-accent prose-a:no-underline hover:prose-a:underline",
              "prose-strong:text-text-primary",
              "prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5",
              "prose-blockquote:border-accent/50 prose-blockquote:text-text-secondary",
              "prose-table:text-sm prose-th:text-text-primary prose-td:text-text-secondary",
              isUser && "prose-invert"
            )}>
              {message.content ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    code: CodeBlock,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              ) : isStreaming ? (
                <span className="inline-flex items-center gap-2 text-text-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating response...
                </span>
              ) : null}
            </div>
            
            {isStreaming && message.content && (
              <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
            )}
          </div>
        )}
        
        {/* Metadata */}
        <div className="flex items-center gap-3 mt-1 px-1">
          <span className="text-xs text-text-muted">
            {formatTime(message.created_at)}
          </span>
          {message.model_used && (
            <span className="text-xs text-text-muted">
              {message.model_used}
            </span>
          )}
          {message.token_usage && (
            <span className="text-xs text-text-muted">
              {message.token_usage.total} tokens
            </span>
          )}
          {/* TTS Button for assistant messages */}
          {!isUser && ttsEnabled && message.content && !isStreaming && (
            <TTSButton 
              text={message.content} 
              voiceId={ttsVoiceId}
              size="sm"
            />
          )}
          {/* Copy message button */}
          {!isUser && message.content && !isStreaming && (
            <button
              onClick={handleCopyMessage}
              className="p-1 rounded hover:bg-surface transition-colors text-text-muted hover:text-text-secondary"
              title="Copy message"
            >
              {messageCopied ? (
                <CheckIcon className="w-3.5 h-3.5 text-success" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
      
      {/* User avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-medium text-white">U</span>
        </div>
      )}
    </div>
  );
}

function ActionItem({ action, onVideoSelect }: { action: MessageAction; onVideoSelect?: (video: any) => void }) {
  const [expanded, setExpanded] = useState(false);
  
  // Check if this is a YouTube result
  const isYouTubeResult = action.name === 'youtube_search' && 
    action.result && 
    typeof action.result === 'object' &&
    'type' in action.result &&
    action.result.type === 'youtube_results';
  
  // Check if this is a generated image result
  const isGeneratedImageResult = action.name === 'generate_image' && 
    action.result && 
    typeof action.result === 'object' &&
    'type' in action.result &&
    action.result.type === 'generated_image';
  
  // Debug logging for generate_image actions
  if (action.name === 'generate_image') {
    console.log('[ActionItem] generate_image action:', {
      status: action.status,
      hasResult: !!action.result,
      resultType: action.result?.type,
      isGeneratedImageResult,
      hasImages: !!(action.result as any)?.images?.length
    });
  }
  
  const TypeIcon = action.name === 'youtube_search' 
    ? Youtube 
    : action.name === 'generate_image'
    ? ImageIcon
    : (actionTypeIcons[action.type] || Wrench);
  const StatusIcon = actionStatusIcons[action.status] || Clock;
  
  const statusColors: Record<string, string> = {
    pending: 'text-text-muted',
    running: 'text-info animate-spin',
    complete: 'text-success',
    failed: 'text-error',
  };

  // Render YouTube results specially - just show the video player, no header
  if (isYouTubeResult && action.status === 'complete') {
    const ytResult = action.result as {
      type: string;
      action: 'play' | 'select' | 'no_results';
      videos: any[];
      selected_video?: any;
      search_id?: string;
      query: string;
    };
    
    return (
      <div className="rounded-lg overflow-hidden">
        <YouTubeResults
          action={ytResult.action}
          videos={ytResult.videos}
          selectedVideo={ytResult.selected_video}
          searchId={ytResult.search_id}
          query={ytResult.query}
          onVideoSelect={onVideoSelect}
        />
      </div>
    );
  }
  
  // Render generated image results specially
  if (isGeneratedImageResult && action.status === 'complete') {
    const imageResult = action.result as {
      type: string;
      images: any[];
      prompt: string;
      negative_prompt?: string;
      width: number;
      height: number;
      steps: number;
      seed?: number;
      message?: string;
    };
    
    return (
      <div className="rounded-lg overflow-hidden">
        <GeneratedImage result={imageResult} />
      </div>
    );
  }

  // Standard action rendering
  return (
    <div className="bg-bg-tertiary border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-3 hover:bg-surface-hover transition-colors"
      >
        <TypeIcon className="w-4 h-4 text-accent flex-shrink-0" />
        <span className="text-sm text-text-primary flex-1 text-left truncate">
          {action.name}
        </span>
        <StatusIcon className={cn("w-4 h-4 flex-shrink-0", statusColors[action.status])} />
        {action.duration_ms && (
          <span className="text-xs text-text-muted">{action.duration_ms}ms</span>
        )}
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-text-muted" />
        )}
      </button>
      
      {expanded && (
        <div className="px-3 py-2 border-t border-border">
          {action.parameters && Object.keys(action.parameters).length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-text-muted mb-1">Parameters:</p>
              <pre className="text-xs text-text-secondary bg-bg-primary p-2 rounded overflow-x-auto">
                {JSON.stringify(action.parameters, null, 2)}
              </pre>
            </div>
          )}
          
          {action.result && (
            <div className="mb-2">
              <p className="text-xs text-text-muted mb-1">Result:</p>
              <pre className="text-xs text-text-secondary bg-bg-primary p-2 rounded overflow-x-auto max-h-32">
                {typeof action.result === 'string' 
                  ? action.result 
                  : JSON.stringify(action.result, null, 2)}
              </pre>
            </div>
          )}
          
          {action.error && (
            <div>
              <p className="text-xs text-error">{action.error}</p>
            </div>
          )}
          
          {/* Nested sub-agent actions */}
          {action.children && action.children.length > 0 && (
            <div className="mt-2 pl-3 border-l-2 border-border space-y-2">
              <p className="text-xs text-text-muted">Sub-agent actions:</p>
              {action.children.map((child, idx) => (
                <ActionItem key={child.id || idx} action={child} onVideoSelect={onVideoSelect} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
