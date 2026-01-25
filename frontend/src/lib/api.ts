/**
 * API Client for HAL Backend
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Debug log - will show in browser console
if (typeof window !== 'undefined') {
  console.log('[HAL API] Using API URL:', API_URL);
}

// Helper to get token from zustand persisted store
function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('hal-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.token || null;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(response.status, error.detail || 'Request failed');
  }
  
  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }
  
  return response.json();
}

// Auth API
export const auth = {
  login: (username: string, password: string) =>
    request<{ token: string; user: any }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
    
  register: (username: string, password: string, display_name?: string) =>
    request<{ token: string; user: any }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, display_name }),
    }),
    
  me: () => request<any>('/api/auth/me'),
  
  update: (data: { display_name?: string; password?: string; settings?: any }) =>
    request<any>('/api/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// Chats API
export const chats = {
  list: (includeShared = true, includePublic = false) =>
    request<any[]>(`/api/chats?include_shared=${includeShared}&include_public=${includePublic}`),
    
  get: (id: string) => request<any>(`/api/chats/${id}`),
  
  create: (data: { title?: string; persona_id?: string; enabled_tools?: string[] }) =>
    request<any>('/api/chats', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    
  update: (id: string, data: { 
    title?: string; 
    persona_id?: string;
    tts_enabled?: boolean;
    tts_voice_id?: string;
    voice_mode?: boolean;
    enabled_tools?: string[];
  }) =>
    request<any>(`/api/chats/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    
  delete: (id: string) =>
    request<void>(`/api/chats/${id}`, { method: 'DELETE' }),
  
  bulkDelete: (options: { titleFilter?: string; deleteEmptyOnly?: boolean; chatIds?: string[] }) =>
    request<{ deleted: number; skipped: number; message: string }>(
      `/api/chats/bulk/delete?${new URLSearchParams({
        ...(options.titleFilter && { title_filter: options.titleFilter }),
        delete_empty_only: (options.deleteEmptyOnly ?? true).toString(),
        ...(options.chatIds && { chat_ids: options.chatIds.join(',') })
      })}`,
      { method: 'DELETE' }
    ),
  
  getStats: () =>
    request<{
      total_chats: number;
      empty_chats: number;
      title_groups: Record<string, { count: number; empty: number; total_messages: number }>;
      chats: Array<{
        id: string;
        title: string;
        message_count: number;
        created_at: string;
        updated_at: string;
        persona_id?: string;
      }>;
    }>('/api/chats/analysis/stats'),
  
  getPreview: (chatId: string, limit = 10) =>
    request<{
      chat_id: string;
      title: string;
      total_messages: number;
      messages: Array<{ role: string; content: string; created_at: string }>;
    }>(`/api/chats/${chatId}/messages/preview?limit=${limit}`),
  
  extractMemories: (chatId: string) =>
    request<{
      chat_id: string;
      chat_title: string;
      message_count: number;
      pending: string[];
    }>(`/api/chats/${chatId}/extract-memories`, { method: 'POST' }),
    
  share: (id: string, userIds: string[], permission: string, includeHistory: boolean) =>
    request<any>(`/api/chats/${id}/share`, {
      method: 'POST',
      body: JSON.stringify({ user_ids: userIds, permission, include_history: includeHistory }),
    }),
    
  unshare: (chatId: string, userId: string) =>
    request<any>(`/api/chats/${chatId}/share/${userId}`, { method: 'DELETE' }),
    
  makePublic: (id: string, includeHistory: boolean) =>
    request<any>(`/api/chats/${id}/make-public`, {
      method: 'POST',
      body: JSON.stringify({ include_history: includeHistory }),
    }),
    
  makePrivate: (id: string) =>
    request<any>(`/api/chats/${id}/make-private`, { method: 'POST' }),
    
  warmup: () =>
    request<{ success: boolean; message: string }>('/api/chats/warmup', { method: 'POST' }),
};

// Messages API
export const messages = {
  list: (chatId: string, limit = 50) =>
    request<any[]>(`/api/chats/${chatId}/messages?limit=${limit}`),
    
  send: (chatId: string, content: string, documentIds: string[] = []) =>
    request<any>(`/api/chats/${chatId}/messages?stream=false`, {
      method: 'POST',
      body: JSON.stringify({ content, document_ids: documentIds }),
    }),
    
  sendStream: async function* (chatId: string, content: string, documentIds: string[] = []) {
    const token = getToken();
    
    const response = await fetch(`${API_URL}/api/chats/${chatId}/messages?stream=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ content, document_ids: documentIds }),
    });
    
    if (!response.ok) {
      throw new ApiError(response.status, 'Failed to send message');
    }
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) return;
    
    let buffer = '';  // Buffer for incomplete lines
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Append new data to buffer
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete lines
      const lines = buffer.split('\n');
      
      // Keep the last line in buffer if it's incomplete (doesn't end with newline)
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            // Debug: log action_complete events
            if (data.type === 'action_complete') {
              console.log('[API Stream] action_complete received:', data);
            }
            yield data;
          } catch (e) {
            console.warn('[API Stream] Failed to parse SSE line:', line.slice(0, 100), e);
          }
        }
      }
    }
    
    // Process any remaining data in buffer
    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (data.type === 'action_complete') {
          console.log('[API Stream] action_complete received (final):', data);
        }
        yield data;
      } catch (e) {
        console.warn('[API Stream] Failed to parse final SSE data:', buffer.slice(0, 100), e);
      }
    }
  },
};

// Documents API
export const documents = {
  list: (search?: string) =>
    request<{ documents: any[]; total: number; total_size: number }>(
      `/api/documents${search ? `?search=${encodeURIComponent(search)}` : ''}`
    ),
    
  get: (id: string) => request<any>(`/api/documents/${id}`),
  
  upload: async (file: File) => {
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_URL}/api/documents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      throw new ApiError(response.status, 'Upload failed');
    }
    
    return response.json();
  },
  
  delete: (id: string) =>
    request<void>(`/api/documents/${id}`, { method: 'DELETE' }),
};

// Personas API
export const personas = {
  list: () => request<any[]>('/api/personas'),
  
  get: (id: string) => request<any>(`/api/personas/${id}`),
  
  create: (data: any) =>
    request<any>('/api/personas', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    
  update: (id: string, data: any) =>
    request<any>(`/api/personas/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    
  delete: (id: string) =>
    request<void>(`/api/personas/${id}`, { method: 'DELETE' }),
};

// Memories API (Mem0-powered)
export const memories = {
  list: (params?: { limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    return request<{ memories: any[]; total: number }>(`/api/memories?${query}`);
  },
  
  get: (id: string) => request<any>(`/api/memories/${id}`),
  
  create: (data: { content: string; metadata?: Record<string, any> }) =>
    request<any>('/api/memories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    
  update: (id: string, data: { content: string }) =>
    request<any>(`/api/memories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    
  delete: (id: string) =>
    request<void>(`/api/memories/${id}`, { method: 'DELETE' }),
  
  deleteAll: () =>
    request<void>('/api/memories', { method: 'DELETE' }),
    
  search: (query: string, limit = 10) =>
    request<{ query: string; results: any[] }>('/api/memories/search', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    }),
  
  addConversation: (messages: Array<{ role: string; content: string }>, metadata?: Record<string, any>) =>
    request<{ extracted: number; memories: any[] }>('/api/memories/conversation', {
      method: 'POST',
      body: JSON.stringify({ messages, metadata }),
    }),
  
  confirm: (memoryContents: string[], metadata?: Record<string, any>) =>
    request<{ saved: number; memories: any[] }>('/api/memories/confirm', {
      method: 'POST',
      body: JSON.stringify({ memories: memoryContents, metadata }),
    }),
  
  history: (id: string) =>
    request<{ memory_id: string; history: any[] }>(`/api/memories/${id}/history`),
  
  consolidate: (similarityThreshold = 0.85, dryRun = true, findLowValue = true) =>
    request<{ 
      groups: Array<{
        type: string;
        memories: Array<{ id: string; content: string }>;
        similarity: number;
        suggested_merge: string;
        reason: string;
      }>;
      related: Array<{
        type: string;
        memories: Array<{ id: string; content: string }>;
        similarity: number;
        suggested_merge: string;
        reason: string;
      }>;
      low_value: Array<{
        id: string;
        content: string;
        reason: string;
      }>;
      total_duplicates: number;
      total_memories: number;
      deleted?: number;
    }>('/api/memories/consolidate', {
      method: 'POST',
      body: JSON.stringify({ 
        similarity_threshold: similarityThreshold, 
        dry_run: dryRun,
        find_low_value: findLowValue
      }),
    }),
  
  merge: (memoryIds: string[], mergedContent: string) =>
    request<{ 
      success: boolean;
      merged_memory: { id: string; content: string };
      deleted_count: number;
    }>('/api/memories/merge', {
      method: 'POST',
      body: JSON.stringify({ memory_ids: memoryIds, merged_content: mergedContent }),
    }),
};

// Tools API
export const tools = {
  list: () => request<any[]>('/api/tools'),
  
  toggle: (id: string, enabled: boolean) =>
    request<any>(`/api/tools/${id}/toggle`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),
};

// Alerts API
export const alerts = {
  list: () => request<{ alerts: any[]; unread_count: number }>('/api/alerts'),
  
  markRead: (id: string) =>
    request<void>(`/api/alerts/${id}/read`, { method: 'PUT' }),
    
  markAllRead: () =>
    request<void>('/api/alerts/read-all', { method: 'PUT' }),
};

// Admin API
export const admin = {
  users: {
    list: (search?: string) =>
      request<any[]>(`/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    update: (id: string, data: any) =>
      request<any>(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/api/admin/users/${id}`, { method: 'DELETE' }),
  },
  
  tools: {
    list: () => request<any[]>('/api/admin/tools'),
    update: (id: string, data: any) =>
      request<any>(`/api/admin/tools/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  
  alerts: {
    create: (data: any) =>
      request<any>('/api/admin/alerts', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/api/admin/alerts/${id}`, { method: 'DELETE' }),
  },
  
  resources: () => request<any>('/api/admin/resources'),
  
  config: {
    get: () => request<Record<string, any>>('/api/admin/config'),
    set: (key: string, value: any) =>
      request<any>(`/api/admin/config/${key}`, { method: 'PUT', body: JSON.stringify(value) }),
  },
};

// Models API
export const models = {
  list: () => request<{ models: any[]; default_chat: string; default_embed: string }>('/api/models'),
};

// TTS API (Chatterbox local TTS)
export const tts = {
  health: () => request<{ 
    status: string; 
    error?: string; 
    device?: string;
    gpu?: string;
    model_loaded?: boolean;
    turbo_available?: boolean;
  }>('/api/tts/health'),
  
  voices: () => request<{ 
    engine: string;
    voices: Array<{ 
      id: string; 
      name: string; 
      model?: string; 
      downloaded?: boolean;
      source: string;
      accent?: string;
      quality?: string;
      gender?: string;
    }> 
  }>('/api/tts/voices'),
  
  generate: async (
    text: string, 
    voiceId?: string,
    options?: {
      exaggeration?: number;  // 0.0-1.0, emotion intensity
      cfgWeight?: number;     // 0.0-1.0, voice similarity
      useCache?: boolean;
      useTurbo?: boolean;
    }
  ): Promise<Blob> => {
    const token = getToken();
    const response = await fetch(`${API_URL}/api/tts/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ 
        text, 
        voice_id: voiceId,
        exaggeration: options?.exaggeration ?? 0.5,
        cfg_weight: options?.cfgWeight ?? 0.5,
        use_cache: options?.useCache ?? true,
        use_turbo: options?.useTurbo ?? true
      }),
    });
    
    if (!response.ok) {
      throw new ApiError(response.status, 'Failed to generate speech');
    }
    
    return response.blob();
  },
  
  uploadVoice: async (voiceId: string, file: File): Promise<{ success: boolean; voice_id: string; path: string }> => {
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_URL}/api/tts/voices/upload?voice_id=${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      throw new ApiError(response.status, 'Failed to upload voice sample');
    }
    
    return response.json();
  },
  
  deleteVoice: (voiceId: string) => 
    request<{ success: boolean; message: string }>(`/api/tts/voices/${voiceId}`, { method: 'DELETE' }),
};

// Voice Settings API (Admin)
export interface VoiceInfo {
  id: string;
  name: string;
  accent: string;
  quality: string;
  gender: string;
  description: string;
  available: boolean;
  enabled?: boolean;
  is_default?: boolean;
}

export const voiceSettings = {
  // Get all voices (admin only)
  listAll: () => request<{
    voices: VoiceInfo[];
    enabled_count: number;
    total_count: number;
    available_count: number;
    default_voice_id: string;
  }>('/api/admin/voices'),
  
  // Get enabled voices (for /converse page - all users)
  listEnabled: () => request<{
    voices: VoiceInfo[];
    default_voice_id: string;
  }>('/api/admin/voices/enabled'),
  
  // Update enabled voices (admin only)
  update: (enabledVoiceIds: string[], defaultVoiceId?: string) =>
    request<{
      success: boolean;
      enabled_count: number;
      enabled_voice_ids: string[];
      default_voice_id: string;
    }>('/api/admin/voices', {
      method: 'PUT',
      body: JSON.stringify({ 
        enabled_voice_ids: enabledVoiceIds,
        default_voice_id: defaultVoiceId
      }),
    }),
  
  // Reset to defaults (admin only)
  reset: () =>
    request<{
      success: boolean;
      message: string;
      enabled_count: number;
      default_voice_id: string;
    }>('/api/admin/voices/reset', { method: 'POST' }),
};

// YouTube API
export const youtube = {
  recordSelection: (searchId: string, videoId: string) =>
    request<{ success: boolean }>('/api/youtube/select', {
      method: 'POST',
      body: JSON.stringify({ search_id: searchId, video_id: videoId }),
    }),
};

// STT API (faster-whisper speech-to-text)
export const stt = {
  /**
   * Get STT service status
   */
  status: () => request<{
    initialized: boolean;
    model_size: string;
    device: string;
    compute_type: string;
    ready: boolean;
    error?: string;
  }>('/api/stt/status'),
  
  /**
   * Initialize the STT model (useful if it failed at startup)
   */
  initialize: () => request<{
    status: string;
    model: string;
    device: string;
  }>('/api/stt/initialize', { method: 'POST' }),
  
  /**
   * Transcribe audio to text
   * @param audioBlob - Audio blob (WebM, WAV, MP3, etc.)
   * @param language - Optional language code (e.g., 'en', 'es') for faster processing
   * @returns Transcribed text and metadata
   */
  transcribe: async (
    audioBlob: Blob,
    language?: string
  ): Promise<{
    text: string;
    metadata: {
      language: string;
      language_probability: number;
      duration: number;
      transcribe_time: number;
      device: string;
      model: string;
    };
  }> => {
    const token = getToken();
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    
    const url = new URL(`${API_URL}/api/stt/transcribe`);
    if (language) {
      url.searchParams.set('language', language);
    }
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Transcription failed' }));
      throw new ApiError(response.status, error.detail || 'Transcription failed');
    }
    
    return response.json();
  },
};

