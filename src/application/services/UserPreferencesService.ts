import { UserPreferencesPort, UserPreferences, PreferenceCategory, PreferenceUpdateResult, SettingsExport, SettingsImport, PreferenceProfile, PreferenceNotFoundError, PreferenceValidationError, PreferenceReadOnlyError, PreferenceImportError, PreferenceExportError, PreferenceProfileError } from '../../domain/ports/primary/UserPreferencesPort';
import { Setting } from '../../domain/entities/Setting';
import { SettingKey } from '../../domain/value-objects/SettingKey';
import { SettingRepository } from '../../domain/ports/secondary/SettingRepository';

export class UserPreferencesService implements UserPreferencesPort {
  private watchCallbacks = new Map<string, Array<(newValue: any, oldValue: any) => void>>();
  private globalWatchCallbacks: Array<(changes: Map<SettingKey, { oldValue: any; newValue: any }>) => void> = [];
  
  constructor(
    private readonly settingRepository: SettingRepository
  ) {}

  async getPreferences(): Promise<UserPreferences> {
    const result = await this.settingRepository.findAll();
    const settings = result.success && result.data ? result.data : [];
    
    return this.settingsToPreferences(settings);
  }

  async updatePreferences(preferences: Partial<UserPreferences>): Promise<UserPreferences> {
    const changes = new Map<SettingKey, { oldValue: any; newValue: any }>();
    
    for (const [key, value] of Object.entries(preferences)) {
      if (value !== undefined) {
        try {
          const settingKey = new SettingKey(`ui.${key}`);
          const oldSettingResult = await this.settingRepository.findByKey(settingKey.toString());
          const oldSetting = oldSettingResult.success ? oldSettingResult.data : null;
          const oldValue = oldSetting?.toString();
          
          const result = await this.updatePreference(settingKey, value);
          
          if (result.success) {
            changes.set(settingKey, { oldValue, newValue: value });
          }
        } catch (error) {
          console.error(`Failed to update preference ${key}:`, error);
        }
      }
    }

    // Notify watchers
    this.notifyWatchers(changes);

    return await this.getPreferences();
  }

