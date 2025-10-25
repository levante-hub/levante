import { contextBridge } from 'electron';
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
} from '../types/database';
import { UIPreferences, PreferenceKey } from '../types/preferences';
import type {
  ChatRequest,
  ChatStreamChunk,
  MCPServerConfig,
  MCPConfiguration,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPServerHealth,
  MCPHealthReport,
  DeepLinkAction,
  LogCategory,
  LogLevel,
  LogContext,
  UserProfile,
  WizardCompletionData,
  ValidationResult,
  ProviderValidationConfig,
} from './types';

// Import API modules
import { appApi } from './api/app';
import { chatApi } from './api/chat';
import { modelsApi } from './api/models';
import { databaseApi } from './api/database';
import { preferencesApi } from './api/preferences';
import { mcpApi } from './api/mcp';
import { loggerApi } from './api/logger';
import { wizardApi } from './api/wizard';
import { profileApi } from './api/profile';
import { debugApi } from './api/debug';
import { settingsApi } from './api/settings';

// Re-export types for backwards compatibility
export type {
  ChatRequest,
  ChatStreamChunk,
  MCPServerConfig,
  MCPConfiguration,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPServerHealth,
  MCPHealthReport,
  DeepLinkAction,
};

// Define the API interface for type safety
export interface LevanteAPI {
  // App information
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  getSystemTheme: () => Promise<{ shouldUseDarkColors: boolean; themeSource: string }>;
  onSystemThemeChanged: (callback: (theme: { shouldUseDarkColors: boolean; themeSource: string }) => void) => () => void;
  checkForUpdates: () => Promise<{ success: boolean; error?: string }>;
  onDeepLink: (callback: (action: DeepLinkAction) => void) => () => void;

  // Chat functionality
  sendMessage: (request: ChatRequest) => Promise<{ success: boolean; response: string; sources?: any[]; reasoning?: string }>;
  streamChat: (request: ChatRequest, onChunk: (chunk: ChatStreamChunk) => void) => Promise<string>;
  stopStreaming: (streamId?: string) => Promise<{ success: boolean; error?: string }>;

