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
  | 'telegram';

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
  telegram: CategoryLogger;

  log(category: LogCategory, level: LogLevel, message: string, context?: LogContext): void;
  configure(config: Partial<LoggerConfig>): void;
  isEnabled(category: LogCategory, level: LogLevel): boolean;
}

/**
 * Extended log entry with UI-specific fields for log viewer
 */
export interface LogEntryUI extends LogEntry {
  id: string; // UUID for React keys
  raw?: string; // Original raw line for debugging
}

/**
 * Information about a log file
 */
export interface LogFileInfo {
  name: string;
  path: string;
  size: number;
  modified: Date;
  isCurrent: boolean;
}

/**
 * Statistics about logs
 */
export interface LogStats {
  total: number;
  byCategory: Record<LogCategory, number>;
  byLevel: Record<LogLevel, number>;
  timeRange: { start: Date; end: Date };
}
