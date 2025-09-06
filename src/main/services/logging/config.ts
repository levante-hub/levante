import type { LoggerConfig, LogLevel } from '../../types/logger';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class LoggerConfigService {
  private config: LoggerConfig;
  private isInitialized: boolean = false;

  constructor() {
    // Don't load config immediately - wait for environment variables
    this.config = this.getDefaultConfig();
  }

  private getDefaultConfig(): LoggerConfig {
    return {
      enabled: true,
      level: 'debug' as LogLevel,
      categories: {
        'ai-sdk': false, // Conservative defaults
        'mcp': false,
        'database': false,
        'ipc': false,
        'preferences': false,
        'models': false,
        'core': true,
      },
      output: {
        console: true,
        file: false,
        filePath: './logs/levante.log',
      },
    };
  }

  public initializeFromEnvironment(): void {
    // Always reinitialize to pick up environment variables
    // This allows the logger to properly load configuration after dotenv runs
    this.config = this.loadConfig();
    this.isInitialized = true;
  }

  private loadConfig(): LoggerConfig {
    const env = process.env;

    return {
      enabled: this.parseBoolean(env.DEBUG_ENABLED, true),
      level: this.parseLogLevel(env.LOG_LEVEL, 'debug'),
      categories: {
        'ai-sdk': this.parseBoolean(env.DEBUG_AI_SDK, false),
        'mcp': this.parseBoolean(env.DEBUG_MCP, false),
        'database': this.parseBoolean(env.DEBUG_DATABASE, false),
        'ipc': this.parseBoolean(env.DEBUG_IPC, false),
        'preferences': this.parseBoolean(env.DEBUG_PREFERENCES, false),
        'models': this.parseBoolean(env.DEBUG_MODELS, true),
        'core': this.parseBoolean(env.DEBUG_CORE, true),
      },
      output: {
        console: true,
        file: this.parseBoolean(env.LOG_TO_FILE, false),
        filePath: env.LOG_FILE_PATH || './logs/levante.log',
      },
    };
  }

  private parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true';
  }

  private parseLogLevel(value: string | undefined, defaultValue: LogLevel): LogLevel {
    if (!value) return defaultValue;
    const level = value.toLowerCase() as LogLevel;
    return LOG_LEVELS[level] !== undefined ? level : defaultValue;
  }

  public getConfig(): LoggerConfig {
    // Ensure config is loaded from environment if available
    if (!this.isInitialized) {
      this.initializeFromEnvironment();
    }
    return { ...this.config };
  }

  public updateConfig(updates: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public isCategoryEnabled(category: keyof LoggerConfig['categories']): boolean {
    return this.config.enabled && this.config.categories[category];
  }

  public isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  public shouldLog(category: keyof LoggerConfig['categories'], level: LogLevel): boolean {
    // Ensure config is loaded from environment if available
    if (!this.isInitialized) {
      this.initializeFromEnvironment();
    }
    return this.isEnabled() && this.isCategoryEnabled(category) && this.isLevelEnabled(level);
  }
}