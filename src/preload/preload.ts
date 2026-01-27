import { contextBridge } from "electron";
import {
  CreateChatSessionInput,
  CreateMessageInput,
  UpdateChatSessionInput,
  UpdateMessageInput,
  GetMessagesQuery,
  GetChatSessionsQuery,
  DatabaseResult,
  PaginatedResult,
  ChatSession,
  Message,
  MessageAttachment,
} from "../types/database";
import { UIPreferences, PreferenceKey } from "../types/preferences";
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
  MCPResource,
  MCPResourceContent,
  MCPPrompt,
  MCPPromptResult,
  DeepLinkAction,
  LogCategory,
  LogLevel,
  LogContext,
  UserProfile,
  WizardCompletionData,
  ValidationResult,
  ProviderValidationConfig,
} from "./types";
import type { Tool, ToolsCache, DisabledTools } from "../main/types/mcp";
import type { RuntimeInfo, RuntimeType } from "../types/runtime";

// Import API modules
import { appApi } from "./api/app";
import { chatApi } from "./api/chat";
import { modelsApi } from "./api/models";
import { inferenceApi } from "./api/inference";
import { databaseApi } from "./api/database";
import { preferencesApi } from "./api/preferences";
import { mcpApi } from "./api/mcp";
import { loggerApi } from "./api/logger";
import { wizardApi } from "./api/wizard";
import { profileApi } from "./api/profile";
import { debugApi } from "./api/debug";
import { settingsApi } from "./api/settings";
import { attachmentsApi } from "./api/attachments";
import { analyticsApi } from "./api/analytics";
import { mermaidApi } from "./api/mermaid";
import { widgetApi } from "./api/widget";
import { announcementsApi } from "./api/announcements";
import { skillsApi } from "./api/skills";

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
  MCPResource,
  MCPResourceContent,
  DeepLinkAction,
};

// Define the API interface for type safety
export interface LevanteAPI {
  // App information
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  getSystemTheme: () => Promise<{
    shouldUseDarkColors: boolean;
    themeSource: string;
  }>;
  onSystemThemeChanged: (
    callback: (theme: {
      shouldUseDarkColors: boolean;
      themeSource: string;
    }) => void
  ) => () => void;
  checkForUpdates: () => Promise<{ success: boolean; error?: string }>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  onDeepLink: (callback: (action: DeepLinkAction) => void) => () => void;
  oauth: {
    // ========================================
    // MCP OAuth Methods
    // ========================================

    // Authorize OAuth flow
    authorize: (params: {
      serverId: string;
      mcpServerUrl: string;
      scopes?: string[];
      clientId?: string;
      wwwAuthHeader?: string;
    }) => Promise<{
      success: boolean;
      error?: string;
      tokens?: {
        expiresAt: number;
        scope?: string;
      };
    }>;

    // Disconnect and revoke
    disconnect: (params: {
      serverId: string;
      revokeTokens?: boolean;
    }) => Promise<{
      success: boolean;
      error?: string;
    }>;

    // Get status
    status: (params: {
      serverId: string;
    }) => Promise<{
      success: boolean;
      data?: {
        hasConfig: boolean;
        hasTokens: boolean;
        isTokenValid: boolean;
        expiresAt?: number;
        scopes?: string[];
        authServerId?: string;
      };
      error?: string;
    }>;

    // Refresh token
    refresh: (params: {
      serverId: string;
    }) => Promise<{
      success: boolean;
      error?: string;
      tokens?: {
        expiresAt: number;
        scope?: string;
      };
    }>;

    // List OAuth servers
    list: () => Promise<{
      success: boolean;
      data?: Array<{
        serverId: string;
        hasConfig: boolean;
        hasTokens: boolean;
        isTokenValid: boolean;
      }>;
      error?: string;
    }>;

    // Cleanup all OAuth credentials for a removed server
    cleanup: (params: { serverId: string }) => Promise<{ success: boolean; error?: string }>;

    // Listen for OAuth-required events from the main process
    onOAuthRequired: (
      callback: (data: {
        serverId: string;
        mcpServerUrl: string;
        wwwAuth: string;
      }) => void
    ) => () => void;

    // Listen for credentials expiration events
    onCredentialsExpired: (
      callback: (data: {
        serverId: string;
        reason: 'client_secret_expired' | 'registration_revoked';
        timestamp: number;
      }) => void
    ) => () => void;

    // ========================================
    // OpenRouter OAuth Methods
    // ========================================

    // Start local OAuth callback server
    startServer: () => Promise<{
      success: boolean;
      port?: number;
      callbackUrl?: string;
      error?: string;
    }>;

    // Stop OAuth callback server
    stopServer: () => Promise<{ success: boolean; error?: string }>;

    // Listen for OAuth callbacks
    onCallback: (
      callback: (data: {
        success: boolean;
        provider?: string;
        code?: string;
        error?: string;
      }) => void
    ) => () => void;
  };

