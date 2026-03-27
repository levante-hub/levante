import winston from 'winston';
import type {
  LoggerService,
  CategoryLogger,
  LogCategory,
  LogLevel,
  LogContext,
  LoggerConfig
} from '../../types/logger';
import { LoggerConfigService } from './config';
import {
  isProduction,
  createConsoleTransport,
  createFileTransport,
  createProductionFileTransports
} from './winstonConfig';

// CategoryLogger con zero overhead (MANTENER)
class CategoryLoggerImpl implements CategoryLogger {
  constructor(
    private category: LogCategory,
    private logger: Logger,
    private configService: LoggerConfigService
  ) { }

  debug(message: string, context?: LogContext): void {
    // Zero overhead: early return ANTES de llamar a Winston
    if (!this.configService.shouldLog(this.category, 'debug')) return;
    this.logger.log(this.category, 'debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    if (!this.configService.shouldLog(this.category, 'info')) return;
    this.logger.log(this.category, 'info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    if (!this.configService.shouldLog(this.category, 'warn')) return;
    this.logger.log(this.category, 'warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    if (!this.configService.shouldLog(this.category, 'error')) return;
    this.logger.log(this.category, 'error', message, context);
  }
}

export class Logger implements LoggerService {
  private configService: LoggerConfigService;
  private winstonLogger: winston.Logger;  // ← NUEVO: Winston logger

  // Category loggers (MANTENER IGUAL)
  public readonly aiSdk: CategoryLogger;
  public readonly mcp: CategoryLogger;
  public readonly database: CategoryLogger;
  public readonly ipc: CategoryLogger;
  public readonly preferences: CategoryLogger;
  public readonly models: CategoryLogger;
  public readonly core: CategoryLogger;
  public readonly analytics: CategoryLogger;
  public readonly oauth: CategoryLogger;
  public readonly telegram: CategoryLogger;

  constructor() {
    this.configService = new LoggerConfigService();
    this.winstonLogger = this.createWinstonLogger();  // ← CAMBIO: crear Winston

    // Initialize category loggers (MANTENER IGUAL)
    this.aiSdk = new CategoryLoggerImpl('ai-sdk', this, this.configService);
    this.mcp = new CategoryLoggerImpl('mcp', this, this.configService);
    this.database = new CategoryLoggerImpl('database', this, this.configService);
    this.ipc = new CategoryLoggerImpl('ipc', this, this.configService);
    this.preferences = new CategoryLoggerImpl('preferences', this, this.configService);
    this.models = new CategoryLoggerImpl('models', this, this.configService);
    this.core = new CategoryLoggerImpl('core', this, this.configService);
    this.analytics = new CategoryLoggerImpl('analytics', this, this.configService);
    this.oauth = new CategoryLoggerImpl('oauth', this, this.configService);
    this.telegram = new CategoryLoggerImpl('telegram', this, this.configService);
  }

  // ← NUEVO: Crear Winston logger
  private createWinstonLogger(): winston.Logger {
    const config = this.configService.getConfig();
    const transports: winston.transport[] = [];

    // Console transport
    if (config.output.console) {
      transports.push(createConsoleTransport());
    }

    // File transports
    if (config.output.file && config.output.filePath && config.output.rotation) {
      if (isProduction()) {
        // Producción: JSON estructurado + archivo de errores separado
        transports.push(...createProductionFileTransports(
          config.output.filePath,
          config.output.rotation
        ));
      } else {
        // Desarrollo: archivo único con todos los logs
        transports.push(createFileTransport(
          config.output.filePath,
          config.output.rotation,
          false
        ));
      }
    }

    return winston.createLogger({
      level: config.level,
      transports,
      exitOnError: false,
    });
  }

  // ← CAMBIO: Usar Winston en lugar de custom transports
  public log(category: LogCategory, level: LogLevel, message: string, context?: LogContext): void {
    // Winston ya filtra por level, pero ya filtramos por category arriba (zero overhead)
    this.winstonLogger.log(level, message, {
      category,
      ...context,
    });
  }

  public isEnabled(category: LogCategory, level: LogLevel): boolean {
    return this.configService.shouldLog(category, level);
  }

  // ← CAMBIO: Recrear Winston logger con nueva config
  public configure(config: Partial<LoggerConfig>): void {
    const oldConfig = this.configService.getConfig();
    this.configService.updateConfig(config);

    const oldLogger = this.winstonLogger;
    try {
      this.winstonLogger = this.createWinstonLogger();
      oldLogger.close();
    } catch (error) {
      // Rollback: mantener logger anterior si falla
      console.error('[Logger] Failed to reconfigure logger, keeping previous configuration:', error);
      this.configService.updateConfig(oldConfig);
      this.winstonLogger = oldLogger;
    }
  }

  // ← CAMBIO: Recrear Winston logger
  public refresh(): void {
    this.configService.initializeFromEnvironment();

    const oldLogger = this.winstonLogger;
    try {
      this.winstonLogger = this.createWinstonLogger();
      oldLogger.close();
    } catch (error) {
      // Mantener logger anterior si falla
      console.error('[Logger] Failed to refresh logger, keeping previous instance:', error);
      this.winstonLogger = oldLogger;
    }
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
