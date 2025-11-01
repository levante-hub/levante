import type { ProviderConfig } from './models';

/**
 * OAuth token data for MCP servers
 * Stored in ui-preferences.json with optional encryption
 * (controlled by security.encryptApiKeys toggle)
 */
export interface OAuthTokenData {
  access_token: string;
  refresh_token?: string;
  expires_at?: number; // Unix timestamp (ms)
  scope?: string;
  token_type: string; // Usually "Bearer"
  /**
   * OAuth metadata for token refresh and revocation
   * Stored alongside tokens to enable automatic refresh without re-discovery
   */
  metadata?: {
    token_endpoint: string;
    revocation_endpoint?: string;
  };
}

export interface UIPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  windowBounds: {
    width: number;
    height: number;
    x?: number;
    y?: number;
  };
  sidebarCollapsed: boolean;
  lastUsedModel: string;
  chatInputHeight: number;
  fontSize: 'small' | 'medium' | 'large';
  codeTheme: 'light' | 'dark' | 'auto';
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
  };
  hasAcceptedFreeModelWarning?: boolean;
  security: {
    encryptApiKeys: boolean;
  };

  /**
   * OAuth tokens for MCP servers
   * Key: serverId (e.g., "figma", "github-mcp")
   * Value: OAuth token data (access_token and refresh_token are encrypted when security.encryptApiKeys is enabled)
   */
  mcpOAuthTokens?: Record<string, OAuthTokenData>;
}

export type PreferenceKey = keyof UIPreferences;

export interface PreferenceChangeEvent<K extends PreferenceKey = PreferenceKey> {
  key: K;
  value: UIPreferences[K];
  previousValue?: UIPreferences[K];
}

export const DEFAULT_PREFERENCES: UIPreferences = {
  theme: 'system',
  language: 'en',
  windowBounds: {
    width: 1200,
    height: 800
  },
  sidebarCollapsed: false,
  lastUsedModel: 'openai/gpt-4',
  chatInputHeight: 120,
  fontSize: 'medium',
  codeTheme: 'auto',
  showLineNumbers: true,
  wordWrap: true,
  autoSave: true,
  notifications: {
    showDesktop: true,
    showInApp: true,
    soundEnabled: false
  },
  shortcuts: {
    newChat: 'Cmd+N',
    toggleSidebar: 'Cmd+B',
    search: 'Cmd+F'
  },
  providers: [],
  activeProvider: null,
  ai: {
    baseSteps: 5,
    maxSteps: 20
  },
  hasAcceptedFreeModelWarning: false,
  security: {
    encryptApiKeys: false
  },
  mcpOAuthTokens: {}
};