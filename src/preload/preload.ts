import { contextBridge, ipcRenderer } from 'electron'
import { UIMessage } from 'ai'
import { UIPreferences, PreferenceKey } from '../types/preferences'
import {
  CreateChatSessionInput,
  CreateMessageInput,
  UpdateChatSessionInput,
  GetMessagesQuery,
  GetChatSessionsQuery,
  DatabaseResult,
  PaginatedResult,
  ChatSession,
  Message
} from '../types/database'
import type { LogCategory, LogLevel, LogContext } from '../main/types/logger'
import type { UserProfile, WizardCompletionData } from '../types/userProfile'
import type { ValidationResult, ProviderValidationConfig } from '../types/wizard'

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

// Define the API interface for type safety
export interface LevanteAPI {
  // App information
  getVersion: () => Promise<string>
  getPlatform: () => Promise<string>
  getSystemTheme: () => Promise<{ shouldUseDarkColors: boolean; themeSource: string }>
  onSystemThemeChanged: (callback: (theme: { shouldUseDarkColors: boolean; themeSource: string }) => void) => () => void
  checkForUpdates: () => Promise<{ success: boolean; error?: string }>
  onDeepLink: (callback: (action: DeepLinkAction) => void) => () => void

  // Chat functionality
  sendMessage: (request: ChatRequest) => Promise<{ success: boolean; response: string; sources?: any[]; reasoning?: string }>
  streamChat: (request: ChatRequest, onChunk: (chunk: ChatStreamChunk) => void) => Promise<string>
  stopStreaming: (streamId?: string) => Promise<{ success: boolean; error?: string }>
  