  // Chat functionality
  sendMessage: (request: ChatRequest) => Promise<{
    success: boolean;
    response: string;
    sources?: any[];
    reasoningText?: string;
  }>;
  streamChat: (
    request: ChatRequest,
    onChunk: (chunk: ChatStreamChunk) => void
  ) => Promise<string>;
  stopStreaming: (
    streamId?: string
  ) => Promise<{ success: boolean; error?: string }>;

  // Model functionality
  models: {
    fetchOpenRouter: (
      apiKey?: string
    ) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchGateway: (
      apiKey: string,
      baseUrl?: string
    ) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchLocal: (
      endpoint: string
    ) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchOpenAI: (
      apiKey: string
    ) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchGoogle: (
      apiKey: string
    ) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchAnthropic: (
      apiKey: string
    ) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchGroq: (
      apiKey: string
    ) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchXAI: (
      apiKey: string
    ) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchHuggingFace: (
      apiKey: string
    ) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    validateHuggingFaceModel: (
      modelId: string,
      inferenceProvider: string
    ) => Promise<{ success: boolean; data?: any; error?: string }>;
  };

  // Inference functionality
  inference: {
    dispatch: (
      apiKey: string,
      call: any
    ) => Promise<{ success: boolean; data?: any; error?: string }>;
    textToImage: (
      apiKey: string,
      model: string,
      prompt: string,
      options?: any
    ) => Promise<{ success: boolean; data?: any; error?: string }>;
    imageToText: (
      apiKey: string,
      model: string,
      imageBuffer: ArrayBuffer,
      options?: any
    ) => Promise<{ success: boolean; data?: any; error?: string }>;
    asr: (
      apiKey: string,
      model: string,
      audioBuffer: ArrayBuffer,
      options?: any
    ) => Promise<{ success: boolean; data?: any; error?: string }>;
    saveImage: (
      dataUrl: string,
      defaultFilename: string
    ) => Promise<{ success: boolean; data?: string; error?: string }>;
  };

  // Database functionality
  db: {
    health: () => Promise<{
      success: boolean;
      data?: {
        healthy: boolean;
        path: string;
        isInitialized: boolean;
        environment: string;
      };
      error?: string;
    }>;
    sessions: {
      create: (
        input: CreateChatSessionInput
      ) => Promise<DatabaseResult<ChatSession>>;
      get: (id: string) => Promise<DatabaseResult<ChatSession | null>>;
      list: (
        query?: GetChatSessionsQuery
      ) => Promise<DatabaseResult<PaginatedResult<ChatSession>>>;
      update: (
        input: UpdateChatSessionInput
      ) => Promise<DatabaseResult<ChatSession | null>>;
      delete: (id: string) => Promise<DatabaseResult<boolean>>;
    };
    messages: {
      create: (input: CreateMessageInput) => Promise<DatabaseResult<Message>>;
      list: (
        query: GetMessagesQuery
      ) => Promise<DatabaseResult<PaginatedResult<Message>>>;
      search: (
        searchQuery: string,
        sessionId?: string,
        limit?: number
      ) => Promise<DatabaseResult<Message[]>>;
      update: (input: UpdateMessageInput) => Promise<DatabaseResult<Message | null>>;
      deleteAfter: (sessionId: string, afterTimestamp: number) => Promise<DatabaseResult<number>>;
    };
    generateTitle: (
      message: string
    ) => Promise<{ success: boolean; data?: string; error?: string }>;
  };

  // Preferences functionality
  preferences: {
    get: <K extends PreferenceKey>(
      key: K
    ) => Promise<{ success: boolean; data?: UIPreferences[K]; error?: string }>;
    set: <K extends PreferenceKey>(
      key: K,
      value: UIPreferences[K]
    ) => Promise<{ success: boolean; data?: UIPreferences[K]; error?: string }>;
    getAll: () => Promise<{
      success: boolean;
      data?: UIPreferences;
      error?: string;
    }>;
    reset: () => Promise<{
      success: boolean;
      data?: UIPreferences;
      error?: string;
    }>;
    has: (
      key: PreferenceKey
    ) => Promise<{ success: boolean; data?: boolean; error?: string }>;
    delete: (
      key: PreferenceKey
    ) => Promise<{ success: boolean; data?: boolean; error?: string }>;
    export: () => Promise<{
      success: boolean;
      data?: UIPreferences;
      error?: string;
    }>;
    import: (
      preferences: Partial<UIPreferences>
    ) => Promise<{ success: boolean; data?: UIPreferences; error?: string }>;
    info: () => Promise<{
      success: boolean;
      data?: { path: string; size: number };
      error?: string;
    }>;
  };

