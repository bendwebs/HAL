/**
 * API Client for HAL Backend
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  
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
  
  create: (data: { title?: string; persona_id?: string }) =>
    request<any>('/api/chats', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    
  update: (id: string, data: { title?: string; persona_id?: string }) =>
    request<any>(`/api/chats/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    
  delete: (id: string) =>
    request<void>(`/api/chats/${id}`, { method: 'DELETE' }),
  
  bulkDelete: (titleFilter?: string, deleteEmptyOnly = true) =>
    request<{ deleted: number; skipped: number; message: string }>(
      `/api/chats/bulk/delete?${new URLSearchParams({
        ...(titleFilter && { title_filter: titleFilter }),
        delete_empty_only: deleteEmptyOnly.toString()
      })}`,
      { method: 'DELETE' }
    ),
    
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
    const token = localStorage.getItem('token');
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
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            yield data;
          } catch {}
        }
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
    const token = localStorage.getItem('token');
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
  
  voices: () => request<{ voices: Array<{ id: string; name: string; path: string | null; source: string }> }>('/api/tts/voices'),
  
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
    const token = localStorage.getItem('token');
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
    const token = localStorage.getItem('token');
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

export { ApiError };