  // Model functionality
  models: {
    fetchOpenRouter: (apiKey?: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
    fetchGateway: (apiKey: string, baseUrl?: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
    fetchLocal: (endpoint: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
    fetchOpenAI: (apiKey: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
    fetchGoogle: (apiKey: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
    fetchAnthropic: (apiKey: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
    fetchGroq: (apiKey: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
    fetchXAI: (apiKey: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
  }
  
  // Database functionality
  db: {
    // Health check
    health: () => Promise<{ success: boolean; data?: { healthy: boolean; path: string; isInitialized: boolean; environment: string }; error?: string }>
    
    // Chat sessions
    sessions: {
      create: (input: CreateChatSessionInput) => Promise<DatabaseResult<ChatSession>>
      get: (id: string) => Promise<DatabaseResult<ChatSession | null>>
      list: (query?: GetChatSessionsQuery) => Promise<DatabaseResult<PaginatedResult<ChatSession>>>
      update: (input: UpdateChatSessionInput) => Promise<DatabaseResult<ChatSession | null>>
      delete: (id: string) => Promise<DatabaseResult<boolean>>
    }
    
    // Messages
    messages: {
      create: (input: CreateMessageInput) => Promise<DatabaseResult<Message>>
      list: (query: GetMessagesQuery) => Promise<DatabaseResult<PaginatedResult<Message>>>
      search: (searchQuery: string, sessionId?: string, limit?: number) => Promise<DatabaseResult<Message[]>>
    }
    
    // Utilities
    generateTitle: (message: string) => Promise<{ success: boolean; data?: string; error?: string }>
  }

  // Preferences functionality
  preferences: {
    get: <K extends PreferenceKey>(key: K) => Promise<{ success: boolean; data?: UIPreferences[K]; error?: string }>
    set: <K extends PreferenceKey>(key: K, value: UIPreferences[K]) => Promise<{ success: boolean; data?: UIPreferences[K]; error?: string }>
    getAll: () => Promise<{ success: boolean; data?: UIPreferences; error?: string }>
    reset: () => Promise<{ success: boolean; data?: UIPreferences; error?: string }>
    has: (key: PreferenceKey) => Promise<{ success: boolean; data?: boolean; error?: string }>
    delete: (key: PreferenceKey) => Promise<{ success: boolean; data?: boolean; error?: string }>
    export: () => Promise<{ success: boolean; data?: UIPreferences; error?: string }>
    import: (preferences: Partial<UIPreferences>) => Promise<{ success: boolean; data?: UIPreferences; error?: string }>
    info: () => Promise<{ success: boolean; data?: { path: string; size: number }; error?: string }>
  }
  
  // Settings (placeholder for future implementation)
  getSettings: () => Promise<Record<string, any>>
  updateSettings: (settings: Record<string, any>) => Promise<boolean>
  
  // MCP functionality
  mcp: {
    connectServer: (config: MCPServerConfig) => Promise<{ success: boolean; error?: string }>
    disconnectServer: (serverId: string) => Promise<{ success: boolean; error?: string }>
    enableServer: (serverId: string) => Promise<{ success: boolean; error?: string }>
    disableServer: (serverId: string) => Promise<{ success: boolean; error?: string }>
    listTools: (serverId: string) => Promise<{ success: boolean; data?: MCPTool[]; error?: string }>
    callTool: (serverId: string, toolCall: MCPToolCall) => Promise<{ success: boolean; data?: MCPToolResult; error?: string }>
    connectionStatus: (serverId?: string) => Promise<{ success: boolean; data?: Record<string, 'connected' | 'disconnected'>; error?: string }>
    loadConfiguration: () => Promise<{ success: boolean; data?: MCPConfiguration; error?: string }>
    refreshConfiguration: () => Promise<{ success: boolean; data?: { serverResults: Record<string, { success: boolean; error?: string }>; config: MCPConfiguration }; error?: string }>
    saveConfiguration: (config: MCPConfiguration) => Promise<{ success: boolean; error?: string }>
    addServer: (config: MCPServerConfig) => Promise<{ success: boolean; error?: string }>
    removeServer: (serverId: string) => Promise<{ success: boolean; error?: string }>
    updateServer: (serverId: string, config: Partial<Omit<MCPServerConfig, 'id'>>) => Promise<{ success: boolean; error?: string }>
    getServer: (serverId: string) => Promise<{ success: boolean; data?: MCPServerConfig | null; error?: string }>
    listServers: () => Promise<{ success: boolean; data?: MCPServerConfig[]; error?: string }>
    testConnection: (config: MCPServerConfig) => Promise<{ success: boolean; data?: MCPTool[]; error?: string }>
    importConfiguration: (config: MCPConfiguration) => Promise<{ success: boolean; error?: string }>
    exportConfiguration: () => Promise<{ success: boolean; data?: MCPConfiguration; error?: string }>
    getConfigPath: () => Promise<{ success: boolean; data?: string; error?: string }>
    diagnoseSystem: () => Promise<{ success: boolean; data?: { success: boolean; issues: string[]; recommendations: string[] }; error?: string }>
    getRegistry: () => Promise<{ success: boolean; data?: any; error?: string }>
    validatePackage: (packageName: string) => Promise<{ success: boolean; data?: { valid: boolean; status: string; message: string; alternative?: string }; error?: string }>
    cleanupDeprecated: () => Promise<{ success: boolean; data?: { cleanedCount: number }; error?: string }>
    healthReport: () => Promise<{ success: boolean; data?: MCPHealthReport; error?: string }>
    unhealthyServers: () => Promise<{ success: boolean; data?: string[]; error?: string }>
    serverHealth: (serverId: string) => Promise<{ success: boolean; data?: MCPServerHealth; error?: string }>
    resetServerHealth: (serverId: string) => Promise<{ success: boolean; error?: string }>
  }

  // Logger functionality
  logger: {
    log: (category: LogCategory, level: LogLevel, message: string, context?: LogContext) => Promise<{ success: boolean; error?: string }>
    isEnabled: (category: LogCategory, level: LogLevel) => Promise<{ success: boolean; data?: boolean; error?: string }>
    configure: (config: any) => Promise<{ success: boolean; error?: string }>
  }

  // Debug functionality
  debug: {
    directoryInfo: () => Promise<{ success: boolean; data?: any; error?: string }>
    serviceHealth: () => Promise<{ success: boolean; data?: any; error?: string }>
    listFiles: () => Promise<{ success: boolean; data?: string[]; error?: string }>
  }

  // Wizard functionality
  wizard: {
    checkStatus: () => Promise<{ success: boolean; data?: { status: 'not_started' | 'in_progress' | 'completed'; isCompleted: boolean }; error?: string }>
    start: () => Promise<{ success: boolean; data?: boolean; error?: string }>
    complete: (data: WizardCompletionData) => Promise<{ success: boolean; data?: boolean; error?: string }>
    reset: () => Promise<{ success: boolean; data?: boolean; error?: string }>
    validateProvider: (config: ProviderValidationConfig) => Promise<{ success: boolean; data?: ValidationResult; error?: string }>
  }

  // Profile functionality
  profile: {
    get: () => Promise<{ success: boolean; data?: UserProfile; error?: string }>
    update: (updates: Partial<UserProfile>) => Promise<{ success: boolean; data?: UserProfile; error?: string }>
    getPath: () => Promise<{ success: boolean; data?: string; error?: string }>
    openDirectory: () => Promise<{ success: boolean; data?: string; error?: string }>
    getDirectoryInfo: () => Promise<{ success: boolean; data?: { baseDir: string; exists: boolean; files: string[]; totalFiles: number }; error?: string }>
  }
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const api: LevanteAPI = {
  getVersion: () => ipcRenderer.invoke('levante/app/version'),
  getPlatform: () => ipcRenderer.invoke('levante/app/platform'),
  getSystemTheme: () => ipcRenderer.invoke('levante/app/theme'),
  onSystemThemeChanged: (callback) => {
    const listener = (_event: any, theme: { shouldUseDarkColors: boolean; themeSource: string }) => {
      callback(theme);
    };
    ipcRenderer.on('levante/app/theme-changed', listener);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('levante/app/theme-changed', listener);
    };
  },

  checkForUpdates: () => ipcRenderer.invoke('levante/app/check-for-updates'),

  onDeepLink: (callback) => {
    const listener = (_event: any, action: DeepLinkAction) => {
      callback(action);
    };
    ipcRenderer.on('levante/deep-link/action', listener);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('levante/deep-link/action', listener);
    };
  },

  sendMessage: (request: ChatRequest) =>
    ipcRenderer.invoke('levante/chat/send', request),
  
  streamChat: async (request: ChatRequest, onChunk: (chunk: ChatStreamChunk) => void) => {
    // CRITICAL FIX: Clean up any existing listeners first
    const existingListeners = ipcRenderer.eventNames().filter(name => 
      typeof name === 'string' && name.startsWith('levante/chat/stream/')
    )
    existingListeners.forEach(listenerName => {
      if (typeof listenerName === 'string') {
        ipcRenderer.removeAllListeners(listenerName)
      }
    })
    
    const { streamId } = await ipcRenderer.invoke('levante/chat/stream', request)
    
    // Store streamId for potential cancellation
    ;(globalThis as any)._currentStreamId = streamId
    
    return new Promise<string>((resolve, reject) => {
      let fullResponse = ''
      
      const handleChunk = (_event: any, chunk: ChatStreamChunk) => {
        if (chunk.delta) {
          fullResponse += chunk.delta
        }
        
        onChunk(chunk)
        
        if (chunk.done) {
          ipcRenderer.removeAllListeners(`levante/chat/stream/${streamId}`)
          // Clear current stream ID
          delete (globalThis as any)._currentStreamId
          if (chunk.error) {
            reject(new Error(chunk.error))
          } else {
            resolve(fullResponse)
          }
        }
      }
      
      ipcRenderer.on(`levante/chat/stream/${streamId}`, handleChunk)
    })
  },

  stopStreaming: async (streamId?: string) => {
    const targetStreamId = streamId || (globalThis as any)._currentStreamId
    if (!targetStreamId) {
      return { success: false, error: 'No active stream to stop' }
    }
    
    try {
      // Clean up listeners
      ipcRenderer.removeAllListeners(`levante/chat/stream/${targetStreamId}`)
      
      // Notify main process to stop streaming
      const result = await ipcRenderer.invoke('levante/chat/stop-stream', targetStreamId)
      
      // Clear current stream ID
      delete (globalThis as any)._currentStreamId
      
      return result
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  },

  // Model API
  models: {
    fetchOpenRouter: (apiKey?: string) =>
      ipcRenderer.invoke('levante/models/openrouter', apiKey),
    fetchGateway: (apiKey: string, baseUrl?: string) =>
      ipcRenderer.invoke('levante/models/gateway', apiKey, baseUrl),
    fetchLocal: (endpoint: string) =>
      ipcRenderer.invoke('levante/models/local', endpoint),
    fetchOpenAI: (apiKey: string) =>
      ipcRenderer.invoke('levante/models/openai', apiKey),
    fetchGoogle: (apiKey: string) =>
      ipcRenderer.invoke('levante/models/google', apiKey),
    fetchAnthropic: (apiKey: string) =>
      ipcRenderer.invoke('levante/models/anthropic', apiKey),
    fetchGroq: (apiKey: string) =>
      ipcRenderer.invoke('levante/models/groq', apiKey),
    fetchXAI: (apiKey: string) =>
      ipcRenderer.invoke('levante/models/xai', apiKey),
  },

  // Database API
  db: {
    health: () => ipcRenderer.invoke('levante/db/health'),
    
    sessions: {
      create: (input: CreateChatSessionInput) => 
        ipcRenderer.invoke('levante/db/sessions/create', input),
      
      get: (id: string) => 
        ipcRenderer.invoke('levante/db/sessions/get', id),
      
      list: (query?: GetChatSessionsQuery) => 
        ipcRenderer.invoke('levante/db/sessions/list', query || {}),
      
      update: (input: UpdateChatSessionInput) => 
        ipcRenderer.invoke('levante/db/sessions/update', input),
      
      delete: (id: string) => 
        ipcRenderer.invoke('levante/db/sessions/delete', id)
    },
    
    messages: {
      create: (input: CreateMessageInput) => 
        ipcRenderer.invoke('levante/db/messages/create', input),
      
      list: (query: GetMessagesQuery) => 
        ipcRenderer.invoke('levante/db/messages/list', query),
      
      search: (searchQuery: string, sessionId?: string, limit?: number) => 
        ipcRenderer.invoke('levante/db/messages/search', searchQuery, sessionId, limit)
    },
    
    generateTitle: (message: string) => 
      ipcRenderer.invoke('levante/db/generateTitle', message)
  },

  // Preferences API
  preferences: {
    get: <K extends PreferenceKey>(key: K) => 
      ipcRenderer.invoke('levante/preferences/get', key),
    
    set: <K extends PreferenceKey>(key: K, value: UIPreferences[K]) => 
      ipcRenderer.invoke('levante/preferences/set', key, value),
    
    getAll: () => 
      ipcRenderer.invoke('levante/preferences/getAll'),
    
    reset: () => 
      ipcRenderer.invoke('levante/preferences/reset'),
    
    has: (key: PreferenceKey) => 
      ipcRenderer.invoke('levante/preferences/has', key),
    
    delete: (key: PreferenceKey) => 
      ipcRenderer.invoke('levante/preferences/delete', key),
    
    export: () => 
      ipcRenderer.invoke('levante/preferences/export'),
    
    import: (preferences: Partial<UIPreferences>) => 
      ipcRenderer.invoke('levante/preferences/import', preferences),
    
    info: () => 
      ipcRenderer.invoke('levante/preferences/info')
  },
    
  getSettings: () => 
    ipcRenderer.invoke('levante/settings/get'),
    
  updateSettings: (settings: Record<string, any>) => 
    ipcRenderer.invoke('levante/settings/update', settings),
    
  // MCP API
  mcp: {
    connectServer: (config: MCPServerConfig) =>
      ipcRenderer.invoke('levante/mcp/connect-server', config),

    disconnectServer: (serverId: string) =>
      ipcRenderer.invoke('levante/mcp/disconnect-server', serverId),

    enableServer: (serverId: string) =>
      ipcRenderer.invoke('levante/mcp/enable-server', serverId),

    disableServer: (serverId: string) =>
      ipcRenderer.invoke('levante/mcp/disable-server', serverId),

    listTools: (serverId: string) =>
      ipcRenderer.invoke('levante/mcp/list-tools', serverId),
    
    callTool: (serverId: string, toolCall: MCPToolCall) => 
      ipcRenderer.invoke('levante/mcp/call-tool', serverId, toolCall),
    
    connectionStatus: (serverId?: string) => 
      ipcRenderer.invoke('levante/mcp/connection-status', serverId),
    
    loadConfiguration: () => 
      ipcRenderer.invoke('levante/mcp/load-configuration'),
    
    refreshConfiguration: () => 
      ipcRenderer.invoke('levante/mcp/refresh-configuration'),
    
    saveConfiguration: (config: MCPConfiguration) => 
      ipcRenderer.invoke('levante/mcp/save-configuration', config),
    
    addServer: (config: MCPServerConfig) => 
      ipcRenderer.invoke('levante/mcp/add-server', config),
    
    removeServer: (serverId: string) => 
      ipcRenderer.invoke('levante/mcp/remove-server', serverId),
    
    updateServer: (serverId: string, config: Partial<Omit<MCPServerConfig, 'id'>>) => 
      ipcRenderer.invoke('levante/mcp/update-server', serverId, config),
    
    getServer: (serverId: string) => 
      ipcRenderer.invoke('levante/mcp/get-server', serverId),
    
    listServers: () => 
      ipcRenderer.invoke('levante/mcp/list-servers'),
    
    testConnection: (config: MCPServerConfig) => 
      ipcRenderer.invoke('levante/mcp/test-connection', config),
    
    importConfiguration: (config: MCPConfiguration) => 
      ipcRenderer.invoke('levante/mcp/import-configuration', config),
    
    exportConfiguration: () => 
      ipcRenderer.invoke('levante/mcp/export-configuration'),
    
    getConfigPath: () => 
      ipcRenderer.invoke('levante/mcp/get-config-path'),
    
    diagnoseSystem: () => 
      ipcRenderer.invoke('levante/mcp/diagnose-system'),
    
    getRegistry: () => 
      ipcRenderer.invoke('levante/mcp/get-registry'),
    
    validatePackage: (packageName: string) => 
      ipcRenderer.invoke('levante/mcp/validate-package', packageName),
    
    cleanupDeprecated: () => 
      ipcRenderer.invoke('levante/mcp/cleanup-deprecated'),
    
    healthReport: () => 
      ipcRenderer.invoke('levante/mcp/health-report'),
    
    unhealthyServers: () => 
      ipcRenderer.invoke('levante/mcp/unhealthy-servers'),
    
    serverHealth: (serverId: string) => 
      ipcRenderer.invoke('levante/mcp/server-health', serverId),
    
    resetServerHealth: (serverId: string) => 
      ipcRenderer.invoke('levante/mcp/reset-server-health', serverId)
  },

  // Logger API
  logger: {
    log: (category: LogCategory, level: LogLevel, message: string, context?: LogContext) =>
      ipcRenderer.invoke('levante/logger/log', { category, level, message, context }),
    
    isEnabled: (category: LogCategory, level: LogLevel) =>
      ipcRenderer.invoke('levante/logger/isEnabled', category, level),
    
    configure: (config: any) =>
      ipcRenderer.invoke('levante/logger/configure', config)
  },

  // Debug API
  debug: {
    directoryInfo: () =>
      ipcRenderer.invoke('levante/debug/directory-info'),

    serviceHealth: () =>
      ipcRenderer.invoke('levante/debug/service-health'),

    listFiles: () =>
      ipcRenderer.invoke('levante/debug/list-files')
  },

  // Wizard API
  wizard: {
    checkStatus: () =>
      ipcRenderer.invoke('levante/wizard/check-status'),

    start: () =>
      ipcRenderer.invoke('levante/wizard/start'),

    complete: (data: WizardCompletionData) =>
      ipcRenderer.invoke('levante/wizard/complete', data),

    reset: () =>
      ipcRenderer.invoke('levante/wizard/reset'),

    validateProvider: (config: ProviderValidationConfig) =>
      ipcRenderer.invoke('levante/wizard/validate-provider', config)
  },

  // Profile API
  profile: {
    get: () =>
      ipcRenderer.invoke('levante/profile/get'),

    update: (updates: Partial<UserProfile>) =>
      ipcRenderer.invoke('levante/profile/update', updates),

    getPath: () =>
      ipcRenderer.invoke('levante/profile/get-path'),

    openDirectory: () =>
      ipcRenderer.invoke('levante/profile/open-directory'),

    getDirectoryInfo: () =>
      ipcRenderer.invoke('levante/profile/get-directory-info')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('levante', api)
  } catch (error) {
    // Error in preload - cannot use centralized logger here, fallback to console
    console.error('Failed to expose API:', error)
  }
} else {
  // @ts-ignore (define in dts)
  window.levante = api
}

// Type declaration for global window object
declare global {
  interface Window {
    levante: LevanteAPI
  }
}