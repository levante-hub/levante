import type { LoggerConfig, LogLevel } from '../../types/logger';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class LoggerConfigService {
  private config: LoggerConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): LoggerConfig {
    const env = process.env;

    return {
      enabled: this.parseBoolean(env.DEBUG_ENABLED, true),
      level: this.parseLogLevel(env.LOG_LEVEL, 'debug'),
      categories: {
        'ai-sdk': this.parseBoolean(env.DEBUG_AI_SDK, true),
        'mcp': this.parseBoolean(env.DEBUG_MCP, true),
        'database': this.parseBoolean(env.DEBUG_DATABASE, false),
        'ipc': this.parseBoolean(env.DEBUG_IPC, false),
        'preferences': this.parseBoolean(env.DEBUG_PREFERENCES, false),
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
    return this.isEnabled() && this.isCategoryEnabled(category) && this.isLevelEnabled(level);
  }
}