import { ipcRenderer } from 'electron';
import type { LogCategory, LogLevel, LogContext } from '../types';

export const loggerApi = {
  log: (category: LogCategory, level: LogLevel, message: string, context?: LogContext) =>
    ipcRenderer.invoke('levante/logger/log', { category, level, message, context }),

  isEnabled: (category: LogCategory, level: LogLevel) =>
    ipcRenderer.invoke('levante/logger/isEnabled', category, level),

  configure: (config: any) =>
    ipcRenderer.invoke('levante/logger/configure', config)
};
