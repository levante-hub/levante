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
  Project,
  CreateProjectInput,
  UpdateProjectInput,
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
import { miniChatApi, onMiniChatShown, onMiniChatHidden, onSessionLoad } from "./api/miniChat";
import { logViewerApi } from "./api/logViewer";
import { coworkApi } from "./api/cowork";
import { tasksApi } from "./api/tasks";
import { projectsApi } from "./api/projects";
import { skillsApi } from "./api/skills";
import { platformApi } from "./api/platform";
import { anthropicOAuthApi } from "./api/anthropicOAuth";
import { subscriptionOAuthApi } from "./api/subscriptionOAuth";
import { filesystemApi } from "./api/filesystem";
import { compactionApi } from "./api/compaction";
import { contextBudgetApi } from "./api/contextBudget";
import { shellApi } from "./api/shell";

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
      params:
        | string
        | { apiKey?: string; authMode?: 'api-key' | 'oauth'; organizationId?: string }
    ) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchGoogle: (
      apiKey: string
    ) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    fetchAnthropic: (
      params: { apiKey?: string; authMode?: 'api-key' | 'oauth' }
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
    // Levante Platform uses OAuth tokens instead of API keys
    // baseUrl is optional - defaults to https://platform.levante.ai
    fetchLevantePlatform: (baseUrl?: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
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
      message: string,
      modelId?: string
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
    trackModelUsage: (
      modelId: string,
      provider: string
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

  // Log viewer functionality
  logViewer: {
    startWatching: () => Promise<{ success: boolean; error?: string }>;
    stopWatching: () => Promise<{ success: boolean; error?: string }>;
    isWatching: () => Promise<{ success: boolean; data?: boolean; error?: string }>;
    getRecent: (limit: number) => Promise<{
      success: boolean;
      data?: Array<{
        id: string;
        timestamp: Date;
        category: LogCategory;
        level: LogLevel;
        message: string;
        context?: Record<string, any>;
        raw?: string;
      }>;
      error?: string;
    }>;
    getCurrentFile: () => Promise<{ success: boolean; data?: string; error?: string }>;
    getDirectory: () => Promise<{ success: boolean; data?: string; error?: string }>;
    onNewEntry: (callback: (entry: {
      id: string;
      timestamp: Date;
      category: LogCategory;
      level: LogLevel;
      message: string;
      context?: Record<string, any>;
      raw?: string;
    }) => void) => () => void;
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

  // Mini Chat API
  miniChat: {
    hide: () => Promise<{ success: boolean }>;
    resize: (height: number) => Promise<{ success: boolean }>;
    toggle: () => Promise<{ success: boolean }>;
    getHeight: () => Promise<{ success: boolean; height: number }>;
    openInMainWindow: (data: { messages: any[]; model: string; sessionId?: string }) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
  };
  onMiniChatShown: (callback: () => void) => () => void;
  onMiniChatHidden: (callback: () => void) => () => void;
  onSessionLoad: (callback: (data: { sessionId: string }) => void) => () => void;

  // Cowork API
  cowork: {
    selectWorkingDirectory: (options?: {
      title?: string;
      defaultPath?: string;
      buttonLabel?: string;
    }) => Promise<{
      success: boolean;
      data?: { path: string; canceled: boolean };
      error?: string;
    }>;
  };

  // Tasks API
  tasks: {
    list: (filter?: { status?: 'running' | 'completed' | 'failed' | 'killed' }) => Promise<{ success: boolean; data?: any; error?: string }>;
    get: (taskId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    getOutput: (taskId: string, options?: { includeTimestamps?: boolean; tail?: number }) => Promise<{ success: boolean; data?: string; error?: string }>;
    wait: (taskId: string, options?: { timeoutMs?: number }) => Promise<{ success: boolean; data?: any; error?: string }>;
    kill: (taskId: string) => Promise<{ success: boolean; data?: boolean; error?: string }>;
    stats: () => Promise<{ success: boolean; data?: any; error?: string }>;
    cleanup: (maxAgeMs?: number) => Promise<{ success: boolean; data?: number; error?: string }>;
    onPortDetected: (
      callback: (data: { taskId: string; port: number; command: string; description?: string }) => void
    ) => () => void;
  };

  // Projects API
  projects: {
    create: (input: CreateProjectInput) => Promise<DatabaseResult<Project>>;
    get: (id: string) => Promise<DatabaseResult<Project | null>>;
    list: () => Promise<DatabaseResult<Project[]>>;
    update: (input: UpdateProjectInput) => Promise<DatabaseResult<Project>>;
    delete: (id: string) => Promise<DatabaseResult<boolean>>;
    getSessions: (projectId: string) => Promise<DatabaseResult<ChatSession[]>>;
    addFiles: (projectId: string) => Promise<DatabaseResult<string[]>>;
  };

  // Platform API
  platform: {
    login: (baseUrl?: string) => Promise<{
      success: boolean;
      data?: import('./types').PlatformStatus;
      error?: string;
    }>;
    logout: () => Promise<{ success: boolean; error?: string }>;
    getStatus: () => Promise<{
      success: boolean;
      data?: import('./types').PlatformStatus;
      error?: string;
    }>;
    getModels: (payload?: { baseUrl?: string; reason?: string } | string) => Promise<{
      success: boolean;
      data?: any[];
      error?: string;
      code?: string;
    }>;
    getOrgId: () => Promise<{ success: boolean; data?: string }>;
  };

  // Filesystem API (File Browser - Fase 1)
  fs: {
    setWorkingDir: (path: string) => Promise<{ success: boolean; error?: string }>;
    getWorkingDir: () => Promise<{ success: boolean; data?: string | null; error?: string }>;
    readDir: (
      path: string,
      options?: { showHidden?: boolean; sortBy?: 'name' | 'type' | 'modified' }
    ) => Promise<{
      success: boolean;
      data?: Array<{
        name: string;
        path: string;
        type: 'file' | 'directory' | 'symlink';
        size: number;
        extension: string;
        modifiedAt: number;
        isHidden: boolean;
      }>;
      error?: string;
    }>;
    readFile: (
      path: string,
      options?: { maxSize?: number; encoding?: string }
    ) => Promise<{
      success: boolean;
      data?: {
        path: string;
        content: string;
        encoding: string;
        size: number;
        language: string;
        isBinary: boolean;
        isTruncated: boolean;
      };
      error?: string;
    }>;
    getPdfUrl: (path: string) => string;
    searchFiles: (
      query: string,
      options?: { maxResults?: number; maxDepth?: number }
    ) => Promise<{
      success: boolean;
      data?: Array<{
        name: string;
        path: string;
        relativePath: string;
        extension: string;
      }>;
      error?: string;
    }>;
    startWatching: () => Promise<{ success: boolean; error?: string }>;
    stopWatching: () => Promise<{ success: boolean; error?: string }>;
    onFilesChanged: (callback: (payload: {
      rootPath: string;
      changes: Array<{
        path: string;
        parentPath: string;
        kind:
          | 'file-added'
          | 'file-changed'
          | 'file-removed'
          | 'directory-added'
          | 'directory-removed';
      }>;
    }) => void) => () => void;
  };

  // Anthropic OAuth API (Claude Max/Pro subscription) - legacy shim
  anthropicOAuth: {
    start: (mode: 'max' | 'console') => Promise<{ success: boolean; authUrl?: string; error?: string }>;
    exchange: (code: string) => Promise<{ success: boolean; error?: string }>;
    status: () => Promise<{
      success: boolean;
      data?: { isConnected: boolean; isExpired: boolean; expiresAt?: number };
      error?: string;
    }>;
    disconnect: () => Promise<{ success: boolean; error?: string }>;
  };

  // Generic Subscription OAuth API (Anthropic + OpenAI)
  subscriptionOAuth: {
    start: (providerId: string) => Promise<{ success: boolean; authUrl?: string; error?: string }>;
    exchange: (providerId: string, code: string) => Promise<{ success: boolean; error?: string }>;
    status: (providerId: string) => Promise<{
      success: boolean;
      data?: { isConnected: boolean; isExpired: boolean; expiresAt?: number };
      error?: string;
    }>;
    disconnect: (providerId: string) => Promise<{ success: boolean; error?: string }>;
    onCallback: (callback: (data: { success: boolean; providerId: string; error?: string }) => void) => () => void;
  };

  // Compaction API
  compaction: {
    compact: (input: {
      sessionId: string;
      model: string;
    }) => Promise<{
      success: boolean;
      summaryMessageId?: string;
      stage?: number;
      error?: string;
      errorCategory?: string;
      exhaustedStages?: boolean;
    }>;
  };

  // Context Budget API
  contextBudget: {
    estimate: (input: import('./types').ContextBudgetEstimateInput) => Promise<{
      success: boolean;
      data?: import('./types').ContextBudgetEstimate;
      error?: string;
    }>;
  };

  // Shell API
  shell: {
    showItemInFolder: (path: string) => void;
  };

  // Skills API
  skills: {
    getCatalog: () => Promise<import('../types/skills').IPCResult<import('../types/skills').SkillsCatalogResponse>>;
    getCategories: () => Promise<import('../types/skills').IPCResult<{ categories: import('../types/skills').SkillCategory[] }>>;
    getBundle: (skillId: string) => Promise<import('../types/skills').IPCResult<import('../types/skills').SkillBundleResponse>>;
    install: (bundle: import('../types/skills').SkillBundleResponse, options?: import('../types/skills').InstallSkillOptions) => Promise<import('../types/skills').IPCResult<import('../types/skills').InstalledSkill>>;
    uninstall: (skillId: string, options: import('../types/skills').UninstallSkillOptions) => Promise<import('../types/skills').IPCResult<boolean>>;
    listInstalled: (options?: import('../types/skills').ListInstalledSkillsOptions) => Promise<import('../types/skills').IPCResult<import('../types/skills').InstalledSkill[]>>;
    isInstalled: (skillId: string) => Promise<import('../types/skills').IPCResult<boolean>>;
    setUserInvocable: (
      skillId: string,
      userInvocable: boolean,
      options: import('../types/skills').SetUserInvocableOptions
    ) => Promise<import('../types/skills').IPCResult<import('../types/skills').InstalledSkill>>;
    installFromZip: (
      zipPath: string,
      options?: import('../types/skills').InstallSkillOptions
    ) => Promise<import('../types/skills').IPCResult<import('../types/skills').InstalledSkill>>;
    installFromZipBuffer: (
      buffer: ArrayBuffer,
      fileName: string,
      options?: import('../types/skills').InstallSkillOptions
    ) => Promise<import('../types/skills').IPCResult<import('../types/skills').InstalledSkill>>;
    selectZipFile: () => Promise<import('../types/skills').IPCResult<string | null>>;
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

  // Mini Chat API
  miniChat: miniChatApi,
  onMiniChatShown,
  onMiniChatHidden,
  onSessionLoad,

  // Log viewer API
  logViewer: logViewerApi,

  // Cowork API
  cowork: coworkApi,

  // Tasks API
  tasks: tasksApi,

  // Projects API
  projects: projectsApi,

  // Compaction API
  compaction: compactionApi,

  // Context Budget API
  contextBudget: contextBudgetApi,

  // Shell API
  shell: shellApi,

  // Skills API
  skills: skillsApi,

  // Platform API
  platform: platformApi,

  // Anthropic OAuth API (legacy shim)
  anthropicOAuth: anthropicOAuthApi,

  // Generic Subscription OAuth API
  subscriptionOAuth: subscriptionOAuthApi,

  // Filesystem API
  fs: filesystemApi,
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
