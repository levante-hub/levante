import { ipcRenderer } from 'electron';

export const settingsApi = {
  getSettings: () =>
    ipcRenderer.invoke('levante/settings/get'),

  updateSettings: (settings: Record<string, any>) =>
    ipcRenderer.invoke('levante/settings/update', settings),
};
