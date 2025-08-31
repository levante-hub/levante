import { ipcMain } from 'electron';
import { getMainProcessContainer } from '../../infrastructure/container/ElectronServiceContainer';
import { UserPreferencesPort } from '../../../domain/ports/primary/UserPreferencesPort';

export function setupUserPreferencesHandlers() {
  const container = getMainProcessContainer();
  const userPreferencesService: UserPreferencesPort = container.getUserPreferencesService();

  // Get user preference
  ipcMain.removeHandler('levante/preferences/get');
  ipcMain.handle('levante/preferences/get', async (_, key: string) => {
    try {
      const value = await userPreferencesService.getPreference(key);
      return {
        success: true,
        data: value
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to get preference:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Set user preference
  ipcMain.removeHandler('levante/preferences/set');
  ipcMain.handle('levante/preferences/set', async (_, key: string, value: any) => {
    try {
      await userPreferencesService.setPreference(key, value);
      return {
        success: true
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to set preference:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get all user preferences
  ipcMain.removeHandler('levante/preferences/get-all');
  ipcMain.handle('levante/preferences/get-all', async () => {
    try {
      const preferences = await userPreferencesService.getAllPreferences();
      return {
        success: true,
        data: preferences
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to get all preferences:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Set multiple preferences
  ipcMain.removeHandler('levante/preferences/set-many');
  ipcMain.handle('levante/preferences/set-many', async (_, preferences: Record<string, any>) => {
    try {
      await userPreferencesService.setMultiplePreferences(preferences);
      return {
        success: true
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to set multiple preferences:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Delete user preference
  ipcMain.removeHandler('levante/preferences/delete');
  ipcMain.handle('levante/preferences/delete', async (_, key: string) => {
    try {
      await userPreferencesService.deletePreference(key);
      return {
        success: true
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to delete preference:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Check if preference exists
  ipcMain.removeHandler('levante/preferences/has');
  ipcMain.handle('levante/preferences/has', async (_, key: string) => {
    try {
      const exists = await userPreferencesService.hasPreference(key);
      return {
        success: true,
        data: exists
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to check preference existence:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get preferences by pattern
  ipcMain.removeHandler('levante/preferences/get-by-pattern');
  ipcMain.handle('levante/preferences/get-by-pattern', async (_, pattern: string) => {
    try {
      const preferences = await userPreferencesService.getPreferencesByPattern(pattern);
      return {
        success: true,
        data: preferences
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to get preferences by pattern:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Clear all preferences
  ipcMain.removeHandler('levante/preferences/clear-all');
  ipcMain.handle('levante/preferences/clear-all', async () => {
    try {
      await userPreferencesService.clearAllPreferences();
      return {
        success: true
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to clear all preferences:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Export preferences
  ipcMain.removeHandler('levante/preferences/export');
  ipcMain.handle('levante/preferences/export', async (_, options?: {
    includeSecrets?: boolean;
    format?: 'json' | 'yaml';
  }) => {
    try {
      const exportData = await userPreferencesService.exportPreferences(options);
      return {
        success: true,
        data: exportData
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to export preferences:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Import preferences
  ipcMain.removeHandler('levante/preferences/import');
  ipcMain.handle('levante/preferences/import', async (_, importData: {
    data: string | object;
    format?: 'json' | 'yaml';
    merge?: boolean;
  }) => {
    try {
      const result = await userPreferencesService.importPreferences(importData);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to import preferences:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Backup preferences
  ipcMain.removeHandler('levante/preferences/backup');
  ipcMain.handle('levante/preferences/backup', async (_, name?: string) => {
    try {
      const backup = await userPreferencesService.backupPreferences(name);
      return {
        success: true,
        data: backup
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to backup preferences:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Restore preferences from backup
  ipcMain.removeHandler('levante/preferences/restore');
  ipcMain.handle('levante/preferences/restore', async (_, backupId: string) => {
    try {
      await userPreferencesService.restoreFromBackup(backupId);
      return {
        success: true
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to restore preferences:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // List available backups
  ipcMain.removeHandler('levante/preferences/list-backups');
  ipcMain.handle('levante/preferences/list-backups', async () => {
    try {
      const backups = await userPreferencesService.listBackups();
      return {
        success: true,
        data: backups
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to list backups:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Delete backup
  ipcMain.removeHandler('levante/preferences/delete-backup');
  ipcMain.handle('levante/preferences/delete-backup', async (_, backupId: string) => {
    try {
      await userPreferencesService.deleteBackup(backupId);
      return {
        success: true
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to delete backup:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Watch for preference changes
  ipcMain.removeHandler('levante/preferences/watch');
  ipcMain.handle('levante/preferences/watch', async (event, keys: string[]) => {
    try {
      // Set up preference change watching
      const unsubscribe = await userPreferencesService.watchPreferences(keys, (changes) => {
        event.sender.send('levante/preferences/changed', changes);
      });
      
      // Store unsubscribe function for cleanup
      // This would need proper cleanup handling in a real implementation
      
      return {
        success: true
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to watch preferences:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Reset preferences to defaults
  ipcMain.removeHandler('levante/preferences/reset-to-defaults');
  ipcMain.handle('levante/preferences/reset-to-defaults', async (_, keys?: string[]) => {
    try {
      await userPreferencesService.resetToDefaults(keys);
      return {
        success: true
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to reset to defaults:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get preference schema/metadata
  ipcMain.removeHandler('levante/preferences/get-schema');
  ipcMain.handle('levante/preferences/get-schema', async (_, key?: string) => {
    try {
      const schema = await userPreferencesService.getPreferenceSchema(key);
      return {
        success: true,
        data: schema
      };
    } catch (error) {
      console.error('[UserPreferencesHandlers] Failed to get preference schema:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  console.log('[UserPreferencesHandlers] IPC handlers registered');
}