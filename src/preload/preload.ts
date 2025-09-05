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

export interface ChatRequest {
  messages: UIMessage[];
  model: string;
  webSearch: boolean;
}

export interface ChatStreamChunk {
  delta?: string;
  done?: boolean;
  error?: string;
  sources?: Array<{ url: string; title?: string }>;
  reasoning?: string;
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

// Define the API interface for type safety
export interface LevanteAPI {
  // App information
  getVersion: () => Promise<string>
  getPlatform: () => Promise<string>
  
  // Chat functionality
  sendMessage: (request: ChatRequest) => Promise<{ success: boolean; response: string; sources?: any[]; reasoning?: string }>
  streamChat: (request: ChatRequest, onChunk: (chunk: ChatStreamChunk) => void) => Promise<string>
  
  // Model functionality  
  models: {
    fetchOpenRouter: (apiKey?: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
    fetchGateway: (apiKey: string, baseUrl?: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
    fetchLocal: (endpoint: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
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
    listTools: (serverId: string) => Promise<{ success: boolean; data?: MCPTool[]; error?: string }>
    callTool: (serverId: string, toolCall: MCPToolCall) => Promise<{ success: boolean; data?: MCPToolResult; error?: string }>
    connectionStatus: (serverId?: string) => Promise<{ success: boolean; data?: Record<string, 'connected' | 'disconnected'>; error?: string }>
    loadConfiguration: () => Promise<{ success: boolean; data?: MCPConfiguration; error?: string }>
    saveConfiguration: (config: MCPConfiguration) => Promise<{ success: boolean; error?: string }>
    addServer: (config: MCPServerConfig) => Promise<{ success: boolean; error?: string }>
    removeServer: (serverId: string) => Promise<{ success: boolean; error?: string }>
    updateServer: (serverId: string, config: Partial<Omit<MCPServerConfig, 'id'>>) => Promise<{ success: boolean; error?: string }>
    getServer: (serverId: string) => Promise<{ success: boolean; data?: MCPServerConfig | null; error?: string }>
    listServers: () => Promise<{ success: boolean; data?: MCPServerConfig[]; error?: string }>
    testConnection: (config: MCPServerConfig) => Promise<{ success: boolean; error?: string }>
    importConfiguration: (config: MCPConfiguration) => Promise<{ success: boolean; error?: string }>
    exportConfiguration: () => Promise<{ success: boolean; data?: MCPConfiguration; error?: string }>
    getConfigPath: () => Promise<{ success: boolean; data?: string; error?: string }>
  }
  
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const api: LevanteAPI = {
  getVersion: () => ipcRenderer.invoke('levante/app/version'),
  getPlatform: () => ipcRenderer.invoke('levante/app/platform'),
  
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
    
    return new Promise<string>((resolve, reject) => {
      let fullResponse = ''
      
      const handleChunk = (_event: any, chunk: ChatStreamChunk) => {
        if (chunk.delta) {
          fullResponse += chunk.delta
        }
        
        onChunk(chunk)
        
        if (chunk.done) {
          ipcRenderer.removeAllListeners(`levante/chat/stream/${streamId}`)
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

  // Model API
  models: {
    fetchOpenRouter: (apiKey?: string) => 
      ipcRenderer.invoke('levante/models/openrouter', apiKey),
    fetchGateway: (apiKey: string, baseUrl?: string) => 
      ipcRenderer.invoke('levante/models/gateway', apiKey, baseUrl),
    fetchLocal: (endpoint: string) => 
      ipcRenderer.invoke('levante/models/local', endpoint),
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
    
    listTools: (serverId: string) => 
      ipcRenderer.invoke('levante/mcp/list-tools', serverId),
    
    callTool: (serverId: string, toolCall: MCPToolCall) => 
      ipcRenderer.invoke('levante/mcp/call-tool', serverId, toolCall),
    
    connectionStatus: (serverId?: string) => 
      ipcRenderer.invoke('levante/mcp/connection-status', serverId),
    
    loadConfiguration: () => 
      ipcRenderer.invoke('levante/mcp/load-configuration'),
    
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
      ipcRenderer.invoke('levante/mcp/get-config-path')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('levante', api)
  } catch (error) {
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