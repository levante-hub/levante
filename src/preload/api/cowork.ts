import { ipcRenderer } from 'electron';

export interface SelectWorkingDirectoryResult {
  success: boolean;
  data?: { path: string; canceled: boolean };
  error?: string;
}

export interface ValidateDirectoryResult {
  success: boolean;
  data?: { isDirectory: boolean; resolvedPath: string };
  error?: string;
}

export type CoworkPrereqStep =
  | 'checking'
  | 'installing-gitbash'
  | 'ensuring-python'
  | 'ready'
  | 'error';

export interface CoworkPrereqStatus {
  step: CoworkPrereqStep;
  detail?: Record<string, unknown>;
  warnings?: string[];
}

export const coworkApi = {
  selectWorkingDirectory: (options?: {
    title?: string;
    defaultPath?: string;
    buttonLabel?: string;
  }): Promise<SelectWorkingDirectoryResult> =>
    ipcRenderer.invoke('levante/cowork/select-working-directory', options),

  validateDirectory: (path: string): Promise<ValidateDirectoryResult> =>
    ipcRenderer.invoke('levante/cowork/validate-directory', { path }),

  onPrerequisitesStatus: (
    callback: (status: CoworkPrereqStatus) => void
  ): (() => void) => {
    const channel = 'levante/cowork/prerequisites-status';
    const listener = (_event: unknown, status: CoworkPrereqStatus) => callback(status);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
};
