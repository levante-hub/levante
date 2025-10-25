import { ipcRenderer } from 'electron';

export const debugApi = {
  directoryInfo: () =>
    ipcRenderer.invoke('levante/debug/directory-info'),

  serviceHealth: () =>
    ipcRenderer.invoke('levante/debug/service-health'),

  listFiles: () =>
    ipcRenderer.invoke('levante/debug/list-files')
};