  async updatePreference<T>(key: SettingKey, value: T): Promise<PreferenceUpdateResult> {
    try {
      // Get existing setting if it exists
      const keyResult = await this.settingRepository.findByKey(key.toString());
      const existingSetting = keyResult.success ? keyResult.data : null;
      const oldValue = existingSetting?.toString();

      // Validate the new value
      const validationResult = await this.validatePreferenceValue(key, value);
      if (typeof validationResult === 'string') {
        throw new PreferenceValidationError(key.toString(), value, validationResult);
      }

      // Check if setting is read-only
      if (existingSetting?.isReadOnly()) {
        throw new PreferenceReadOnlyError(key.toString());
      }

      let setting: Setting;
      if (existingSetting) {
        // Update existing setting
        existingSetting.setValue(value);
        const saveResult = await this.settingRepository.save(existingSetting);
        setting = saveResult.success && saveResult.data ? saveResult.data : existingSetting;
      } else {
        // Create new setting
        setting = Setting.create(
          key,
          this.inferSettingType(value),
          value
        );
        const saveResult = await this.settingRepository.save(setting);
        setting = saveResult.success && saveResult.data ? saveResult.data : setting;
      }

      // Notify individual watchers
      const keyStr = key.toString();
      if (this.watchCallbacks.has(keyStr)) {
        const callbacks = this.watchCallbacks.get(keyStr)!;
        callbacks.forEach(callback => {
          try {
            callback(value, oldValue);
          } catch (error) {
            console.error('Error in preference watch callback:', error);
          }
        });
      }

      return {
        key,
        oldValue,
        newValue: value,
        success: true,
        requiresRestart: this.requiresRestart(key),
        affectedSettings: this.getAffectedSettings(key)
      };

    } catch (error) {
      return {
        key,
        oldValue: undefined,
        newValue: value,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getPreference<T>(key: SettingKey): Promise<T> {
    const result = await this.settingRepository.findByKey(key.toString());
    const setting = result.success ? result.data : null;
    if (!setting) {
      throw new PreferenceNotFoundError(key.toString());
    }
    return setting.toString() as T;
  }

  async resetPreferences(keys?: SettingKey[]): Promise<UserPreferences> {
    if (keys) {
      // Reset specific preferences
      for (const key of keys) {
        const settingResult = await this.settingRepository.findByKey(key.toString());
        if (settingResult.success && settingResult.data) {
          const setting = settingResult.data;
          setting.resetToDefault();
          await this.settingRepository.save(setting);
        }
      }
    } else {
      // Reset all preferences
      const settingsResult = await this.settingRepository.findAll();
      const settings = settingsResult.success && settingsResult.data ? settingsResult.data : [];
      for (const setting of settings) {
        setting.resetToDefault();
        await this.settingRepository.save(setting);
      }
    }

    return await this.getPreferences();
  }

  async resetAllPreferences(): Promise<UserPreferences> {
    return await this.resetPreferences();
  }

  async getPreferenceCategories(): Promise<PreferenceCategory[]> {
    const settingsResult = await this.settingRepository.findAll();
    const settings = settingsResult.success && settingsResult.data ? settingsResult.data : [];
    const categoriesMap = new Map<string, Setting[]>();

    // Group settings by namespace
    for (const setting of settings) {
      const namespace = setting.key.getNamespace();
      if (!categoriesMap.has(namespace)) {
        categoriesMap.set(namespace, []);
      }
      categoriesMap.get(namespace)!.push(setting);
    }

    // Convert to preference categories
    const categories: PreferenceCategory[] = [];
    let order = 0;

    Array.from(categoriesMap.entries()).forEach(([namespace, settings]) => {
      categories.push({
        id: namespace,
        name: this.formatCategoryName(namespace),
        description: this.getCategoryDescription(namespace),
        icon: this.getCategoryIcon(namespace),
        order: order++,
        settings
      });
    });

    return categories.sort((a, b) => a.order - b.order);
  }

  async validatePreferences(preferences: Partial<UserPreferences>): Promise<Map<SettingKey, string | boolean>> {
    const results = new Map<SettingKey, string | boolean>();

    for (const [key, value] of Object.entries(preferences)) {
      if (value !== undefined) {
        try {
          const settingKey = new SettingKey(`ui.${key}`);
          const validationResult = await this.validatePreferenceValue(settingKey, value);
          results.set(settingKey, validationResult);
        } catch (error) {
          results.set(
            new SettingKey(`ui.${key}`), 
            error instanceof Error ? error.message : 'Validation error'
          );
        }
      }
    }

    return results;
  }

  async exportSettings(options?: { includeCustom?: boolean; format?: 'json' | 'yaml' }): Promise<SettingsExport> {
    try {
      const preferences = await this.getPreferences();
      const customSettings = options?.includeCustom ? await this.getCustomSettings() : {};

      return {
        version: '1.0',
        exportedAt: new Date(),
        userPreferences: preferences,
        customSettings,
        metadata: {
          platform: process.platform,
          appVersion: '1.0.0', // Would get from app metadata
          totalSettings: Object.keys(preferences).length + Object.keys(customSettings).length
        }
      };
    } catch (error) {
      throw new PreferenceExportError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async importSettings(settings: SettingsImport): Promise<UserPreferences> {
    try {
      if (settings.validateOnly) {
        // Just validate without importing
        if (settings.userPreferences) {
          await this.validatePreferences(settings.userPreferences);
        }
        return await this.getPreferences();
      }

      if (settings.userPreferences) {
        switch (settings.mergeStrategy) {
          case 'replace':
            // Reset all first, then apply new settings
            await this.resetAllPreferences();
            await this.updatePreferences(settings.userPreferences);
            break;
          case 'merge':
            // Just update provided preferences
            await this.updatePreferences(settings.userPreferences);
            break;
          case 'selective':
            // Would need UI to select which preferences to import
            // For now, fall back to merge
            await this.updatePreferences(settings.userPreferences);
            break;
        }
      }

      if (settings.customSettings) {
        await this.importCustomSettings(settings.customSettings);
      }

      return await this.getPreferences();
    } catch (error) {
      throw new PreferenceImportError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async getDefaultPreferences(): Promise<UserPreferences> {
    return {
      // UI Preferences
      theme: 'auto',
      language: 'en',
      fontSize: 14,
      fontFamily: 'system-ui',
      sidebarWidth: 300,
      chatLayout: 'default',
      showLineNumbers: true,
      showTimestamps: true,
      enableAnimations: true,
      
      // Chat Preferences
      defaultModel: '',
      temperature: 0.7,
      maxTokens: 4000,
      streamingEnabled: true,
      autoGenerateTitle: true,
      enableWebSearch: false,
      messageRetention: 365,
      autoSave: true,
      
      // Privacy & Security
      encryptMessages: true,
      allowTelemetry: false,
      allowCrashReports: true,
      clearHistoryOnExit: false,
      requireConfirmation: true,
      sessionTimeout: 30,
      
      // Notifications
      enableNotifications: true,
      soundEnabled: true,
      desktopNotifications: false,
      notificationVolume: 0.5,
      
      // Advanced
      debugMode: false,
      experimentalFeatures: false,
      autoUpdate: true,
      logLevel: 'info',
      
      // Custom settings
      custom: {}
    };
  }

  async hasModifiedPreferences(): Promise<boolean> {
    const current = await this.getPreferences();
    const defaults = await this.getDefaultPreferences();
    
    return JSON.stringify(current) !== JSON.stringify(defaults);
  }

  async getModifiedPreferences(): Promise<Array<{ key: SettingKey; defaultValue: any; currentValue: any }>> {
    const current = await this.getPreferences();
    const defaults = await this.getDefaultPreferences();
    const modified: Array<{ key: SettingKey; defaultValue: any; currentValue: any }> = [];

    for (const [key, currentValue] of Object.entries(current)) {
      const defaultValue = (defaults as any)[key];
      if (JSON.stringify(currentValue) !== JSON.stringify(defaultValue)) {
        modified.push({
          key: new SettingKey(`ui.${key}`),
          defaultValue,
          currentValue
        });
      }
    }

    return modified;
  }

  watchPreference<T>(key: SettingKey, callback: (newValue: T, oldValue: T) => void): () => void {
    const keyStr = key.toString();
    
    if (!this.watchCallbacks.has(keyStr)) {
      this.watchCallbacks.set(keyStr, []);
    }
    
    this.watchCallbacks.get(keyStr)!.push(callback);

    // Return unwatch function
    return () => {
      const callbacks = this.watchCallbacks.get(keyStr);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
        if (callbacks.length === 0) {
          this.watchCallbacks.delete(keyStr);
        }
      }
    };
  }

  watchAllPreferences(callback: (changes: Map<SettingKey, { oldValue: any; newValue: any }>) => void): () => void {
    this.globalWatchCallbacks.push(callback);

    return () => {
      const index = this.globalWatchCallbacks.indexOf(callback);
      if (index > -1) {
        this.globalWatchCallbacks.splice(index, 1);
      }
    };
  }

  async createProfile(name: string, description?: string, preferences?: UserPreferences): Promise<PreferenceProfile> {
    const profile: PreferenceProfile = {
      id: `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      preferences: preferences || await this.getPreferences(),
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Save profile (would use a ProfileRepository in real implementation)
    await this.saveProfile(profile);
    
    return profile;
  }

  async loadProfile(profileId: string): Promise<UserPreferences> {
    const profile = await this.getProfile(profileId);
    if (!profile) {
      throw new PreferenceProfileError(profileId, 'load', 'Profile not found');
    }

    await this.updatePreferences(profile.preferences);
    return profile.preferences;
  }

  async getProfiles(): Promise<PreferenceProfile[]> {
    // Would load from storage in real implementation
    return [];
  }

  async updateProfile(profileId: string, updates: Partial<PreferenceProfile>): Promise<PreferenceProfile> {
    const profile = await this.getProfile(profileId);
    if (!profile) {
      throw new PreferenceProfileError(profileId, 'update', 'Profile not found');
    }

    const updatedProfile = { ...profile, ...updates, updatedAt: new Date() };
    await this.saveProfile(updatedProfile);
    
    return updatedProfile;
  }

  async deleteProfile(profileId: string): Promise<boolean> {
    const profile = await this.getProfile(profileId);
    if (!profile) {
      return false;
    }

    // Would delete from storage in real implementation
    return true;
  }

  async setDefaultProfile(profileId: string): Promise<void> {
    const profiles = await this.getProfiles();
    
    for (const profile of profiles) {
      profile.isDefault = profile.id === profileId;
      await this.saveProfile(profile);
    }
  }

  async getSystemSettings(): Promise<Record<string, any>> {
    const settingsResult = await this.settingRepository.findByNamespace('system');
    const settings = settingsResult.success && settingsResult.data ? settingsResult.data.items : [];
    const systemSettings: Record<string, any> = {};

    for (const setting of settings) {
      systemSettings[setting.key.toString()] = setting.toString();
    }

    return systemSettings;
  }

  async searchPreferences(query: string): Promise<Setting[]> {
    const searchResult = await this.settingRepository.search(query);
    return searchResult.success && searchResult.data ? searchResult.data.items : [];
  }

  // Private helper methods
  private settingsToPreferences(settings: Setting[]): UserPreferences {
    const preferences: any = {
      // Default values
      theme: 'auto',
      language: 'en',
      fontSize: 14,
      fontFamily: 'system-ui',
      sidebarWidth: 300,
      chatLayout: 'default',
      showLineNumbers: true,
      showTimestamps: true,
      enableAnimations: true,
      defaultModel: '',
      temperature: 0.7,
      maxTokens: 4000,
      streamingEnabled: true,
      autoGenerateTitle: true,
      enableWebSearch: false,
      messageRetention: 365,
      autoSave: true,
      encryptMessages: true,
      allowTelemetry: false,
      allowCrashReports: true,
      clearHistoryOnExit: false,
      requireConfirmation: true,
      sessionTimeout: 30,
      enableNotifications: true,
      soundEnabled: true,
      desktopNotifications: false,
      notificationVolume: 0.5,
      debugMode: false,
      experimentalFeatures: false,
      autoUpdate: true,
      logLevel: 'info',
      custom: {}
    };

    // Override with actual settings
    for (const setting of settings) {
      const key = setting.key.toString();
      preferences[key] = setting.toString();
    }

    return preferences as UserPreferences;
  }

  private async validatePreferenceValue(key: SettingKey, value: any): Promise<boolean | string> {
    // Basic validation rules
    const keyStr = key.toString();
    
    switch (keyStr) {
      case 'fontSize':
        if (typeof value !== 'number' || value < 10 || value > 24) {
          return 'Font size must be between 10 and 24';
        }
        break;
      case 'temperature':
        if (typeof value !== 'number' || value < 0 || value > 2) {
          return 'Temperature must be between 0 and 2';
        }
        break;
      case 'maxTokens':
        if (typeof value !== 'number' || value < 100 || value > 100000) {
          return 'Max tokens must be between 100 and 100000';
        }
        break;
      case 'theme':
        if (!['light', 'dark', 'auto'].includes(value)) {
          return 'Theme must be light, dark, or auto';
        }
        break;
    }

    return true;
  }

  private inferSettingType(value: any): any {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') return 'string';
    return 'json';
  }

  private getSettingDescription(key: SettingKey): string {
    const descriptions: Record<string, string> = {
      'ui.theme': 'Application color theme',
      'ui.fontSize': 'Font size for the interface',
      'chat.temperature': 'Randomness in AI responses (0-2)',
      'chat.maxTokens': 'Maximum tokens for AI responses',
      // Add more descriptions as needed
    };
    
    return descriptions[key.toString()] || 'User preference setting';
  }

  private requiresRestart(key: SettingKey): boolean {
    const restartRequired = ['debugMode', 'logLevel', 'language'];
    return restartRequired.includes(key.toString());
  }

  private getAffectedSettings(key: SettingKey): SettingKey[] {
    // Define settings that affect other settings
    const affectedMap: Record<string, string[]> = {
      'theme': ['ui.enableAnimations'],
      'experimentalFeatures': ['chat.enableWebSearch']
    };

    const affected = affectedMap[key.toString()] || [];
    return affected.map(k => new SettingKey(k));
  }

  private formatCategoryName(namespace: string): string {
    return namespace.charAt(0).toUpperCase() + namespace.slice(1).replace(/([A-Z])/g, ' $1');
  }

  private getCategoryDescription(namespace: string): string {
    const descriptions: Record<string, string> = {
      'ui': 'Interface and visual preferences',
      'chat': 'Chat and AI model settings',
      'privacy': 'Privacy and security settings',
      'notifications': 'Notification preferences',
      'advanced': 'Advanced and experimental features'
    };
    
    return descriptions[namespace] || `${namespace} settings`;
  }

  private getCategoryIcon(namespace: string): string {
    const icons: Record<string, string> = {
      'ui': 'palette',
      'chat': 'message-circle',
      'privacy': 'shield',
      'notifications': 'bell',
      'advanced': 'settings'
    };
    
    return icons[namespace] || 'settings';
  }

  private notifyWatchers(changes: Map<SettingKey, { oldValue: any; newValue: any }>): void {
    if (this.globalWatchCallbacks.length > 0) {
      this.globalWatchCallbacks.forEach(callback => {
        try {
          callback(changes);
        } catch (error) {
          console.error('Error in global preference watch callback:', error);
        }
      });
    }
  }

  private async getCustomSettings(): Promise<Record<string, any>> {
    const settingsResult = await this.settingRepository.findByNamespace('custom');
    const settings = settingsResult.success && settingsResult.data ? settingsResult.data.items : [];
    const customSettings: Record<string, any> = {};

    for (const setting of settings) {
      customSettings[setting.key.toString()] = setting.toString();
    }

    return customSettings;
  }

  private async importCustomSettings(customSettings: Record<string, any>): Promise<void> {
    for (const [key, value] of Object.entries(customSettings)) {
      const settingKey = new SettingKey(`custom.${key}`);
      await this.updatePreference(settingKey, value);
    }
  }

  private async getProfile(profileId: string): Promise<PreferenceProfile | null> {
    // Would load from storage in real implementation
    return null;
  }

  private async saveProfile(profile: PreferenceProfile): Promise<void> {
    // Would save to storage in real implementation
  }
}