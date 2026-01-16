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

// Memories API
export const memories = {
  list: (params?: { category?: string; search?: string; sort_by?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.search) query.set('search', params.search);
    if (params?.sort_by) query.set('sort_by', params.sort_by);
    if (params?.limit) query.set('limit', params.limit.toString());
    return request<{ memories: any[]; total: number }>(`/api/memories?${query}`);
  },
  
  categories: () => request<any[]>('/api/memories/categories'),
  
  get: (id: string) => request<any>(`/api/memories/${id}`),
  
  create: (data: { content: string; category?: string; importance?: number }) =>
    request<any>('/api/memories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    
  update: (id: string, data: { content?: string; category?: string; importance?: number }) =>
    request<any>(`/api/memories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    
  delete: (id: string) =>
    request<void>(`/api/memories/${id}`, { method: 'DELETE' }),
    
  bulkDelete: (ids: string[]) =>
    request<void>('/api/memories/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ memory_ids: ids }),
    }),
    
  search: (query: string, limit = 10) =>
    request<any[]>(`/api/memories/search/semantic?query=${encodeURIComponent(query)}&limit=${limit}`),
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

export { ApiError };
