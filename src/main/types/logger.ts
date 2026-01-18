export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory =
  | 'ai-sdk'
  | 'mcp'
  | 'database'
  | 'ipc'
  | 'preferences'
  | 'models'
  | 'core'
  | 'analytics'
  | 'oauth'
  | 'rag';

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

/**
 * Configuration for log file rotation
 */
export interface LogRotationConfig {
  /**
   * Maximum size of log file in bytes before rotation
   * Default: 10485760 (10MB)
   */
  maxSize: number;

  /**
   * Maximum number of rotated log files to keep
   * Default: 5
   */
  maxFiles: number;

  /**
   * Maximum age of log files in days
   * Files older than this will be deleted
   * Default: 7
   */
  maxAge: number;

  /**
   * Whether to compress rotated log files
   * Default: false
   */
  compress: boolean;

  /**
   * Date pattern for rotated file names
   * Default: 'YYYY-MM-DD-HHmmss'
   */
  datePattern?: string;
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
    rotation?: LogRotationConfig;
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
  analytics: CategoryLogger;
  oauth: CategoryLogger;
  rag: CategoryLogger;

  log(category: LogCategory, level: LogLevel, message: string, context?: LogContext): void;
  configure(config: Partial<LoggerConfig>): void;
  isEnabled(category: LogCategory, level: LogLevel): boolean;
}
