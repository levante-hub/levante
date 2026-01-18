import type { LoggerConfig, LogLevel, LogRotationConfig } from "../../types/logger";

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
      level: "debug" as LogLevel,
      categories: {
        "ai-sdk": false, // Conservative defaults
        mcp: false,
        database: false,
        ipc: false,
        preferences: false,
        models: false,
        core: true,
        analytics: true,
        oauth: false,
        rag: false,
      },
      output: {
        console: true,
        file: true,
        filePath: "levante.log", // Will be resolved to ~/levante/levante.log
      },
    };
  }

  public initializeFromEnvironment(): void {
    // Always reinitialize to pick up environment variables
    // This allows the logger to properly load configuration after dotenv runss
    this.config = this.loadConfig();
    this.isInitialized = true;
  }

  private loadConfig(): LoggerConfig {
    const env = process.env;

    // Configuración fija (permitimos override por env, no por UI)
    const rotationConfig: LogRotationConfig = {
      maxSize: this.parseInt(env.LOG_MAX_SIZE, 10 * 1024 * 1024),
      maxFiles: this.parseInt(env.LOG_MAX_FILES, 3),
      maxAge: this.parseInt(env.LOG_MAX_AGE, 7),
      compress: this.parseBoolean(env.LOG_COMPRESS, false),
      datePattern: env.LOG_DATE_PATTERN || 'YYYY-MM-DD-HHmmss'
    };

    return {
      enabled: this.parseBoolean(env.DEBUG_ENABLED, true),
      level: this.parseLogLevel(env.LOG_LEVEL, "debug"),
      categories: {
        "ai-sdk": this.parseBoolean(env.DEBUG_AI_SDK, false),
        mcp: this.parseBoolean(env.DEBUG_MCP, false),
        database: this.parseBoolean(env.DEBUG_DATABASE, false),
        ipc: this.parseBoolean(env.DEBUG_IPC, false),
        preferences: this.parseBoolean(env.DEBUG_PREFERENCES, false),
        models: this.parseBoolean(env.DEBUG_MODELS, true),
        core: this.parseBoolean(env.DEBUG_CORE, true),
        analytics: this.parseBoolean(env.DEBUG_ANALYTICS, true),
        oauth: this.parseBoolean(env.DEBUG_OAUTH, false),
        rag: this.parseBoolean(env.DEBUG_RAG, false),
      },
      output: {
        console: true,
        file: this.parseBoolean(env.LOG_TO_FILE, true), // Default to true for testing
        filePath: env.LOG_FILE_PATH || "levante.log",
        rotation: rotationConfig,
      },
    };
  }

  private parseInt(
    value: string | undefined,
    defaultValue: number
  ): number {
    if (!value) return defaultValue;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  private parseBoolean(
    value: string | undefined,
    defaultValue: boolean
  ): boolean {
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === "true";
  }

  private parseLogLevel(
    value: string | undefined,
    defaultValue: LogLevel
  ): LogLevel {
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

  public isCategoryEnabled(
    category: keyof LoggerConfig["categories"]
  ): boolean {
    return this.config.enabled && this.config.categories[category];
  }

  public isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  public shouldLog(
    category: keyof LoggerConfig["categories"],
    level: LogLevel
  ): boolean {
    // Ensure config is loaded from environment if available
    if (!this.isInitialized) {
      this.initializeFromEnvironment();
    }
    return (
      this.isEnabled() &&
      this.isCategoryEnabled(category) &&
      this.isLevelEnabled(level)
    );
  }
}