  // Model functionality
  models: {
    fetchOpenRouter: (apiKey?: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchGateway: (apiKey: string, baseUrl?: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchLocal: (endpoint: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchOpenAI: (apiKey: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchGoogle: (apiKey: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchAnthropic: (apiKey: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchGroq: (apiKey: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchXAI: (apiKey: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
  };

  // Database functionality
  db: {
    health: () => Promise<{ success: boolean; data?: { healthy: boolean; path: string; isInitialized: boolean; environment: string }; error?: string }>;
    sessions: {
      create: (input: CreateChatSessionInput) => Promise<DatabaseResult<ChatSession>>;
      get: (id: string) => Promise<DatabaseResult<ChatSession | null>>;
      list: (query?: GetChatSessionsQuery) => Promise<DatabaseResult<PaginatedResult<ChatSession>>>;
      update: (input: UpdateChatSessionInput) => Promise<DatabaseResult<ChatSession | null>>;
      delete: (id: string) => Promise<DatabaseResult<boolean>>;
    };
    messages: {
      create: (input: CreateMessageInput) => Promise<DatabaseResult<Message>>;
      list: (query: GetMessagesQuery) => Promise<DatabaseResult<PaginatedResult<Message>>>;
      search: (searchQuery: string, sessionId?: string, limit?: number) => Promise<DatabaseResult<Message[]>>;
    };
    generateTitle: (message: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  };

  // Preferences functionality
  preferences: {
    get: <K extends PreferenceKey>(key: K) => Promise<{ success: boolean; data?: UIPreferences[K]; error?: string }>;
    set: <K extends PreferenceKey>(key: K, value: UIPreferences[K]) => Promise<{ success: boolean; data?: UIPreferences[K]; error?: string }>;
    getAll: () => Promise<{ success: boolean; data?: UIPreferences; error?: string }>;
    reset: () => Promise<{ success: boolean; data?: UIPreferences; error?: string }>;
    has: (key: PreferenceKey) => Promise<{ success: boolean; data?: boolean; error?: string }>;
    delete: (key: PreferenceKey) => Promise<{ success: boolean; data?: boolean; error?: string }>;
    export: () => Promise<{ success: boolean; data?: UIPreferences; error?: string }>;
    import: (preferences: Partial<UIPreferences>) => Promise<{ success: boolean; data?: UIPreferences; error?: string }>;
    info: () => Promise<{ success: boolean; data?: { path: string; size: number }; error?: string }>;
  };

  // Settings (placeholder for future implementation)
  getSettings: () => Promise<Record<string, any>>;
  updateSettings: (settings: Record<string, any>) => Promise<boolean>;

  // MCP functionality
  mcp: {
    connectServer: (config: MCPServerConfig) => Promise<{ success: boolean; error?: string }>;
    disconnectServer: (serverId: string) => Promise<{ success: boolean; error?: string }>;
    enableServer: (serverId: string) => Promise<{ success: boolean; error?: string }>;
    disableServer: (serverId: string) => Promise<{ success: boolean; error?: string }>;
    listTools: (serverId: string) => Promise<{ success: boolean; data?: MCPTool[]; error?: string }>;
    callTool: (serverId: string, toolCall: MCPToolCall) => Promise<{ success: boolean; data?: MCPToolResult; error?: string }>;
    connectionStatus: (serverId?: string) => Promise<{ success: boolean; data?: Record<string, 'connected' | 'disconnected'>; error?: string }>;
    loadConfiguration: () => Promise<{ success: boolean; data?: MCPConfiguration; error?: string }>;
    refreshConfiguration: () => Promise<{ success: boolean; data?: { serverResults: Record<string, { success: boolean; error?: string }>; config: MCPConfiguration }; error?: string }>;
    saveConfiguration: (config: MCPConfiguration) => Promise<{ success: boolean; error?: string }>;
    addServer: (config: MCPServerConfig) => Promise<{ success: boolean; error?: string }>;
    removeServer: (serverId: string) => Promise<{ success: boolean; error?: string }>;
    updateServer: (serverId: string, config: Partial<Omit<MCPServerConfig, 'id'>>) => Promise<{ success: boolean; error?: string }>;
    getServer: (serverId: string) => Promise<{ success: boolean; data?: MCPServerConfig | null; error?: string }>;
    listServers: () => Promise<{ success: boolean; data?: MCPServerConfig[]; error?: string }>;
    testConnection: (config: MCPServerConfig) => Promise<{ success: boolean; data?: MCPTool[]; error?: string }>;
    importConfiguration: (config: MCPConfiguration) => Promise<{ success: boolean; error?: string }>;
    exportConfiguration: () => Promise<{ success: boolean; data?: MCPConfiguration; error?: string }>;
    getConfigPath: () => Promise<{ success: boolean; data?: string; error?: string }>;
    diagnoseSystem: () => Promise<{ success: boolean; data?: { success: boolean; issues: string[]; recommendations: string[] }; error?: string }>;
    getRegistry: () => Promise<{ success: boolean; data?: any; error?: string }>;
    validatePackage: (packageName: string) => Promise<{ success: boolean; data?: { valid: boolean; status: string; message: string; alternative?: string }; error?: string }>;
    cleanupDeprecated: () => Promise<{ success: boolean; data?: { cleanedCount: number }; error?: string }>;
    healthReport: () => Promise<{ success: boolean; data?: MCPHealthReport; error?: string }>;
    unhealthyServers: () => Promise<{ success: boolean; data?: string[]; error?: string }>;
    serverHealth: (serverId: string) => Promise<{ success: boolean; data?: MCPServerHealth; error?: string }>;
    resetServerHealth: (serverId: string) => Promise<{ success: boolean; error?: string }>;
    extractConfig: (text: string) => Promise<{ success: boolean; data?: any; error?: string; suggestion?: string }>;
    checkStructuredOutputSupport: () => Promise<{ success: boolean; data?: { supported: boolean; currentModel: string; currentProvider: string; supportedModels: any[] }; error?: string }>;
    verifyPackage: (packageName: string) => Promise<{ success: boolean; data?: { exists: boolean; status: number }; error?: string }>;
  };

  // Logger functionality
  logger: {
    log: (category: LogCategory, level: LogLevel, message: string, context?: LogContext) => Promise<{ success: boolean; error?: string }>;
    isEnabled: (category: LogCategory, level: LogLevel) => Promise<{ success: boolean; data?: boolean; error?: string }>;
    configure: (config: any) => Promise<{ success: boolean; error?: string }>;
  };

  // Debug functionality
  debug: {
    directoryInfo: () => Promise<{ success: boolean; data?: any; error?: string }>;
    serviceHealth: () => Promise<{ success: boolean; data?: any; error?: string }>;
    listFiles: () => Promise<{ success: boolean; data?: string[]; error?: string }>;
  };

  // Wizard functionality
  wizard: {
    checkStatus: () => Promise<{ success: boolean; data?: { status: 'not_started' | 'in_progress' | 'completed'; isCompleted: boolean }; error?: string }>;
    start: () => Promise<{ success: boolean; data?: boolean; error?: string }>;
    complete: (data: WizardCompletionData) => Promise<{ success: boolean; data?: boolean; error?: string }>;
    reset: () => Promise<{ success: boolean; data?: boolean; error?: string }>;
    validateProvider: (config: ProviderValidationConfig) => Promise<{ success: boolean; data?: ValidationResult; error?: string }>;
  };

  // Profile functionality
  profile: {
    get: () => Promise<{ success: boolean; data?: UserProfile; error?: string }>;
    update: (updates: Partial<UserProfile>) => Promise<{ success: boolean; data?: UserProfile; error?: string }>;
    getPath: () => Promise<{ success: boolean; data?: string; error?: string }>;
    openDirectory: () => Promise<{ success: boolean; data?: string; error?: string }>;
    getDirectoryInfo: () => Promise<{ success: boolean; data?: { baseDir: string; exists: boolean; files: string[]; totalFiles: number }; error?: string }>;
  };
}

// Assemble the complete API from modules
const api: LevanteAPI = {
  // App API
  ...appApi,

  // Chat API
  ...chatApi,

  // Models API
  models: modelsApi,

  // Database API
  db: databaseApi,

  // Preferences API
  preferences: preferencesApi,

  // Settings API
  ...settingsApi,

  // MCP API
  mcp: mcpApi,

  // Logger API
  logger: loggerApi,

  // Debug API
  debug: debugApi,

  // Wizard API
  wizard: wizardApi,

  // Profile API
  profile: profileApi,
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('levante', api);
  } catch (error) {
    // Error in preload - cannot use centralized logger here, fallback to console
    console.error('Failed to expose API:', error);
  }
} else {
  // @ts-ignore (define in dts)
  window.levante = api;
}

// Type declaration for global window object
declare global {
  interface Window {
    levante: LevanteAPI;
  }
}
