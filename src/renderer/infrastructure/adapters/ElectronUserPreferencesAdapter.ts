import {
  UserPreferencesPort
} from '../../../domain/ports/primary/UserPreferencesPort';

/**
 * Renderer Process adapter that implements UserPreferencesPort
 * by communicating with Main Process via IPC
 * 
 * STUB IMPLEMENTATION - Simplified for architecture compliance
 */
export class ElectronUserPreferencesAdapter implements UserPreferencesPort {
  
  // Temporary stub for IPC - would be replaced with actual IPC implementation
  private async invokeIPC(channel: string, data?: any): Promise<{ success: boolean; data?: any; error?: string }> {
    // This is a stub - actual implementation would use proper IPC
    return { success: false, error: 'IPC not implemented in stub' };
  }

  async getPreference<T>(key: string): Promise<T | null> {
    try {
      const result = await window.levante.preferences.get(key);
      
      if (!result.success) {
        return null;
      }

      return result.data;
    } catch (error) {
      console.error('Failed to get preference:', error);
      return null;
    }
  }

  async setPreference<T>(key: string, value: T): Promise<void> {
    try {
      const result = await window.levante.preferences.set({ key, value });
      
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      throw error;
    }
  }

  async getAllPreferences(): Promise<Record<string, any>> {
    try {
      const result = await window.levante.preferences.getAll();
      
      if (!result.success) {
        return {};
      }

      return result.data;
    } catch (error) {
      console.error('Failed to get all preferences:', error);
      return {};
    }
  }

  async setMultiplePreferences(preferences: Record<string, any>): Promise<void> {
    try {
      const result = await window.levante.preferences.setMany(preferences);
      
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      throw error;
    }
  }

  async deletePreference(key: string): Promise<void> {
    try {
      const result = await window.levante.preferences.delete(key);
      
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      throw error;
    }
  }

  async hasPreference(key: string): Promise<boolean> {
    try {
      const result = await window.levante.preferences.has(key);
      
      if (!result.success) {
        return false;
      }

      return result.data;
    } catch (error) {
      console.error('Failed to check preference existence:', error);
      return false;
    }
  }

  async getPreferencesByPattern(pattern: string): Promise<Record<string, any>> {
    try {
      const result = await window.electron.invoke('levante/preferences/get-by-pattern', pattern);
      
      if (!result.success) {
        return {};
      }

      return result.data;
    } catch (error) {
      console.error('Failed to get preferences by pattern:', error);
      return {};
    }
  }

  async clearAllPreferences(): Promise<void> {
    try {
      const result = await window.electron.invoke('levante/preferences/clear-all');
      
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      throw error;
    }
  }

  async exportPreferences(options?: {
    includeSecrets?: boolean;
    format?: 'json' | 'yaml';
  }): Promise<PreferenceExport> {
    try {
      const result = await window.electron.invoke('levante/preferences/export', options);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    } catch (error) {
      throw error;
    }
  }

  async importPreferences(importData: PreferenceImport): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    try {
      const result = await window.electron.invoke('levante/preferences/import', importData);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    } catch (error) {
      throw error;
    }
  }

  async backupPreferences(name?: string): Promise<PreferenceBackup> {
    try {
      const result = await window.electron.invoke('levante/preferences/backup', name);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    } catch (error) {
      throw error;
    }
  }

  async restoreFromBackup(backupId: string): Promise<void> {
    try {
      const result = await window.electron.invoke('levante/preferences/restore', backupId);
      
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      throw error;
    }
  }

  async listBackups(): Promise<PreferenceBackup[]> {
    try {
      const result = await window.electron.invoke('levante/preferences/list-backups');
      
      if (!result.success) {
        return [];
      }

      return result.data;
    } catch (error) {
      console.error('Failed to list backups:', error);
      return [];
    }
  }

  async deleteBackup(backupId: string): Promise<void> {
    try {
      const result = await window.electron.invoke('levante/preferences/delete-backup', backupId);
      
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      throw error;
    }
  }

  async watchPreferences(keys: string[], callback: PreferenceChangeCallback): Promise<() => void> {
    try {
      // Set up preference watching via IPC
      const result = await window.electron.invoke('levante/preferences/watch', keys);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      // Listen for preference changes
      const handlePreferenceChange = (changes: Record<string, { oldValue: any; newValue: any }>) => {
        callback(changes);
      };

      window.electron.on('levante/preferences/changed', handlePreferenceChange);

      // Return unsubscribe function
      return () => {
        window.electron.removeListener('levante/preferences/changed', handlePreferenceChange);
      };
    } catch (error) {
      throw error;
    }
  }

  async resetToDefaults(keys?: string[]): Promise<void> {
    try {
      const result = await window.electron.invoke('levante/preferences/reset-to-defaults', keys);
      
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      throw error;
    }
  }

  async getPreferenceSchema(key?: string): Promise<PreferenceSchema[]> {
    try {
      const result = await window.electron.invoke('levante/preferences/get-schema', key);
      
      if (!result.success) {
        return [];
      }

      return result.data;
    } catch (error) {
      console.error('Failed to get preference schema:', error);
      return [];
    }
  }

  // Utility methods for common preferences
  async getTheme(): Promise<'light' | 'dark' | 'system'> {
    return (await this.getPreference<'light' | 'dark' | 'system'>('theme')) || 'system';
  }

  async setTheme(theme: 'light' | 'dark' | 'system'): Promise<void> {
    await this.setPreference('theme', theme);
  }

  async getFontSize(): Promise<number> {
    return (await this.getPreference<number>('fontSize')) || 14;
  }

  async setFontSize(size: number): Promise<void> {
    await this.setPreference('fontSize', size);
  }

  async getLanguage(): Promise<string> {
    return (await this.getPreference<string>('language')) || 'en';
  }

  async setLanguage(language: string): Promise<void> {
    await this.setPreference('language', language);
  }

  async getAutoSave(): Promise<boolean> {
    return (await this.getPreference<boolean>('autoSave')) ?? true;
  }

  async setAutoSave(enabled: boolean): Promise<void> {
    await this.setPreference('autoSave', enabled);
  }

  async getNotifications(): Promise<boolean> {
    return (await this.getPreference<boolean>('notifications')) ?? true;
  }

  async setNotifications(enabled: boolean): Promise<void> {
    await this.setPreference('notifications', enabled);
  }

  async getAnalytics(): Promise<boolean> {
    return (await this.getPreference<boolean>('analytics')) ?? false;
  }

  async setAnalytics(enabled: boolean): Promise<void> {
    await this.setPreference('analytics', enabled);
  }
}