  // Settings (placeholder for future implementation)
  getSettings: () => Promise<Record<string, any>>;
  updateSettings: (settings: Record<string, any>) => Promise<boolean>;

  // MCP functionality
  mcp: {
    connectServer: (
      config: MCPServerConfig
    ) => Promise<{ success: boolean; error?: string }>;
    disconnectServer: (
      serverId: string
    ) => Promise<{ success: boolean; error?: string }>;
    enableServer: (
      serverId: string
    ) => Promise<{ success: boolean; error?: string }>;
    disableServer: (
      serverId: string
    ) => Promise<{ success: boolean; error?: string }>;
    listTools: (
      serverId: string
    ) => Promise<{ success: boolean; data?: MCPTool[]; error?: string }>;
    callTool: (
      serverId: string,
      toolCall: MCPToolCall
    ) => Promise<{ success: boolean; data?: MCPToolResult; error?: string }>;
    connectionStatus: (serverId?: string) => Promise<{
      success: boolean;
      data?: Record<string, "connected" | "disconnected">;
      error?: string;
    }>;
    loadConfiguration: () => Promise<{
      success: boolean;
      data?: MCPConfiguration;
      error?: string;
    }>;
    refreshConfiguration: () => Promise<{
      success: boolean;
      data?: {
        serverResults: Record<string, { success: boolean; error?: string }>;
        config: MCPConfiguration;
      };
      error?: string;
    }>;
    saveConfiguration: (
      config: MCPConfiguration
    ) => Promise<{ success: boolean; error?: string }>;
    addServer: (
      config: MCPServerConfig
    ) => Promise<{ success: boolean; error?: string }>;
    removeServer: (
      serverId: string
    ) => Promise<{ success: boolean; error?: string }>;
    updateServer: (
      serverId: string,
      config: Partial<Omit<MCPServerConfig, "id">>
    ) => Promise<{ success: boolean; error?: string }>;
    getServer: (serverId: string) => Promise<{
      success: boolean;
      data?: MCPServerConfig | null;
      error?: string;
    }>;
    listServers: () => Promise<{
      success: boolean;
      data?: MCPServerConfig[];
      error?: string;
    }>;
    testConnection: (
      config: MCPServerConfig
    ) => Promise<{ success: boolean; data?: MCPTool[]; error?: string }>;
    importConfiguration: (
      config: MCPConfiguration
    ) => Promise<{ success: boolean; error?: string }>;
    exportConfiguration: () => Promise<{
      success: boolean;
      data?: MCPConfiguration;
      error?: string;
    }>;
    getConfigPath: () => Promise<{
      success: boolean;
      data?: string;
      error?: string;
    }>;
    getRegistry: () => Promise<{
      success: boolean;
      data?: any;
      error?: string;
    }>;
    validatePackage: (packageName: string) => Promise<{
      success: boolean;
      data?: {
        valid: boolean;
        status: string;
        message: string;
        alternative?: string;
      };
      error?: string;
    }>;
    cleanupDeprecated: () => Promise<{
      success: boolean;
      data?: { cleanedCount: number };
      error?: string;
    }>;
    healthReport: () => Promise<{
      success: boolean;
      data?: MCPHealthReport;
      error?: string;
    }>;
    unhealthyServers: () => Promise<{
      success: boolean;
      data?: string[];
      error?: string;
    }>;
    serverHealth: (
      serverId: string
    ) => Promise<{ success: boolean; data?: MCPServerHealth; error?: string }>;
    resetServerHealth: (
      serverId: string
    ) => Promise<{ success: boolean; error?: string }>;
    extractConfig: (text: string) => Promise<{
      success: boolean;
      data?: any;
      error?: string;
      suggestion?: string;
    }>;
    checkStructuredOutputSupport: () => Promise<{
      success: boolean;
      data?: {
        supported: boolean;
        currentModel: string;
        currentProvider: string;
        supportedModels: any[];
      };
      error?: string;
    }>;
    verifyPackage: (packageName: string) => Promise<{
      success: boolean;
      data?: { exists: boolean; status: number };
      error?: string;
    }>;
    getRuntimes: () => Promise<{
      success: boolean;
      data?: RuntimeInfo[];
      error?: string;
    }>;
    cleanupRuntimes: () => Promise<{ success: boolean; error?: string }>;
    installRuntime: (
      type: RuntimeType,
      version: string
    ) => Promise<{ success: boolean; data?: string; error?: string }>;
    providers: {
      list: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
      sync: (providerId: string) => Promise<{
        success: boolean;
        data?: { providerId: string; entries: any[]; syncedAt: string };
        error?: string;
      }>;
      syncAll: () => Promise<{
        success: boolean;
        data?: { syncedProviders: any[]; syncedAt: string };
        error?: string;
      }>;
      getEntries: (
        providerId: string
      ) => Promise<{ success: boolean; data?: any[]; error?: string }>;
      getAllEntries: () => Promise<{
        success: boolean;
        data?: any[];
        error?: string;
      }>;
      getEntry: (
        serverId: string
      ) => Promise<{ success: boolean; data?: any; error?: string }>;
    };
    // Resource methods
    listResources: (
      serverId: string
    ) => Promise<{ success: boolean; data?: MCPResource[]; error?: string }>;
    readResource: (
      serverId: string,
      uri: string
    ) => Promise<{
      success: boolean;
      data?: MCPResourceContent;
      error?: string;
    }>;
    // Prompt methods
    listPrompts: (
      serverId: string
    ) => Promise<{ success: boolean; data?: MCPPrompt[]; error?: string }>;
    getPrompt: (
      serverId: string,
      name: string,
      args?: Record<string, any>
    ) => Promise<{ success: boolean; data?: MCPPromptResult; error?: string }>;

    // Tools management
    getToolsCache: () => Promise<{ success: boolean; data?: ToolsCache; error?: string }>;
    getDisabledTools: () => Promise<{ success: boolean; data?: DisabledTools; error?: string }>;
    setDisabledTools: (
      serverId: string,
      toolNames: string[]
    ) => Promise<{ success: boolean; error?: string }>;
    toggleTool: (
      serverId: string,
      toolName: string,
      enabled: boolean
    ) => Promise<{ success: boolean; data?: string[]; error?: string }>;
    toggleAllTools: (
      serverId: string,
      enabled: boolean
    ) => Promise<{ success: boolean; data?: string[]; error?: string }>;
    clearServerTools: (
      serverId: string
    ) => Promise<{ success: boolean; error?: string }>;

    // Event listeners
    onToolsUpdated: (
      callback: (data: { serverId: string; tools: Tool[] }) => void
    ) => () => void;
  };

