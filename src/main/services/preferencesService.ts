import { BrowserWindow } from 'electron';
import { UIPreferences, PreferenceKey, DEFAULT_PREFERENCES, PreferenceChangeEvent } from '../../types/preferences';
import { getLogger } from './logging';

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
      this.store = new Store({
      name: 'ui-preferences',
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
        }
      }
    });

    this.initialized = true;
    this.logger.preferences.info("PreferencesService initialized", { storePath: this.store.path });
    } catch (error) {
      this.logger.preferences.error("Failed to initialize PreferencesService", { 
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.store) {
      throw new Error('PreferencesService not initialized. Call initialize() first.');
    }
  }

  get<K extends PreferenceKey>(key: K): UIPreferences[K] {
    this.ensureInitialized();
    const value = this.store.get(key);
    this.logger.preferences.debug("Retrieved preference", { key, value });
    return value;
  }

  set<K extends PreferenceKey>(key: K, value: UIPreferences[K]): void {
    this.ensureInitialized();
    const previousValue = this.store.get(key);
    
    this.logger.preferences.debug("Setting preference", {
      key,
      previousValue,
      newValue: value
    });
    
    this.store.set(key, value);
    
    // Broadcast change to all renderer processes
    const changeEvent: PreferenceChangeEvent<K> = {
      key,
      value,
      previousValue
    };

    const windows = BrowserWindow.getAllWindows();
    this.logger.preferences.debug("Broadcasting preference change", { 
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

  getAll(): UIPreferences {
    this.ensureInitialized();
    const preferences = this.store.store;
    this.logger.preferences.debug("Retrieved all preferences", { count: Object.keys(preferences).length });
    return preferences;
  }

  reset(): void {
    this.ensureInitialized();
    this.logger.preferences.info("Resetting all preferences to defaults");
    this.store.clear();
    
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

  has(key: PreferenceKey): boolean {
    this.ensureInitialized();
    return this.store.has(key);
  }

  delete(key: PreferenceKey): void {
    this.ensureInitialized();
    this.logger.preferences.debug("Deleting preference", { key });
    this.store.delete(key);
  }

  // Export preferences to JSON
  export(): UIPreferences {
    this.ensureInitialized();
    this.logger.preferences.debug("Exporting preferences");
    return this.store.store;
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
        this.store.set(key as PreferenceKey, value);
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
}

// Singleton instance
export const preferencesService = new PreferencesService();