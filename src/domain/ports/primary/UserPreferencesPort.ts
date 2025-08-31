import { Setting } from '../../entities/Setting';
import { SettingKey } from '../../value-objects/SettingKey';
import { SettingType } from '../../value-objects/SettingType';

// Input types for preferences
export interface UserPreferences {
  // UI Preferences
  theme: 'light' | 'dark' | 'auto';
  language: string;
  fontSize: number;
  fontFamily: string;
  sidebarWidth: number;
  chatLayout: 'default' | 'compact' | 'comfortable';
  showLineNumbers: boolean;
  showTimestamps: boolean;
  enableAnimations: boolean;
  
  // Chat Preferences
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  streamingEnabled: boolean;
  autoGenerateTitle: boolean;
  enableWebSearch: boolean;
  systemPrompt?: string;
  messageRetention: number; // days
  autoSave: boolean;
  
  // Privacy & Security
  encryptMessages: boolean;
  allowTelemetry: boolean;
  allowCrashReports: boolean;
  clearHistoryOnExit: boolean;
  requireConfirmation: boolean;
  sessionTimeout: number; // minutes
  
  // Notifications
  enableNotifications: boolean;
  soundEnabled: boolean;
  desktopNotifications: boolean;
  notificationVolume: number;
  
  // Advanced
  debugMode: boolean;
  experimentalFeatures: boolean;
  autoUpdate: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  
  // Custom settings (extensible)
  custom: Record<string, any>;
}

export interface PreferenceCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  order: number;
  settings: Setting[];
}

export interface PreferenceValidationRule {
  key: SettingKey;
  required: boolean;
  type: SettingType;
  min?: number;
  max?: number;
  pattern?: string;
  allowedValues?: any[];
  customValidator?: (value: any) => boolean | string;
}

export interface PreferenceUpdateResult {
  key: SettingKey;
  oldValue: any;
  newValue: any;
  success: boolean;
  error?: string;
  requiresRestart?: boolean;
  affectedSettings?: SettingKey[];
}

export interface SettingsExport {
  version: string;
  exportedAt: Date;
  userPreferences: UserPreferences;
  customSettings: Record<string, any>;
  metadata: {
    platform: string;
    appVersion: string;
    totalSettings: number;
  };
}

export interface SettingsImport {
  version?: string;
  userPreferences?: Partial<UserPreferences>;
  customSettings?: Record<string, any>;
  mergeStrategy?: 'replace' | 'merge' | 'selective';
  validateOnly?: boolean;
}

export interface PreferenceProfile {
  id: string;
  name: string;
  description?: string;
  preferences: UserPreferences;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Error types specific to preference operations
export abstract class UserPreferencesError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class PreferenceNotFoundError extends UserPreferencesError {
  constructor(key: string) {
    super(`Preference '${key}' not found`, 'PREFERENCE_NOT_FOUND', false);
  }
}

export class PreferenceValidationError extends UserPreferencesError {
  constructor(key: string, value: any, reason: string) {
    super(`Invalid value '${value}' for preference '${key}': ${reason}`, 'PREFERENCE_VALIDATION_ERROR', false);
  }
}

export class PreferenceReadOnlyError extends UserPreferencesError {
  constructor(key: string) {
    super(`Preference '${key}' is read-only and cannot be modified`, 'PREFERENCE_READ_ONLY', false);
  }
}

export class PreferenceImportError extends UserPreferencesError {
  constructor(reason: string) {
    super(`Failed to import preferences: ${reason}`, 'PREFERENCE_IMPORT_ERROR', true);
  }
}

export class PreferenceExportError extends UserPreferencesError {
  constructor(reason: string) {
    super(`Failed to export preferences: ${reason}`, 'PREFERENCE_EXPORT_ERROR', true);
  }
}

export class PreferenceProfileError extends UserPreferencesError {
  constructor(profileId: string, operation: string, reason: string) {
    super(`Failed to ${operation} profile '${profileId}': ${reason}`, 'PREFERENCE_PROFILE_ERROR', true);
  }
}

// Main port interface
export interface UserPreferencesPort {
  /**
   * Get all user preferences
   */
  getPreferences(): Promise<UserPreferences>;

  /**
   * Update multiple preferences at once
   */
  updatePreferences(preferences: Partial<UserPreferences>): Promise<UserPreferences>;

  /**
   * Update a single preference by key
   */
  updatePreference<T>(key: SettingKey, value: T): Promise<PreferenceUpdateResult>;

  /**
   * Get a specific preference value by key
   */
  getPreference<T>(key: SettingKey): Promise<T>;

  /**
   * Reset specific preferences to defaults
   */
  resetPreferences(keys?: SettingKey[]): Promise<UserPreferences>;

