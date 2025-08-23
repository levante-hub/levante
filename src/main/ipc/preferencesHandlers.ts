import { ipcMain } from 'electron';
import { preferencesService } from '../services/preferencesService';
import { PreferenceKey, UIPreferences } from '../../types/preferences';

export function setupPreferencesHandlers() {
  // Get single preference
  ipcMain.removeHandler('levante/preferences/get');
  ipcMain.handle('levante/preferences/get', (_, key: PreferenceKey) => {
    try {
      const value = preferencesService.get(key);
      return {
        success: true,
        data: value
      };
    } catch (error) {
      console.error('[PreferencesHandlers] Failed to get preference:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Set single preference
  ipcMain.removeHandler('levante/preferences/set');
  ipcMain.handle('levante/preferences/set', (_, key: PreferenceKey, value: any) => {
    try {
      preferencesService.set(key, value);
      return {
        success: true,
        data: value
      };
    } catch (error) {
      console.error('[PreferencesHandlers] Failed to set preference:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get all preferences
  ipcMain.removeHandler('levante/preferences/getAll');
  ipcMain.handle('levante/preferences/getAll', () => {
    try {
      const preferences = preferencesService.getAll();
      return {
        success: true,
        data: preferences
      };
    } catch (error) {
      console.error('[PreferencesHandlers] Failed to get all preferences:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Reset all preferences
  ipcMain.removeHandler('levante/preferences/reset');
  ipcMain.handle('levante/preferences/reset', () => {
    try {
      preferencesService.reset();
      const preferences = preferencesService.getAll();
      return {
        success: true,
        data: preferences
      };
    } catch (error) {
      console.error('[PreferencesHandlers] Failed to reset preferences:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Check if preference exists
  ipcMain.removeHandler('levante/preferences/has');
  ipcMain.handle('levante/preferences/has', (_, key: PreferenceKey) => {
    try {
      const exists = preferencesService.has(key);
      return {
        success: true,
        data: exists
      };
    } catch (error) {
      console.error('[PreferencesHandlers] Failed to check preference:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Delete preference
  ipcMain.removeHandler('levante/preferences/delete');
  ipcMain.handle('levante/preferences/delete', (_, key: PreferenceKey) => {
    try {
      preferencesService.delete(key);
      return {
        success: true,
        data: true
      };
    } catch (error) {
      console.error('[PreferencesHandlers] Failed to delete preference:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Export preferences
  ipcMain.removeHandler('levante/preferences/export');
  ipcMain.handle('levante/preferences/export', () => {
    try {
      const preferences = preferencesService.export();
      return {
        success: true,
        data: preferences
      };
    } catch (error) {
      console.error('[PreferencesHandlers] Failed to export preferences:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Import preferences
  ipcMain.removeHandler('levante/preferences/import');
  ipcMain.handle('levante/preferences/import', (_, preferences: Partial<UIPreferences>) => {
    try {
      preferencesService.import(preferences);
      const updatedPreferences = preferencesService.getAll();
      return {
        success: true,
        data: updatedPreferences
      };
    } catch (error) {
      console.error('[PreferencesHandlers] Failed to import preferences:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get store info (for debugging)
  ipcMain.removeHandler('levante/preferences/info');
  ipcMain.handle('levante/preferences/info', () => {
    try {
      const info = {
        path: preferencesService.getStorePath(),
        size: preferencesService.getStoreSize()
      };
      return {
        success: true,
        data: info
      };
    } catch (error) {
      console.error('[PreferencesHandlers] Failed to get store info:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  console.log('[PreferencesHandlers] IPC handlers registered');
}