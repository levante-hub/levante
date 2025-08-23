// Database entity types

export interface ChatSession {
  id: string;
  title?: string;
  model: string;
  folder_id?: string;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: string | null; // JSON string or null
  created_at: number;
}

export interface Provider {
  id: string;
  name: string;
  base_url?: string;
  api_key_ref?: string; // Reference to keychain
  enabled: boolean;
  created_at: number;
}

export interface Model {
  id: string;
  provider_id: string;
  name: string;
  display_name?: string;
  max_tokens?: number;
  supports_streaming: boolean;
  cost_per_token?: number;
  enabled: boolean;
}

export interface MCPServer {
  id: string;
  name: string;
  command: string;
  args?: string; // JSON string
  env?: string; // JSON string
  enabled: boolean;
  created_at: number;
}

export interface MCPTool {
  id: string;
  server_id: string;
  name: string;
  description?: string;
  schema?: string; // JSON schema
  enabled: boolean;
  consent_required: boolean;
}

export interface Setting {
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  updated_at: number;
}

// Input types for creating entities
export interface CreateChatSessionInput {
  title?: string;
  model: string;
  folder_id?: string;
}

export interface CreateMessageInput {
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: object[] | null; // Will be JSON stringified or null
}

export interface CreateProviderInput {
  name: string;
  base_url?: string;
  api_key_ref?: string;
  enabled?: boolean;
}

export interface CreateModelInput {
  provider_id: string;
  name: string;
  display_name?: string;
  max_tokens?: number;
  supports_streaming?: boolean;
  cost_per_token?: number;
  enabled?: boolean;
}

export interface CreateMCPServerInput {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface CreateMCPToolInput {
  server_id: string;
  name: string;
  description?: string;
  schema?: object;
  enabled?: boolean;
  consent_required?: boolean;
}

// Update types
export interface UpdateChatSessionInput {
  id: string;
  title?: string;
  model?: string;
  folder_id?: string;
}

export interface UpdateMessageInput {
  id: string;
  content?: string;
  tool_calls?: object[];
}

// Query types
export interface SearchMessagesQuery {
  query: string;
  session_id?: string;
  limit?: number;
  offset?: number;
}

export interface GetMessagesQuery {
  session_id: string;
  limit?: number;
  offset?: number;
}

export interface GetChatSessionsQuery {
  folder_id?: string;
  limit?: number;
  offset?: number;
}

// Database response types
export interface DatabaseResult<T> {
  data: T;
  success: boolean;
  error?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// Migration types
export interface Migration {
  version: number;
  name: string;
  queries: string[];
}

export interface SchemaMigration {
  version: number;
  applied_at: number;
}

// Database service types
export interface DatabaseInfo {
  path: string;
  isInitialized: boolean;
  environment: string;
}