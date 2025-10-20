export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory = 'ai-sdk' | 'mcp' | 'database' | 'ipc' | 'preferences' | 'models' | 'core';

export interface LogContext {
  [key: string]: any;
}

export interface LogEntry {
  timestamp: Date;
  category: LogCategory;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

export interface CategoryLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

export interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
  categories: {
    [K in LogCategory]: boolean;
  };
  output: {
    console: boolean;
    file: boolean;
    filePath?: string;
  };
}

export interface LogTransport {
  write(entry: LogEntry): void;
}

export interface LoggerService {
  aiSdk: CategoryLogger;
  mcp: CategoryLogger;
  database: CategoryLogger;
  ipc: CategoryLogger;
  preferences: CategoryLogger;
  models: CategoryLogger;
  core: CategoryLogger;
  
  log(category: LogCategory, level: LogLevel, message: string, context?: LogContext): void;
  configure(config: Partial<LoggerConfig>): void;
  isEnabled(category: LogCategory, level: LogLevel): boolean;
}