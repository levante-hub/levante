import type {
  LoggerService,
  CategoryLogger,
  LogCategory,
  LogLevel,
  LogContext,
  LogEntry,
  LogTransport,
  LoggerConfig
} from '../../types/logger';
import { LoggerConfigService } from './config';
import { ConsoleTransport, FileTransport } from './transports';

class CategoryLoggerImpl implements CategoryLogger {
  constructor(
    private category: LogCategory,
    private logger: Logger
  ) { }

  debug(message: string, context?: LogContext): void {
    this.logger.log(this.category, 'debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.logger.log(this.category, 'info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.log(this.category, 'warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.logger.log(this.category, 'error', message, context);
  }
}

export class Logger implements LoggerService {
  private configService: LoggerConfigService;
  private transports: LogTransport[] = [];

  // Category loggers
  public readonly aiSdk: CategoryLogger;
  public readonly mcp: CategoryLogger;
  public readonly database: CategoryLogger;
  public readonly ipc: CategoryLogger;
  public readonly preferences: CategoryLogger;
  public readonly models: CategoryLogger;
  public readonly core: CategoryLogger;
  public readonly analytics: CategoryLogger;
  public readonly oauth: CategoryLogger;
  public readonly rag: CategoryLogger;

  constructor() {
    this.configService = new LoggerConfigService();
    this.setupTransports();

    // Initialize category loggers
    this.aiSdk = new CategoryLoggerImpl('ai-sdk', this);
    this.mcp = new CategoryLoggerImpl('mcp', this);
    this.database = new CategoryLoggerImpl('database', this);
    this.ipc = new CategoryLoggerImpl('ipc', this);
    this.preferences = new CategoryLoggerImpl('preferences', this);
    this.models = new CategoryLoggerImpl('models', this);
    this.core = new CategoryLoggerImpl('core', this);
    this.analytics = new CategoryLoggerImpl('analytics', this);
    this.oauth = new CategoryLoggerImpl('oauth', this);
    this.rag = new CategoryLoggerImpl('rag', this);
  }

  private setupTransports(): void {
    // Clear existing transports
    this.transports = [];

    const config = this.configService.getConfig();

    if (config.output.console) {
      this.transports.push(new ConsoleTransport());
    }

    if (config.output.file && config.output.filePath) {
      this.transports.push(new FileTransport(config.output.filePath, config.output.rotation));
    }
  }

  public log(category: LogCategory, level: LogLevel, message: string, context?: LogContext): void {
    if (!this.isEnabled(category, level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      category,
      level,
      message,
      context,
    };

    for (const transport of this.transports) {
      try {
        transport.write(entry);
      } catch (error) {
        // Fallback to console.error if transport fails
        console.error(`Logger transport error:`, error);
      }
    }
  }

  public isEnabled(category: LogCategory, level: LogLevel): boolean {
    return this.configService.shouldLog(category, level);
  }

  public configure(config: Partial<LoggerConfig>): void {
    this.configService.updateConfig(config);
    this.setupTransports();
  }

  /**
   * Re-setup transports based on current configuration
   */
  public refresh(): void {
    // Force config reload
    (this.configService as any).initializeFromEnvironment();
    this.setupTransports();
  }
}

// Singleton instance
let loggerInstance: Logger | null = null;

export function createLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}

export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}

// Initialize logger with environment variables or preferences
export function initializeLogger(): void {
  const logger = getLogger();
  logger.refresh();
}