  // Logger functionality
  logger: {
    log: (
      category: LogCategory,
      level: LogLevel,
      message: string,
      context?: LogContext
    ) => Promise<{ success: boolean; error?: string }>;
    isEnabled: (
      category: LogCategory,
      level: LogLevel
    ) => Promise<{ success: boolean; data?: boolean; error?: string }>;
    configure: (config: any) => Promise<{ success: boolean; error?: string }>;
  };

  // Debug functionality
  debug: {
    directoryInfo: () => Promise<{
      success: boolean;
      data?: any;
      error?: string;
    }>;
    serviceHealth: () => Promise<{
      success: boolean;
      data?: any;
      error?: string;
    }>;
    listFiles: () => Promise<{
      success: boolean;
      data?: string[];
      error?: string;
    }>;
  };

  // Wizard functionality
  wizard: {
    checkStatus: () => Promise<{
      success: boolean;
      data?: {
        status: "not_started" | "in_progress" | "completed";
        isCompleted: boolean;
      };
      error?: string;
    }>;
    start: () => Promise<{ success: boolean; data?: boolean; error?: string }>;
    complete: (
      data: WizardCompletionData
    ) => Promise<{ success: boolean; data?: boolean; error?: string }>;
    reset: () => Promise<{ success: boolean; data?: boolean; error?: string }>;
    validateProvider: (
      config: ProviderValidationConfig
    ) => Promise<{ success: boolean; data?: ValidationResult; error?: string }>;
  };

  // Profile functionality
  profile: {
    get: () => Promise<{
      success: boolean;
      data?: UserProfile;
      error?: string;
    }>;
    update: (
      updates: Partial<UserProfile>
    ) => Promise<{ success: boolean; data?: UserProfile; error?: string }>;
    getPath: () => Promise<{ success: boolean; data?: string; error?: string }>;
    openDirectory: () => Promise<{
      success: boolean;
      data?: string;
      error?: string;
    }>;
    getDirectoryInfo: () => Promise<{
      success: boolean;
      data?: {
        baseDir: string;
        exists: boolean;
        files: string[];
        totalFiles: number;
      };
      error?: string;
    }>;
  };

