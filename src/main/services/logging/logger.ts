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
  ) {}

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
  public readonly core: CategoryLogger;

  constructor() {
    this.configService = new LoggerConfigService();
    this.setupTransports();
    
    // Initialize category loggers
    this.aiSdk = new CategoryLoggerImpl('ai-sdk', this);
    this.mcp = new CategoryLoggerImpl('mcp', this);
    this.database = new CategoryLoggerImpl('database', this);
    this.ipc = new CategoryLoggerImpl('ipc', this);
    this.preferences = new CategoryLoggerImpl('preferences', this);
    this.core = new CategoryLoggerImpl('core', this);
  }

  private setupTransports(): void {
    const config = this.configService.getConfig();
    
    if (config.output.console) {
      this.transports.push(new ConsoleTransport());
    }
    
    if (config.output.file && config.output.filePath) {
      this.transports.push(new FileTransport(config.output.filePath));
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
    // Re-setup transports with new config
    this.transports = [];
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