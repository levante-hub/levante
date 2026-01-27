import { RuntimeConfig } from '../../types/runtime';

export interface CodeModeConfig {
  enabled: boolean;
  executor?: 'vm' | 'e2b';
  executorOptions?: {
    timeout?: number;
    memoryLimit?: number;
    apiKey?: string;  // E2B only
  };
}

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
  enabled?: boolean;  // Added by listServers(), not stored in JSON
  runtime?: RuntimeConfig;
  /** Per-server code mode override (only applies to mcp-use) */
  codeMode?: boolean | CodeModeConfig;
  /** OAuth configuration (Phase 4) */
  oauth?: {
    enabled: boolean;
    authServerId?: string;
    clientId?: string;
    scopes?: string[];
  };
}

export interface MCPConfiguration {
  mcpServers: Record<string, Omit<MCPServerConfig, 'id'>>;
  disabled?: Record<string, Omit<MCPServerConfig, 'id'>>;
}

/**
 * Tool behavior annotations (MCP spec / OpenAI Apps SDK)
 */
export interface ToolAnnotations {
  /** Whether the tool only reads data without making changes */
  readOnlyHint?: boolean;
  /** Whether the tool may perform destructive updates */
  destructiveHint?: boolean;
  /** Whether the tool can be called multiple times with same result */
  idempotentHint?: boolean;
  /** Whether the tool operates on an open world (external systems) */
  openWorldHint?: boolean;
}

export interface Tool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
  /** Metadata including widget configuration (e.g., openai/outputTemplate for Skybridge) */
  _meta?: Record<string, any>;
  /** Tool behavior annotations (MCP spec) */
  annotations?: ToolAnnotations;
}

/**
 * Tool con información de servidor para UI
 */
export interface ServerTool extends Tool {
  serverId: string;
  serverName?: string;
  enabled: boolean;  // Si está seleccionada para uso
}

/**
 * Cache de tools por servidor
 */
export interface ToolsCache {
  [serverId: string]: {
    tools: Tool[];
    lastUpdated: number;  // timestamp
  };
}

/**
 * Tools deshabilitadas por servidor
 * serverId → array de toolNames bloqueados
 * Si un servidor no está en el objeto, todas sus tools están habilitadas (default)
 * Ventajas de este enfoque:
 * - Nuevas tools quedan habilitadas automáticamente
 * - Lista más compacta (normalmente se bloquean pocas tools)
 * - Patrón usado por Claude Desktop (disallowedTools) y mcp-use
 */
export interface DisabledTools {
  [serverId: string]: string[];  // toolNames bloqueados
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: any;
    // For embedded resources (EmbeddedResource format)
    resource?: {
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    };
  }>;
  isError?: boolean;
  /** Metadata from mcp-use including widget information */
  _meta?: {
    'mcp-use/widget'?: {
      name: string;
      description?: string;
      type: 'html' | 'remoteDom' | 'appsSdk';
      props?: Record<string, any>;
      /** HTML content for the widget (provided by mcp-use server) */
      html?: string;
      /** Whether widget is in development mode */
      dev?: boolean;
    };
    [key: string]: any;
  };
  /** Structured content with widget data (from mcp-use) */
  structuredContent?: Record<string, any>;
}

export interface MCPMetricsReport {
  totalCalls: number;
  successRate: number;
  averageDuration: number;
  errorRate: number;
  byServer: Record<string, {
    calls: number;
    successes: number;
    errors: number;
    totalDuration: number;
  }>;
  recentErrors: Array<{
    tool: string;
    error: string;
    time: number;
  }>;
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