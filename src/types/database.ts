// Database entity types

/**
 * Session type distinguishes between different types of chats
 * - 'chat': Normal conversational chat with LLMs
 * - 'inference': Hugging Face inference tasks (text-to-image, image-to-image, etc.)
 */
export type SessionType = "chat" | "inference";

/**
 * Message attachment metadata
 * Stored attachments include id, path, size along with type and mime info
 */
export interface MessageAttachment {
  id: string; // Unique attachment ID
  type: "image" | "audio" | "video" | "document"; // Type of attachment
  filename: string; // Original filename
  mimeType: string; // MIME type (e.g., "image/jpeg")
  size: number; // File size in bytes
  path: string; // Relative path from attachments base directory
  dataUrl?: string; // Optional base64 data URL (loaded on demand)
}

export interface ChatSession {
  id: string;
  title?: string;
  model: string;
  session_type: SessionType; // Type of session (chat or inference)
  folder_id?: string | null;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tool_calls?: string | null; // JSON string or null
  attachments?: string | null; // JSON string of MessageAttachment[] or null
  reasoningText?: string | null; // JSON string of { text: string, duration?: number } or null
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
  type: "string" | "number" | "boolean" | "json";
  updated_at: number;
}

// Input types for creating entities
export interface CreateChatSessionInput {
  title?: string;
  model: string;
  session_type?: SessionType; // Optional, defaults to 'chat'
  folder_id?: string | null;
}

export interface CreateMessageInput {
  id?: string; // Optional ID from frontend - backend uses it if provided, otherwise generates a new one
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tool_calls?: object[] | null; // Will be JSON stringified or null
  attachments?: MessageAttachment[] | null; // File attachments (images, audio)
  reasoningText?: { text: string; duration?: number } | null; // Reasoning content from AI models
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
  folder_id?: string | null;
  session_type?: SessionType;
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

export interface DeleteMessagesAfterQuery {
  session_id: string;
  after_timestamp: number; // created_at del mensaje editado
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
