import { UIMessage } from 'ai';
import type { LogCategory, LogLevel, LogContext } from '../../main/types/logger';
import type { UserProfile, WizardCompletionData } from '../../types/userProfile';
import type { ValidationResult, ProviderValidationConfig } from '../../types/wizard';

export interface ChatRequest {
  messages: UIMessage[];
  model: string;
  webSearch: boolean;
  enableMCP?: boolean;
}

export interface ChatStreamChunk {
  delta?: string;
  done?: boolean;
  error?: string;
  sources?: Array<{ url: string; title?: string }>;
  reasoning?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, any>;
    status: 'running' | 'success' | 'error';
    timestamp: number;
  };
  toolResult?: {
    id: string;
    result: any;
    status: 'success' | 'error';
    timestamp: number;
  };
}

// MCP Types for preload
export interface MCPServerConfig {
  id: string;
  name?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  baseUrl?: string;
  headers?: Record<string, string>;
  transport: 'stdio' | 'http' | 'sse';
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

// Deep link types
export interface DeepLinkAction {
  type: 'mcp-add' | 'chat-new';
  data: Record<string, unknown>;
}

export type {
  LogCategory,
  LogLevel,
  LogContext,
  UserProfile,
  WizardCompletionData,
  ValidationResult,
  ProviderValidationConfig,
};
