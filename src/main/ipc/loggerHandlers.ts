import { ipcMain } from 'electron';
import { getLogger } from '../services/logging';
import type { LogCategory, LogLevel, LogContext } from '../types/logger';

interface LogMessage {
  category: LogCategory;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

export function setupLoggerHandlers(): void {
  const logger = getLogger();

  // Handle log messages from renderer process
  ipcMain.handle('levante/logger/log', (_event, logMessage: LogMessage) => {
    try {
      const { category, level, message, context } = logMessage;
      logger.log(category, level, message, context);
      return { success: true };
    } catch (error) {
      logger.core.error('Logger IPC handler error', { error: error instanceof Error ? error.message : error });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Handle configuration requests from renderer process
  ipcMain.handle('levante/logger/isEnabled', (_event, category: LogCategory, level: LogLevel) => {
    try {
      return { 
        success: true, 
        data: logger.isEnabled(category, level) 
      };
    } catch (error) {
      logger.core.error('Logger isEnabled IPC handler error', { category, level, error: error instanceof Error ? error.message : error });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Handle configuration updates from renderer process (optional for future use)
  ipcMain.handle('levante/logger/configure', (_event, config: any) => {
    try {
      logger.configure(config);
      return { success: true };
    } catch (error) {
      logger.core.error('Logger configure IPC handler error', { error: error instanceof Error ? error.message : error });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });
}