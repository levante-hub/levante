import type { ProviderConfig } from "./models";
import type { ReasoningConfig } from "./reasoning";
import { DEFAULT_REASONING_CONFIG } from "./reasoning";

export interface MCPPreferences {
  /** MCP SDK selection */
  sdk: "mcp-use" | "official-sdk";
  /** Code mode defaults (only applies to mcp-use) */
  codeModeDefaults?: {
    enabled: boolean;
    executor: "vm" | "e2b";
    vmTimeout: number;
    vmMemoryLimit: number;
  };
  /** E2B API key (encrypted, optional) */
  e2bApiKey?: string;
  /** Cache of tools per server (for showing in UI without reconnecting) */
  toolsCache?: {
    [serverId: string]: {
      tools: Array<{
        name: string;
        description?: string;
        inputSchema?: any;
      }>;
      lastUpdated: number;
    };
  };
  /** Tools disabled by server (the ones NOT included) */
  disabledTools?: {
    [serverId: string]: string[];
  };
}

export interface UIPreferences {
  theme: "light" | "dark" | "system";
  language: string;
  /** IANA timezone identifier (e.g., 'Europe/Madrid', 'America/New_York') or 'auto' for system */
  timezone: string;
  windowBounds: {
    width: number;
    height: number;
    x?: number;
    y?: number;
  };
  sidebarCollapsed: boolean;
  lastUsedModel: string;
  chatInputHeight: number;
  fontSize: "small" | "medium" | "large";
  codeTheme: "light" | "dark" | "auto";
  showLineNumbers: boolean;
  wordWrap: boolean;
  autoSave: boolean;
  notifications: {
    showDesktop: boolean;
    showInApp: boolean;
    soundEnabled: boolean;
  };
  shortcuts: {
    newChat: string;
    toggleSidebar: string;
    search: string;
  };
  providers: ProviderConfig[];
  activeProvider: string | null;
  ai: {
    baseSteps: number;
    maxSteps: number;
    mermaidValidation: boolean;
    /** Enable MCP discovery tool for AI to search available servers */
    mcpDiscovery: boolean;
    /** Reasoning model configuration */
    reasoningText?: ReasoningConfig;
  };
  hasAcceptedFreeModelWarning?: boolean;
  developerMode: boolean;
  security: {
    encryptApiKeys: boolean;
  };
  runtime: {
    preferSystemRuntimes: boolean;
  };
  /** MCP configuration */
  mcp?: MCPPreferences;
  /** Enable MCP tools in chat */
  enableMCP: boolean;
}

export type PreferenceKey = keyof UIPreferences;

export interface PreferenceChangeEvent<
  K extends PreferenceKey = PreferenceKey,
> {
  key: K;
  value: UIPreferences[K];
  previousValue?: UIPreferences[K];
}

export const DEFAULT_MCP_PREFERENCES: MCPPreferences = {
  sdk: "mcp-use", // Default to mcp-use
  codeModeDefaults: {
    enabled: true, // Disabled by default - can be enabled per-server or globally
    executor: "vm",
    vmTimeout: 30000, // 30 seconds
    vmMemoryLimit: 134217728, // 128MB in bytes
  },
};

export const DEFAULT_PREFERENCES: UIPreferences = {
  theme: "system",
  language: "en",
  timezone: "auto",
  windowBounds: {
    width: 1200,
    height: 800,
  },
  sidebarCollapsed: false,
  lastUsedModel: "openai/gpt-4",
  chatInputHeight: 120,
  fontSize: "medium",
  codeTheme: "auto",
  showLineNumbers: true,
  wordWrap: true,
  autoSave: true,
  notifications: {
    showDesktop: true,
    showInApp: true,
    soundEnabled: false,
  },
  shortcuts: {
    newChat: "Cmd+N",
    toggleSidebar: "Cmd+B",
    search: "Cmd+F",
  },
  providers: [],
  activeProvider: null,
  ai: {
    baseSteps: 5,
    maxSteps: 20,
    mermaidValidation: true,
    mcpDiscovery: true,
    reasoningText: DEFAULT_REASONING_CONFIG,
  },
  hasAcceptedFreeModelWarning: false,
  developerMode: false,
  security: {
    encryptApiKeys: false,
  },
  runtime: {
    preferSystemRuntimes: false,
  },
  mcp: DEFAULT_MCP_PREFERENCES,
  enableMCP: true
};
