import { ipcRenderer } from 'electron';
import { UIPreferences, PreferenceKey } from '../../types/preferences';

export const preferencesApi = {
  get: <K extends PreferenceKey>(key: K) =>
    ipcRenderer.invoke('levante/preferences/get', key),

  set: <K extends PreferenceKey>(key: K, value: UIPreferences[K]) =>
    ipcRenderer.invoke('levante/preferences/set', key, value),

  getAll: () =>
    ipcRenderer.invoke('levante/preferences/getAll'),

  reset: () =>
    ipcRenderer.invoke('levante/preferences/reset'),

  has: (key: PreferenceKey) =>
    ipcRenderer.invoke('levante/preferences/has', key),

  delete: (key: PreferenceKey) =>
    ipcRenderer.invoke('levante/preferences/delete', key),

  export: () =>
    ipcRenderer.invoke('levante/preferences/export'),

  import: (preferences: Partial<UIPreferences>) =>
    ipcRenderer.invoke('levante/preferences/import', preferences),

  info: () =>
    ipcRenderer.invoke('levante/preferences/info')
};
