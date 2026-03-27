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
    const isProd = process.env.NODE_ENV === 'production';

    return {
      enabled: true,
      level: isProd ? "warn" as LogLevel : "debug" as LogLevel,  // ← CAMBIO: warn en prod
      categories: {
        "ai-sdk": !isProd,     // ← CAMBIO: solo en dev
        mcp: !isProd,          // ← CAMBIO: solo en dev
        database: !isProd,     // ← CAMBIO: solo en dev
        ipc: !isProd,          // ← CAMBIO: solo en dev
        preferences: !isProd,  // ← CAMBIO: solo en dev
        models: true,          // Siempre habilitado
        core: true,            // Siempre habilitado
        analytics: true,       // Siempre habilitado
        oauth: !isProd,        // ← CAMBIO: solo en dev
        telegram: !isProd,
      },
      output: {
        console: !isProd,      // ← CAMBIO: console solo en dev
        file: true,            // Siempre escribir a archivo
        filePath: "levante.log",
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
    const defaultConfig = this.getDefaultConfig();
    const isProd = process.env.NODE_ENV === 'production';  // ← NUEVO

    // Configuración de rotación con defaults diferentes por entorno
    const rotationConfig: LogRotationConfig = {
      maxSize: this.parseInt(
        env.LOG_MAX_SIZE,
        isProd ? 50 * 1024 * 1024 : 10 * 1024 * 1024  // ← CAMBIO: 50MB prod, 10MB dev
      ),
      maxFiles: this.parseInt(
        env.LOG_MAX_FILES,
        isProd ? 10 : 3  // ← CAMBIO: 10 archivos prod, 3 dev
      ),
      maxAge: this.parseInt(
        env.LOG_MAX_AGE,
        isProd ? 30 : 7  // ← CAMBIO: 30 días prod, 7 dev
      ),
      compress: this.parseBoolean(
        env.LOG_COMPRESS,
        isProd  // ← CAMBIO: comprimir en prod por default
      ),
      // Rota diariamente - 1 archivo por día
      datePattern: env.LOG_DATE_PATTERN || 'YYYY-MM-DD'
    };

    return {
      enabled: this.parseBoolean(env.DEBUG_ENABLED, defaultConfig.enabled),
      level: this.parseLogLevel(env.LOG_LEVEL, defaultConfig.level),
      categories: {
        "ai-sdk": this.parseBoolean(env.DEBUG_AI_SDK, defaultConfig.categories['ai-sdk']),
        mcp: this.parseBoolean(env.DEBUG_MCP, defaultConfig.categories.mcp),
        database: this.parseBoolean(env.DEBUG_DATABASE, defaultConfig.categories.database),
        ipc: this.parseBoolean(env.DEBUG_IPC, defaultConfig.categories.ipc),
        preferences: this.parseBoolean(env.DEBUG_PREFERENCES, defaultConfig.categories.preferences),
        models: this.parseBoolean(env.DEBUG_MODELS, defaultConfig.categories.models),
        core: this.parseBoolean(env.DEBUG_CORE, defaultConfig.categories.core),
        analytics: this.parseBoolean(env.DEBUG_ANALYTICS, defaultConfig.categories.analytics),
        oauth: this.parseBoolean(env.DEBUG_OAUTH, defaultConfig.categories.oauth),
        telegram: this.parseBoolean(env.DEBUG_TELEGRAM, defaultConfig.categories.telegram),
      },
      output: {
        console: isProd ? false : true,  // ← CAMBIO: override console en prod
        file: this.parseBoolean(env.LOG_TO_FILE, defaultConfig.output.file),
        filePath: env.LOG_FILE_PATH || defaultConfig.output.filePath,
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
