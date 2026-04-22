import { ipcRenderer, webUtils } from 'electron';

export type FileSystemChangeKind =
  | 'file-added'
  | 'file-changed'
  | 'file-removed'
  | 'directory-added'
  | 'directory-removed';

export interface FileSystemChange {
  path: string;
  parentPath: string;
  kind: FileSystemChangeKind;
}

export interface FilesChangedPayload {
  rootPath: string;
  changes: FileSystemChange[];
}

export const filesystemApi = {
  setWorkingDir: (path: string) =>
    ipcRenderer.invoke('levante/fs:setWorkingDir', { path }),

  getWorkingDir: () =>
    ipcRenderer.invoke('levante/fs:getWorkingDir'),

  readDir: (
    path: string,
    options?: { showHidden?: boolean; sortBy?: 'name' | 'type' | 'modified' }
  ) => ipcRenderer.invoke('levante/fs:readDir', { path, options }),

  readFile: (
    path: string,
    options?: { maxSize?: number; encoding?: string }
  ) => ipcRenderer.invoke('levante/fs:readFile', { path, options }),

  getPdfUrl: (path: string) => `levante-fs://pdf?path=${encodeURIComponent(path)}`,

  searchFiles: (
    query: string,
    options?: { maxResults?: number; maxDepth?: number }
  ) => ipcRenderer.invoke('levante/fs:searchFiles', { query, ...options }),

  startWatching: () =>
    ipcRenderer.invoke('levante/fs:startWatching'),

  stopWatching: () =>
    ipcRenderer.invoke('levante/fs:stopWatching'),

  onFilesChanged: (callback: (payload: FilesChangedPayload) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: FilesChangedPayload) => {
      callback(payload);
    };

    ipcRenderer.on('levante/fs:filesChanged', listener);

    return () => {
      ipcRenderer.removeListener('levante/fs:filesChanged', listener);
    };
  },

  /**
   * Returns the absolute OS path of a dragged-in File object.
   * Required because `File.path` is deprecated in Electron 32+.
   * Works for both files and directories dropped via DataTransfer.
   */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
};
