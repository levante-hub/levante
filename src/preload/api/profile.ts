import { ipcRenderer } from 'electron';
import type { UserProfile } from '../types';

export const profileApi = {
  get: () =>
    ipcRenderer.invoke('levante/profile/get'),

  update: (updates: Partial<UserProfile>) =>
    ipcRenderer.invoke('levante/profile/update', updates),

  getPath: () =>
    ipcRenderer.invoke('levante/profile/get-path'),

  openDirectory: () =>
    ipcRenderer.invoke('levante/profile/open-directory'),

  getDirectoryInfo: () =>
    ipcRenderer.invoke('levante/profile/get-directory-info')
};