  /**
   * Reset all preferences to system defaults
   */
  resetAllPreferences(): Promise<UserPreferences>;

  /**
   * Get preference categories with their settings
   */
  getPreferenceCategories(): Promise<PreferenceCategory[]>;

  /**
   * Validate preference values before saving
   */
  validatePreferences(preferences: Partial<UserPreferences>): Promise<Map<SettingKey, string | boolean>>;

  /**
   * Export user settings to file/object
   */
  exportSettings(options?: { includeCustom?: boolean; format?: 'json' | 'yaml' }): Promise<SettingsExport>;

  /**
   * Import settings from file/object
   */
  importSettings(settings: SettingsImport): Promise<UserPreferences>;

  /**
   * Get default preference values
   */
  getDefaultPreferences(): Promise<UserPreferences>;

  /**
   * Check if preferences have been modified from defaults
   */
  hasModifiedPreferences(): Promise<boolean>;

  /**
   * Get list of modified preferences
   */
  getModifiedPreferences(): Promise<Array<{ key: SettingKey; defaultValue: any; currentValue: any }>>;

  /**
   * Watch for preference changes
   */
  watchPreference<T>(key: SettingKey, callback: (newValue: T, oldValue: T) => void): () => void;

  /**
   * Watch for any preference changes
   */
  watchAllPreferences(callback: (changes: Map<SettingKey, { oldValue: any; newValue: any }>) => void): () => void;

  /**
   * Create a new preference profile
   */
  createProfile(name: string, description?: string, preferences?: UserPreferences): Promise<PreferenceProfile>;

  /**
   * Load a preference profile
   */
  loadProfile(profileId: string): Promise<UserPreferences>;

  /**
   * Get all preference profiles
   */
  getProfiles(): Promise<PreferenceProfile[]>;

  /**
   * Update a preference profile
   */
  updateProfile(profileId: string, updates: Partial<PreferenceProfile>): Promise<PreferenceProfile>;

  /**
   * Delete a preference profile
   */
  deleteProfile(profileId: string): Promise<boolean>;

  /**
   * Set default preference profile
   */
  setDefaultProfile(profileId: string): Promise<void>;

  /**
   * Get app-specific system settings (read-only)
   */
  getSystemSettings(): Promise<Record<string, any>>;

  /**
   * Search preferences by key or description
   */
  searchPreferences(query: string): Promise<Setting[]>;
}

// Supporting types for preference operations
export interface PreferenceChangeEvent {
  key: SettingKey;
  oldValue: any;
  newValue: any;
  timestamp: Date;
  source: 'user' | 'import' | 'profile' | 'system';
}

export interface PreferenceMigration {
  fromVersion: string;
  toVersion: string;
  migrations: Array<{
    key: SettingKey;
    action: 'rename' | 'remove' | 'transform' | 'add';
    oldKey?: SettingKey;
    transformer?: (oldValue: any) => any;
    defaultValue?: any;
  }>;
}

// Events emitted by preference operations
export interface PreferenceEvent {
  type: PreferenceEventType;
  key?: SettingKey;
  profileId?: string;
  timestamp: Date;
  data?: any;
}

export type PreferenceEventType = 
  | 'preference_updated'
  | 'preferences_reset'
  | 'preferences_imported'
  | 'preferences_exported'
  | 'profile_created'
  | 'profile_loaded'
  | 'profile_updated'
  | 'profile_deleted'
  | 'validation_failed'
  | 'migration_applied';

// Configuration for preference management
export interface PreferenceManagementConfig {
  enableProfiles: boolean;
  maxProfiles: number;
  autoBackup: boolean;
  backupInterval: number; // minutes
  backupRetentionCount: number;
  enableValidation: boolean;
  strictValidation: boolean;
  allowCustomSettings: boolean;
  encryptSensitiveSettings: boolean;
  auditChanges: boolean;
  migrationEnabled: boolean;
}

// Validation and business rules
export interface PreferenceConstraints {
  ui: {
    minFontSize: number;
    maxFontSize: number;
    minSidebarWidth: number;
    maxSidebarWidth: number;
    allowedThemes: string[];
    supportedLanguages: string[];
  };
  chat: {
    minTemperature: number;
    maxTemperature: number;
    minMaxTokens: number;
    maxMaxTokens: number;
    minMessageRetention: number;
    maxMessageRetention: number;
    maxSystemPromptLength: number;
  };
  security: {
    minSessionTimeout: number;
    maxSessionTimeout: number;
    requiredConfirmationActions: string[];
  };
  notifications: {
    minVolume: number;
    maxVolume: number;
    supportedSounds: string[];
  };
  advanced: {
    allowedLogLevels: string[];
    maxCustomSettings: number;
    maxCustomSettingKeyLength: number;
    maxCustomSettingValueSize: number;
  };
}