import { BrowserWindow } from 'electron';
import { UIPreferences, PreferenceKey, DEFAULT_PREFERENCES, PreferenceChangeEvent } from '../../types/preferences';
import { getLogger } from './logging';
import { directoryService } from './directoryService';
import { encryptProvidersApiKeys, decryptProvidersApiKeys } from '../utils/encryption';
import type { UIPreferencesWithOAuth } from './oauth/types';

export class PreferencesService {
  private logger = getLogger();
  private store: any;
  private initialized = false;

  constructor() {
    // Store will be initialized asynchronously
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const Store = (await import('electron-store')).default;

      // Ensure ~/levante directory exists
      await directoryService.ensureBaseDir();

      this.store = new Store({
        name: 'ui-preferences',
        cwd: directoryService.getBaseDir(), // Store preferences in ~/levante/ directory
        // No encryption key - we'll encrypt specific values manually
        defaults: DEFAULT_PREFERENCES,
        schema: {
          theme: {
            type: 'string',
            enum: ['light', 'dark', 'system'],
            default: 'system'
          },
          language: {
            type: 'string',
            default: 'en'
          },
          timezone: {
            type: 'string',
            default: 'auto'
          },
          windowBounds: {
            type: 'object',
            properties: {
              width: { type: 'number', minimum: 800, default: 1200 },
              height: { type: 'number', minimum: 600, default: 800 },
              x: { type: 'number' },
              y: { type: 'number' }
            },
            required: ['width', 'height'],
            default: { width: 1200, height: 800 }
          },
          sidebarCollapsed: {
            type: 'boolean',
            default: false
          },
          lastUsedModel: {
            type: 'string',
            default: 'openai/gpt-4'
          },
          chatInputHeight: {
            type: 'number',
            minimum: 60,
            maximum: 400,
            default: 120
          },
          fontSize: {
            type: 'string',
            enum: ['small', 'medium', 'large'],
            default: 'medium'
          },
          codeTheme: {
            type: 'string',
            enum: ['light', 'dark', 'auto'],
            default: 'auto'
          },
          showLineNumbers: {
            type: 'boolean',
            default: true
          },
          wordWrap: {
            type: 'boolean',
            default: true
          },
          autoSave: {
            type: 'boolean',
            default: true
          },
          notifications: {
            type: 'object',
            properties: {
              showDesktop: { type: 'boolean', default: true },
              showInApp: { type: 'boolean', default: true },
              soundEnabled: { type: 'boolean', default: false }
            },
            required: ['showDesktop', 'showInApp', 'soundEnabled'],
            default: { showDesktop: true, showInApp: true, soundEnabled: false }
          },
          shortcuts: {
            type: 'object',
            properties: {
              newChat: { type: 'string', default: 'Cmd+N' },
              toggleSidebar: { type: 'string', default: 'Cmd+B' },
              search: { type: 'string', default: 'Cmd+F' }
            },
            required: ['newChat', 'toggleSidebar', 'search'],
            default: { newChat: 'Cmd+N', toggleSidebar: 'Cmd+B', search: 'Cmd+F' }
          },
          providers: {
            type: 'array',
            default: []
          },
          activeProvider: {
            type: ['string', 'null'],
            default: null
          },
          ai: {
            type: 'object',
            properties: {
              baseSteps: { type: 'number', minimum: 1, default: 5 },
              maxSteps: { type: 'number', minimum: 1, default: 20 },
              mermaidValidation: { type: 'boolean', default: true }
            },
            required: ['baseSteps', 'maxSteps', 'mermaidValidation'],
            default: { baseSteps: 5, maxSteps: 20, mermaidValidation: true }
          },
          hasAcceptedFreeModelWarning: {
            type: 'boolean',
            default: false
          },
          developerMode: {
            type: 'boolean',
            default: false
          },
          runtime: {
            type: 'object',
            properties: {
              preferSystemRuntimes: { type: 'boolean', default: false }
            },
            required: ['preferSystemRuntimes'],
            default: { preferSystemRuntimes: false }
          },
          mcp: {
            type: 'object',
            properties: {
              sdk: { type: 'string', enum: ['mcp-use', 'official-sdk'], default: 'mcp-use' },
              codeModeDefaults: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean', default: true },
                  executor: { type: 'string', enum: ['vm', 'e2b'], default: 'vm' },
                  vmTimeout: { type: 'number', default: 30000 },
                  vmMemoryLimit: { type: 'number', default: 134217728 }
                },
                required: ['enabled', 'executor', 'vmTimeout', 'vmMemoryLimit'],
                default: {
                  enabled: true,
                  executor: 'vm',
                  vmTimeout: 30000,
                  vmMemoryLimit: 134217728
                }
              },
              e2bApiKey: { type: 'string' },
              /** Cache de tools por servidor (para mostrar en UI sin reconectar) */
              toolsCache: {
                type: 'object',
                default: {}
              },
              /** Tools deshabilitadas por servidor (las que NO se incluyen) */
              disabledTools: {
                type: 'object',
                default: {}
              }
            },
            required: ['sdk', 'codeModeDefaults'],
            default: {
              sdk: 'mcp-use',
              codeModeDefaults: {
                enabled: true,
                executor: 'vm',
                vmTimeout: 30000,
                vmMemoryLimit: 134217728
              },
              toolsCache: {},
              disabledTools: {}
            }
          },
          security: {
            type: 'object',
            properties: {
              encryptApiKeys: { type: 'boolean', default: false }
            },
            required: ['encryptApiKeys'],
            default: { encryptApiKeys: false }
          },
          enableMCP: {
            type: 'boolean',
            default: true
          }
        }
      });
      // Ensure oauthTokens exists
      const current = this.store.store;
      if (!current.oauthTokens) {
        this.store.set('oauthTokens', {});
      }
      this.initialized = true;
      this.logger.preferences.info("PreferencesService initialized", { storePath: this.store.path });
    } catch (error) {
      this.logger.preferences.error("Failed to initialize PreferencesService", {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.store) {
      throw new Error('PreferencesService not initialized. Call initialize() first.');
    }
  }

  get<T = any>(key: string): T | undefined {
    this.ensureInitialized();
    let value = this.store.get(key);

    // Check if encryption is enabled
    const securitySettings = this.store.get('security') || { encryptApiKeys: false };
    const shouldEncrypt = securitySettings.encryptApiKeys;

    // Decrypt providers' API keys when reading (only if encryption is enabled)
    if (key === 'providers' && Array.isArray(value) && shouldEncrypt) {
      value = decryptProvidersApiKeys(value);
    }

    // Use models category for provider/model related preferences
    const isModelRelated = key === 'providers' || key === 'activeProvider';
    const logger = isModelRelated ? this.logger.models : this.logger.preferences;

    // Don't log tokens or sensitive data
    const isSensitive = key.startsWith('oauthTokens') || key === 'providers';

    logger.debug("Retrieved preference", {
      key,
      value: isSensitive ? '***' : (isModelRelated ? this.summarizeModelData(value) : value)
    });

    return value as T;
  }

  set(key: string, value: any): void {
    this.ensureInitialized();
    const previousValue = this.store.get(key);

    // Check if encryption is enabled
    const securitySettings = this.store.get('security') || { encryptApiKeys: false };
    const shouldEncrypt = securitySettings.encryptApiKeys;

    // Handle security settings change - convert existing API keys
    if (key === 'security') {
      const newSecuritySettings = value as any;
      const previousSecuritySettings = previousValue as any || { encryptApiKeys: false };

      // If encryption setting changed, convert all existing API keys
      if (newSecuritySettings.encryptApiKeys !== previousSecuritySettings.encryptApiKeys) {
        const providers = this.store.get('providers') as any[];
        if (Array.isArray(providers) && providers.length > 0) {
          let updatedProviders: any[];

          if (newSecuritySettings.encryptApiKeys) {
            // Enabling encryption: encrypt plaintext keys
            this.logger.preferences.info('Enabling API key encryption');
            updatedProviders = encryptProvidersApiKeys(providers);
          } else {
            // Disabling encryption: decrypt encrypted keys
            this.logger.preferences.info('Disabling API key encryption');
            updatedProviders = decryptProvidersApiKeys(providers);
          }

          // Store the converted providers
          this.store.set('providers', updatedProviders);
        }
      }
    }

    // Encrypt providers' API keys before storing (only if encryption is enabled)
    let valueToStore = value;
    if (key === 'providers' && Array.isArray(value) && shouldEncrypt) {
      valueToStore = encryptProvidersApiKeys(value) as any;
    }

    // Use models category for provider/model related preferences
    const isModelRelated = key === 'providers' || key === 'activeProvider';
    const logger = isModelRelated ? this.logger.models : this.logger.preferences;

    // Don't log tokens or sensitive data
    const isSensitive = key.startsWith('oauthTokens') || key === 'providers' || key === 'security';

    logger.debug("Setting preference", {
      key,
      previousValue: isSensitive ? '***' : (isModelRelated ? this.summarizeModelData(previousValue) : previousValue),
      newValue: isSensitive ? '***' : (isModelRelated ? this.summarizeModelData(value) : value)
    });

    this.store.set(key, valueToStore);

    // Broadcast change to all renderer processes
    const changeEvent: PreferenceChangeEvent<any> = {
      key: key as any,
      value: value,
      previousValue: previousValue
    };

    const windows = BrowserWindow.getAllWindows();
    logger.debug("Broadcasting preference change", {
      key,
      windowCount: windows.length
    });

    windows.forEach(window => {
      if (window && !window.isDestroyed()) {
        try {
          window.webContents.send('levante/preferences/changed', changeEvent);
        } catch (error) {
          this.logger.preferences.error("Failed to broadcast to window", {
            error: error instanceof Error ? error.message : error
          });
        }
      }
    });
  }

  getAll(): UIPreferencesWithOAuth {
    this.ensureInitialized();
    const preferences = { ...this.store.store };

    // Check if encryption is enabled
    const securitySettings = preferences.security || { encryptApiKeys: false };
    const shouldEncrypt = securitySettings.encryptApiKeys;

    // Decrypt providers' API keys (only if encryption is enabled)
    if (Array.isArray(preferences.providers) && shouldEncrypt) {
      preferences.providers = decryptProvidersApiKeys(preferences.providers);
    }

    // Ensure oauthTokens exists in the returned object
    return {
      ...preferences,
      oauthTokens: preferences.oauthTokens || {},
    } as UIPreferencesWithOAuth;
  }

  reset(): void {
    this.ensureInitialized();
    this.logger.preferences.info("Resetting all preferences to defaults");
    this.store.clear();
    // Ensure oauthTokens exists after reset
    this.store.set('oauthTokens', {});
    // Broadcast reset event
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      if (window && !window.isDestroyed()) {
        try {
          window.webContents.send('levante/preferences/reset', DEFAULT_PREFERENCES);
        } catch (error) {
          this.logger.preferences.error("Failed to broadcast reset to window", {
            error: error instanceof Error ? error.message : error
          });
        }
      }
    });
  }

  has(key: string): boolean {
    this.ensureInitialized();
    return this.store.has(key);
  }

  delete(key: string): void {
    this.ensureInitialized();
    this.logger.preferences.debug("Deleting preference", { key });
    this.store.delete(key);
  }

  // Export preferences to JSON
  export(): UIPreferences {
    this.ensureInitialized();
    this.logger.preferences.debug("Exporting preferences");

    // Use getAll() to ensure decryption
    return this.getAll();
  }

  // Import preferences from JSON
  import(preferences: Partial<UIPreferences>): void {
    this.ensureInitialized();
    this.logger.preferences.debug("Importing preferences", {
      keys: Object.keys(preferences),
      count: Object.keys(preferences).length
    });

    // Validate and merge with existing preferences
    Object.entries(preferences).forEach(([key, value]) => {
      if (key in DEFAULT_PREFERENCES && value !== undefined) {
        // Use set() method to ensure encryption is applied
        this.set(key as PreferenceKey, value as any);
      }
    });
  }

  // Get store file path for debugging
  getStorePath(): string {
    this.ensureInitialized();
    return this.store.path;
  }

  // Get store size
  getStoreSize(): number {
    this.ensureInitialized();
    return this.store.size;
  }

  // Helper method to summarize model data for logging
  private summarizeModelData(value: any): any {
    // If it's providers data, summarize for logging
    if (Array.isArray(value) && value.length > 0 && value[0]?.models) {
      return value.map(provider => ({
        id: provider.id,
        name: provider.name,
        type: provider.type,
        isActive: provider.isActive,
        modelCount: Array.isArray(provider.models) ? provider.models.length : 0,
        selectedModels: Array.isArray(provider.models)
          ? provider.models.filter((m: any) => m.isSelected).length
          : 0
      }));
    }

    // For other model-related data, return as-is (it's probably short)
    return value;
  }
}

// Singleton instance
export const preferencesService = new PreferencesService();