  // Attachments functionality
  attachments: {
    save: (
      sessionId: string,
      messageId: string,
      buffer: ArrayBuffer,
      filename: string,
      mimeType: string
    ) => Promise<{
      success: boolean;
      data?: MessageAttachment;
      error?: string;
    }>;
    load: (attachment: MessageAttachment) => Promise<{
      success: boolean;
      data?: MessageAttachment;
      error?: string;
    }>;
    loadMany: (attachments: MessageAttachment[]) => Promise<{
      success: boolean;
      data?: MessageAttachment[];
      error?: string;
    }>;
    deleteSession: (
      sessionId: string
    ) => Promise<{ success: boolean; error?: string }>;
    deleteMessage: (
      sessionId: string,
      messageId: string
    ) => Promise<{ success: boolean; error?: string }>;
    stats: () => Promise<{
      success: boolean;
      data?: { totalSize: number; fileCount: number };
      error?: string;
    }>;
    getBasePath: () => Promise<{
      success: boolean;
      data?: string;
      error?: string;
    }>;
  };

  // Analytics functionality
  analytics: {
    trackConversation: () => Promise<{ success: boolean; error?: string }>;
    trackMCP: (
      name: string,
      status: "active" | "removed"
    ) => Promise<{ success: boolean; error?: string }>;
    trackProvider: (
      name: string,
      count: number
    ) => Promise<{ success: boolean; error?: string }>;
    trackUser: () => Promise<{ success: boolean; error?: string }>;
    trackAppOpen: (force?: boolean) => Promise<{ success: boolean; error?: string }>;
    disableAnalytics: () => Promise<{ success: boolean; error?: string }>;
    enableAnalytics: () => Promise<{ success: boolean; error?: string }>;
  };

  // Mermaid functionality
  mermaid: {
    onValidate: (
      callback: (data: { requestId: string; code: string }) => void
    ) => () => void;
    sendResult: (data: { requestId: string; result: any }) => void;
  };

  // Announcements functionality
  announcements: {
    check: () => Promise<{ success: boolean; data?: import('../types/announcement').Announcement; error?: string }>;
    markSeen: (id: string, category: import('../types/announcement').AnnouncementCategory) => Promise<{ success: boolean; error?: string }>;
    enablePrivacy: (id: string) => Promise<{ success: boolean; error?: string }>;
  };

  // Widget proxy functionality
  widget: {
    store: (html: string, options?: {
      protocol?: 'mcp-apps' | 'openai-sdk' | 'mcp-ui' | 'none';
      bridgeOptions?: {
        toolInput?: Record<string, unknown>;
        toolOutput?: Record<string, unknown>;
        responseMetadata?: Record<string, unknown>;
        locale?: string;
        theme?: 'light' | 'dark' | 'system';
        serverId?: string;
      };
      baseUrl?: string;
    } | string) => Promise<{
      success: boolean;
      url?: string;
      widgetId?: string;
      error?: string;
    }>;
    remove: (widgetId: string) => Promise<{
      success: boolean;
      error?: string;
    }>;
    getProxyInfo: () => Promise<{
      success: boolean;
      port?: number;
      secret?: string;
      error?: string;
    }>;
  };

  // Skills API
  skills: {
    list: () => Promise<{ success: boolean; data?: import('../types/skills').Skill[]; error?: string }>;
    get: (id: string) => Promise<{ success: boolean; data?: import('../types/skills').Skill; error?: string }>;
    getEnabled: () => Promise<{ success: boolean; data?: import('../types/skills').Skill[]; error?: string }>;
    enable: (id: string) => Promise<{ success: boolean; error?: string }>;
    disable: (id: string) => Promise<{ success: boolean; error?: string }>;
    toggle: (id: string) => Promise<{ success: boolean; error?: string }>;
    refresh: () => Promise<{ success: boolean; data?: import('../types/skills').Skill[]; error?: string }>;
    getPath: () => Promise<{ success: boolean; data?: string; error?: string }>;
    validate: (id: string) => Promise<{ success: boolean; data?: import('../types/skills').SkillValidationResult; error?: string }>;
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

  // Inference API
  inference: inferenceApi,

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

  // Attachments API
  attachments: attachmentsApi,

  // Analytics API
  analytics: analyticsApi,

  // Mermaid API
  ...mermaidApi,
  // Widget Protocol API
  widget: widgetApi,

  // Announcements API
  announcements: announcementsApi,

  // Skills API
  skills: skillsApi,
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("levante", api);
  } catch (error) {
    // Error in preload - cannot use centralized logger here, fallback to console
    console.error("Failed to expose API:", error);
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