// Image Generation API
export const imageGen = {
  /**
   * Get SD status and available models/samplers
   */
  getStatus: () =>
    request<{
      available: boolean;
      api_url: string;
      message: string;
      auto_start_configured: boolean;
      sd_path?: string;
      subprocess_running: boolean;
      starting: boolean;
      models?: string[];
      samplers?: string[];
    }>('/api/images/sd/status'),

  /**
   * Start Stable Diffusion server
   */
  start: () =>
    request<{ success: boolean; message?: string; error?: string }>('/api/images/sd/start', {
      method: 'POST',
    }),

  /**
   * Stop Stable Diffusion server
   */
  stop: () =>
    request<{ success: boolean; message?: string }>('/api/images/sd/stop', {
      method: 'POST',
    }),

  /**
   * Generate an image
   */
  generate: (params: {
    prompt: string;
    negative_prompt?: string;
    width?: number;
    height?: number;
    steps?: number;
    cfg_scale?: number;
    sampler_name?: string;
    seed?: number;
    batch_size?: number;
  }) =>
    request<{
      success: boolean;
      images?: Array<{
        filename: string;
        url: string;
      }>;
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
    }>('/api/images/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  /**
   * List user's generated images
   */
  listMyImages: () =>
    request<{
      images: Array<{
        filename: string;
        url: string;
        created_at: number;
      }>;
    }>('/api/images/my-images'),

  /**
   * Delete a generated image
   */
  deleteImage: (filename: string) =>
    request<{ message: string; filename: string }>(`/api/images/generated/${filename}`, {
      method: 'DELETE',
    }),

  /**
   * Get available models
   */
  getModels: () =>
    request<{ success: boolean; models?: string[]; error?: string }>('/api/images/sd/models'),

  /**
   * Get available samplers
   */
  getSamplers: () =>
    request<{ success: boolean; samplers?: string[]; error?: string }>('/api/images/sd/samplers'),
};

export { ApiError };
