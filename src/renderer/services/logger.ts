import type { LogCategory, LogLevel, LogContext, CategoryLogger } from '../../main/types/logger';

export interface RendererLoggerService {
  aiSdk: CategoryLogger;
  mcp: CategoryLogger;
  database: CategoryLogger;
  ipc: CategoryLogger;
  preferences: CategoryLogger;
  models: CategoryLogger;
  core: CategoryLogger;
  
  log(category: LogCategory, level: LogLevel, message: string, context?: LogContext): void;
  isEnabled(category: LogCategory, level: LogLevel): Promise<boolean>;
  configure(config: any): void;
}

class RendererCategoryLogger implements CategoryLogger {
  constructor(
    private category: LogCategory,
    private logger: RendererLogger
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

export class RendererLogger implements RendererLoggerService {
  // Category loggers
  public readonly aiSdk: CategoryLogger;
  public readonly mcp: CategoryLogger;
  public readonly database: CategoryLogger;
  public readonly ipc: CategoryLogger;
  public readonly preferences: CategoryLogger;
  public readonly models: CategoryLogger;
  public readonly core: CategoryLogger;

  constructor() {
    // Initialize category loggers
    this.aiSdk = new RendererCategoryLogger('ai-sdk', this);
    this.mcp = new RendererCategoryLogger('mcp', this);
    this.database = new RendererCategoryLogger('database', this);
    this.ipc = new RendererCategoryLogger('ipc', this);
    this.preferences = new RendererCategoryLogger('preferences', this);
    this.models = new RendererCategoryLogger('models', this);
    this.core = new RendererCategoryLogger('core', this);
  }

  public log(category: LogCategory, level: LogLevel, message: string, context?: LogContext): void {
    // Send to main process via IPC
    window.levante.logger.log(category, level, message, context).catch((error: any) => {
      // Fallback to console if IPC fails
      console.error('Logger IPC failed:', error);
      console.log(`[${category.toUpperCase()}] [${level.toUpperCase()}]`, message, context);
    });
  }

  public async isEnabled(category: LogCategory, level: LogLevel): Promise<boolean> {
    try {
      const result = await window.levante.logger.isEnabled(category, level);
      return result.success && result.data === true;
    } catch (error) {
      // Fallback to true if IPC fails
      console.error('Logger isEnabled IPC failed:', error);
      return true;
    }
  }

  public configure(config: any): void {
    window.levante.logger.configure(config).catch((error: any) => {
      console.error('Logger configure IPC failed:', error);
    });
  }
}

// Singleton instance
let rendererLoggerInstance: RendererLogger | null = null;

export function createRendererLogger(): RendererLogger {
  if (!rendererLoggerInstance) {
    rendererLoggerInstance = new RendererLogger();
  }
  return rendererLoggerInstance;
}

export function getRendererLogger(): RendererLogger {
  if (!rendererLoggerInstance) {
    rendererLoggerInstance = createRendererLogger();
  }
  return rendererLoggerInstance;
}

// Export as default for convenience
export const logger = getRendererLogger();