import { UIMessage } from 'ai';
import type { LogCategory, LogLevel, LogContext } from '../../main/types/logger';
import type { UserProfile, WizardCompletionData, AppMode, PlatformUser, PlatformStatus } from '../../types/userProfile';
import type { ValidationResult, ProviderValidationConfig } from '../../types/wizard';

export interface ChatRequest {
  messages: UIMessage[];
  model: string;
  webSearch?: boolean;
  enableMCP?: boolean;
  sessionId?: string;
  projectDescription?: string; // Descripción del proyecto (inyectada en system prompt)
  // Contexto de proyecto para carga de skills por scope
  projectContext?: {
    projectId?: string;
  };
  // Modo de codificación (Cowork mode)
  codeMode?: {
    enabled: boolean;
    cwd?: string;
    tools?: {
      bash?: boolean;
      read?: boolean;
      write?: boolean;
      edit?: boolean;
      grep?: boolean;
      find?: boolean;
      ls?: boolean;
      taskOutput?: boolean;
      killTask?: boolean;
      listTasks?: boolean;
    };
  };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ChatStreamChunk {
  delta?: string;
  done?: boolean;
  error?: string;
  errorCategory?: string;
  stepStart?: boolean;
  stepFinish?: boolean;
  parts?: Array<any>; // Rich content parts for rendering
  sources?: Array<{ url: string; title?: string }>;
  reasoningText?: string;
  reasoningId?: string; // Stable ID for reasoning block reconciliation
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, any>;
    status: 'running' | 'success' | 'error';
    timestamp: number;
    providerExecuted?: boolean;
    providerMetadata?: Record<string, unknown>;
  };
  toolResult?: {
    id: string;
    result: any;
    status: 'success' | 'error';
    timestamp: number;
    providerExecuted?: boolean;
  };
  toolApproval?: {
    approvalId: string;
    toolCallId: string;
    toolName: string;
    input: Record<string, any>;
  };
  generatedAttachment?: {
    type: 'image' | 'audio' | 'video';
    mime: string;
    dataUrl: string;
    filename: string;
  };
  tokenUsage?: TokenUsage;
}

// MCP Types for preload
export interface MCPServerConfig {
  id: string;
  name?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  baseUrl?: string; // Legacy support, prefer 'url'
  headers?: Record<string, string>;
  transport: 'stdio' | 'http' | 'sse' | 'streamable-http';
  enabled?: boolean; // Added by listServers(), not stored in JSON
}

export interface MCPConfiguration {
  mcpServers: Record<string, Omit<MCPServerConfig, 'id'>>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: any;
  }>;
  isError?: boolean;
}

export interface MCPServerHealth {
  serverId: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastError?: string;
  errorCount: number;
  successCount: number;
  consecutiveErrors: number;
  lastSuccess?: number;
  lastErrorTime?: number;
  tools: Record<string, {
    errorCount: number;
    successCount: number;
    lastError?: string;
  }>;
}

export interface MCPHealthReport {
  servers: Record<string, MCPServerHealth>;
  lastUpdated: number;
}

// MCP Resources types
export interface MCPResource {
  name: string;
  uri: string;
  description?: string;
  mimeType?: string;
  annotations?: {
    audience?: ('user' | 'assistant')[];
    priority?: number;
    lastModified?: string;
  };
}

export interface MCPResourceContent {
  uri: string;
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: ArrayBuffer;
  }>;
}

// MCP Prompts types
export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

export interface MCPPromptMessage {
  role: 'user' | 'assistant' | 'system';
  content: {
    type: 'text' | 'image';
    text?: string;
    data?: string;
    mimeType?: string;
  };
}

export interface MCPPromptResult {
  description?: string;
  messages: MCPPromptMessage[];
}

// Deep link types
export interface InputDefinition {
  label: string;
  required: boolean;
  type: 'string' | 'password' | 'number' | 'boolean';
  default?: string;
  description?: string;
}

export interface DeepLinkAction {
  type: 'mcp-add' | 'mcp-configure' | 'chat-new' | 'skill-install';
  data: Record<string, unknown>;
}

export type {
  LogCategory,
  LogLevel,
  LogContext,
  UserProfile,
  WizardCompletionData,
  AppMode,
  PlatformUser,
  PlatformStatus,
  ValidationResult,
  ProviderValidationConfig,
};

export type { Announcement, AnnouncementCategory, LastSeenAnnouncements } from '../../types/announcement';

// Context Budget types
export interface ContextBudgetEstimateInput {
  model: string;
  enableMCP: boolean;
  webSearch: boolean;
  projectDescription?: string;
  projectContext?: { projectId?: string };
  codeMode?: {
    enabled: boolean;
    cwd?: string;
    tools?: Record<string, boolean>;
  };
}

export interface ContextBudgetEstimate {
  systemPromptTokens: number;
  toolsTokens: number;
  skillsTokens: number;
  providerSlackTokens: number;
  staticOverheadTokens: number;
  toolCount: number;
}
