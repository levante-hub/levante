import { ipcRenderer } from 'electron';
import type { DeepLinkAction } from '../types';

export const appApi = {
  getVersion: () => ipcRenderer.invoke('levante/app/version'),
  getPlatform: () => ipcRenderer.invoke('levante/app/platform'),
  getSystemTheme: () => ipcRenderer.invoke('levante/app/theme'),
  onSystemThemeChanged: (callback: (theme: { shouldUseDarkColors: boolean; themeSource: string }) => void) => {
    const listener = (_event: any, theme: { shouldUseDarkColors: boolean; themeSource: string }) => {
      callback(theme);
    };
    ipcRenderer.on('levante/app/theme-changed', listener);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('levante/app/theme-changed', listener);
    };
  },

  checkForUpdates: () => ipcRenderer.invoke('levante/app/check-for-updates'),

  openExternal: (url: string) => ipcRenderer.invoke('levante/app/open-external', url),

  onDeepLink: (callback: (action: DeepLinkAction) => void) => {
    const listener = (_event: any, action: DeepLinkAction) => {
      callback(action);
    };
    ipcRenderer.on('levante/deep-link/action', listener);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('levante/deep-link/action', listener);
    };
  },

  // OAuth callback server
  oauth: {
    startServer: () => ipcRenderer.invoke('levante/oauth/start-server'),
    stopServer: () => ipcRenderer.invoke('levante/oauth/stop-server'),
    onCallback: (callback: (data: { success: boolean; provider?: string; code?: string; error?: string }) => void) => {
      const listener = (_event: any, data: any) => {
        callback(data);
      };
      ipcRenderer.on('levante/oauth/callback', listener);

      // Return cleanup function
      return () => {
        ipcRenderer.removeListener('levante/oauth/callback', listener);
      };
    },
  },
};
