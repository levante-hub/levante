import type { ProviderConfig } from './models';

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
  hasAcceptedFreeModelWarning: false
};