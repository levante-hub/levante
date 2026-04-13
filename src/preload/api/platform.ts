/**
 * Preload API for Levante Platform operations
 * Exposes window.levante.platform.*
 */

import { ipcRenderer } from 'electron';

export const platformApi = {
  login: (baseUrl?: string) =>
    ipcRenderer.invoke('levante/platform/login', baseUrl),

  logout: () =>
    ipcRenderer.invoke('levante/platform/logout'),

  getStatus: () =>
    ipcRenderer.invoke('levante/platform/status'),

  getModels: (payload?: { baseUrl?: string; reason?: string } | string) =>
    ipcRenderer.invoke('levante/platform/models', payload),

  getOrgId: (): Promise<{ success: boolean; data?: string }> =>
    ipcRenderer.invoke('levante/platform/org-id'),
};
