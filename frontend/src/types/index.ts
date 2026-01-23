/**
 * TypeScript type definitions for HAL
 */

// User types
export type UserRole = 'admin' | 'user';

export interface UserSettings {
  show_thinking: boolean;
  show_actions: boolean;
  show_subagents: boolean;
  theme: 'dark' | 'light';
  tool_overrides: Record<string, boolean>;
}

export interface User {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  settings: UserSettings;
  storage_used: number;
  storage_quota: number;
  created_at: string;
}

// Auth types
export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  display_name?: string;
}

export interface AuthResponse {
  token: string;
  token_type: string;
  user: User;
}

// Chat types
export type ChatVisibility = 'private' | 'shared' | 'public';
export type SharePermission = 'read' | 'write';

export interface SharedUser {
  user_id: string;
  permission: SharePermission;
  shared_at: string;
}

export interface Chat {
  id: string;
  user_id: string;
  title: string;
  persona_id: string | null;
  model_override: string | null;
  tts_enabled: boolean;
  tts_voice_id: string | null;
  voice_mode: boolean;
  enabled_tools: string[] | null;
  visibility: ChatVisibility;
  shared_with: SharedUser[];
  share_includes_history: boolean;
  created_at: string;
  updated_at: string;
  is_owner: boolean;
  can_write: boolean;
}

export interface ChatListItem {
  id: string;
  title: string;
  visibility: ChatVisibility;
  persona_id: string | null;
  updated_at: string;
  is_owner: boolean;
  message_count: number;
}

// Message types
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type ActionType = 'tool_call' | 'sub_agent' | 'rag_search' | 'memory_recall';
export type ActionStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface MessageAction {
  id: string;
  type: ActionType;
  name: string;
  parameters: Record<string, any>;
  status: ActionStatus;
  result: any;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  children: MessageAction[];
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface Message {
  id: string;
  chat_id: string;
  role: MessageRole;
  content: string;
  thinking: string | null;
  actions: MessageAction[];
  document_ids: string[];
  model_used: string | null;
  token_usage: TokenUsage | null;
  created_at: string;
}

// Document types
export interface Document {
  id: string;
  filename: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  chunk_count: number;
  created_at: string;
}

// Persona types
export interface Persona {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  avatar_emoji: string;
  temperature: number;
  model_override: string | null;
  tools_enabled: string[];
  creator_id: string | null;
  is_public: boolean;
  is_system: boolean;
  created_at: string;
  is_owner: boolean;
}

export interface PersonaListItem {
  id: string;
  name: string;
  description: string;
  avatar_emoji: string;
  is_public: boolean;
  is_system: boolean;
  is_owner: boolean;
}

// Memory types
export interface Memory {
  id: string;
  content: string;
  category: string;
  importance: number;
  source_chat_id: string | null;
  access_count: number;
  created_at: string;
  last_accessed: string | null;
}

export interface MemoryCategory {
  name: string;
  count: number;
}

// Tool types
export type ToolPermissionLevel = 'disabled' | 'admin_only' | 'always_on' | 'user_toggle' | 'opt_in';

export interface Tool {
  id: string;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  schema: Record<string, any>;
  permission_level: ToolPermissionLevel;
  default_enabled: boolean;
  config: Record<string, any>;
  usage_count: number;
  last_used: string | null;
  is_enabled: boolean;
  can_toggle: boolean;
}

// Alert types
export type AlertType = 'info' | 'success' | 'warning' | 'error';

export interface Alert {
  id: string;
  title: string;
  message: string;
  alert_type: AlertType;
  is_read: boolean;
  created_at: string;
  expires_at: string | null;
}

// Resource monitoring types
export interface ResourceStats {
  cpu: {
    percent: number;
    cores: number;
  };
  memory: {
    used_bytes: number;
    total_bytes: number;
    percent: number;
    used_gb: number;
    total_gb: number;
  };
  gpu: {
    name: string;
    load_percent: number;
    memory_used_mb: number;
    memory_total_mb: number;
    memory_percent: number;
    temperature: number;
  } | null;
  agents: {
    active: number;
    max: number;
    available: number;
  };
  queue: {
    pending: number;
  };
  latency: {
    avg_ms: number;
    p95_ms: number;
    samples: number;
  };
  timestamp: string;
}

// Stream chunk types
export interface StreamChunk {
  type: 'thinking' | 'action_start' | 'action_update' | 'action_complete' | 'content' | 'done' | 'error' | 'saved' | 'title_updated' | 'memories_used' | 'memories_pending';
  data: Record<string, any>;
}
