export class SettingKey {
  // Known system setting keys
  public static readonly DEFAULT_MODEL = new SettingKey('system.default_model');
  public static readonly MAX_CONTEXT_LENGTH = new SettingKey('system.max_context_length');
  public static readonly ENABLE_STREAMING = new SettingKey('system.enable_streaming');
  public static readonly API_TIMEOUT = new SettingKey('system.api_timeout');
  public static readonly DEBUG_MODE = new SettingKey('system.debug_mode');
  public static readonly THEME = new SettingKey('ui.theme');
  public static readonly LANGUAGE = new SettingKey('ui.language');
  public static readonly FONT_SIZE = new SettingKey('ui.font_size');
  public static readonly CHAT_HISTORY_LIMIT = new SettingKey('chat.history_limit');
  public static readonly AUTO_SAVE_INTERVAL = new SettingKey('chat.auto_save_interval');
  public static readonly ENABLE_WEB_SEARCH = new SettingKey('features.enable_web_search');
  public static readonly ENABLE_MCP = new SettingKey('features.enable_mcp');
  public static readonly TELEMETRY_ENABLED = new SettingKey('privacy.telemetry_enabled');
  public static readonly DATA_RETENTION_DAYS = new SettingKey('privacy.data_retention_days');

  constructor(private readonly value: string) {
    if (!value.trim()) {
      throw new Error('Setting key cannot be empty')
    }
    
    if (value.length > 100) {
      throw new Error('Setting key cannot exceed 100 characters')
    }

    // Validate key format: namespace.key or namespace.subnamespace.key
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(value)) {
      throw new Error('Setting key must follow format: namespace.key (lowercase, alphanumeric and underscore only)')
    }

    // Ensure at least one dot (namespace required)
    if (!value.includes('.')) {
      throw new Error('Setting key must have at least one namespace (e.g., system.setting_name)')
    }

    // Maximum 4 levels deep
    if (value.split('.').length > 4) {
      throw new Error('Setting key cannot have more than 4 levels (namespace.sub.sub.key)')
    }
  }

  toString(): string {
    return this.value
  }

  equals(other: SettingKey): boolean {
    return this.value === other.value
  }

  static fromString(value: string): SettingKey {
    return new SettingKey(value)
  }

  getNamespace(): string {
    return this.value.split('.')[0]
  }

  getKeyName(): string {
    const parts = this.value.split('.')
    return parts[parts.length - 1]
  }

  getFullPath(): string[] {
    return this.value.split('.')
  }

  getParentKey(): SettingKey | null {
    const parts = this.value.split('.')
    if (parts.length <= 2) {
      return null // Already at namespace.key level
    }
    
    const parentPath = parts.slice(0, -1).join('.')
    return new SettingKey(parentPath)
  }

  hasNamespace(namespace: string): boolean {
    return this.getNamespace() === namespace
  }

  isSystemSetting(): boolean {
    return this.hasNamespace('system')
  }

  isUiSetting(): boolean {
    return this.hasNamespace('ui')
  }

  isChatSetting(): boolean {
    return this.hasNamespace('chat')
  }

  isFeatureSetting(): boolean {
    return this.hasNamespace('features')
  }

  isPrivacySetting(): boolean {
    return this.hasNamespace('privacy')
  }

  isProviderSetting(): boolean {
    return this.hasNamespace('provider')
  }

  getDepth(): number {
    return this.value.split('.').length
  }

  createChildKey(childName: string): SettingKey {
    if (!childName.trim()) {
      throw new Error('Child key name cannot be empty')
    }
    
    if (!/^[a-z][a-z0-9_]*$/.test(childName)) {
      throw new Error('Child key name must be lowercase alphanumeric with underscores')
    }

    return new SettingKey(`${this.value}.${childName}`)
  }

  matchesPattern(pattern: string): boolean {
    // Simple pattern matching with wildcards
    // Examples: "system.*", "*.theme", "chat.*.enabled"
    
    if (!pattern.includes('*')) {
      return this.value === pattern
    }

    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[a-z0-9_]+')

    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(this.value)
  }

  getCategory(): string {
    const namespace = this.getNamespace()
    
    switch (namespace) {
      case 'system':
        return 'System Configuration'
      case 'ui':
        return 'User Interface'
      case 'chat':
        return 'Chat Settings'
      case 'features':
        return 'Feature Toggles'
      case 'privacy':
        return 'Privacy & Security'
      case 'provider':
        return 'AI Provider Configuration'
      case 'mcp':
        return 'Model Context Protocol'
      case 'debug':
        return 'Debug & Diagnostics'
      default:
        return 'Custom Configuration'
    }
  }

  getDisplayName(): string {
    // Convert snake_case to Title Case
    const keyName = this.getKeyName()
    return keyName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  isRequired(): boolean {
    // Define which settings are required for the system to function
    const requiredSettings = [
      'system.default_model',
      'system.api_timeout',
      'ui.theme',
      'ui.language',
      'chat.history_limit'
    ]
    
    return requiredSettings.includes(this.value)
  }

  isReadOnly(): boolean {
    // Some settings should not be modified by users
    const readOnlySettings = [
      'system.version',
      'system.build_date',
      'system.platform'
    ]
    
    return readOnlySettings.includes(this.value)
  }

  getValidationRules(): SettingValidationRule[] {
    const rules: SettingValidationRule[] = []

    // Add validation rules based on the setting key
    switch (this.value) {
      case 'system.max_context_length':
        rules.push({ type: 'range', min: 1000, max: 2000000 })
        break
      case 'system.api_timeout':
        rules.push({ type: 'range', min: 1000, max: 300000 })
        break
      case 'ui.font_size':
        rules.push({ type: 'range', min: 8, max: 32 })
        break
      case 'chat.history_limit':
        rules.push({ type: 'range', min: 10, max: 10000 })
        break
      case 'privacy.data_retention_days':
        rules.push({ type: 'range', min: 1, max: 365 })
        break
    }

    return rules
  }

  static getAllSystemKeys(): SettingKey[] {
    return [
      SettingKey.DEFAULT_MODEL,
      SettingKey.MAX_CONTEXT_LENGTH,
      SettingKey.ENABLE_STREAMING,
      SettingKey.API_TIMEOUT,
      SettingKey.DEBUG_MODE,
      SettingKey.THEME,
      SettingKey.LANGUAGE,
      SettingKey.FONT_SIZE,
      SettingKey.CHAT_HISTORY_LIMIT,
      SettingKey.AUTO_SAVE_INTERVAL,
      SettingKey.ENABLE_WEB_SEARCH,
      SettingKey.ENABLE_MCP,
      SettingKey.TELEMETRY_ENABLED,
      SettingKey.DATA_RETENTION_DAYS
    ]
  }

  static getKeysByNamespace(namespace: string): SettingKey[] {
    return SettingKey.getAllSystemKeys().filter(key => key.hasNamespace(namespace))
  }

  static isValidKeyFormat(keyString: string): boolean {
    try {
      new SettingKey(keyString)
      return true
    } catch {
      return false
    }
  }

  static createProviderKey(providerId: string, setting: string): SettingKey {
    if (!providerId.match(/^[a-z0-9_]+$/)) {
      throw new Error('Provider ID must be lowercase alphanumeric with underscores')
    }
    
    return new SettingKey(`provider.${providerId}.${setting}`)
  }

  static createMcpKey(serverId: string, setting: string): SettingKey {
    if (!serverId.match(/^[a-z0-9_]+$/)) {
      throw new Error('MCP Server ID must be lowercase alphanumeric with underscores')
    }
    
    return new SettingKey(`mcp.${serverId}.${setting}`)
  }
}

export interface SettingValidationRule {
  type: 'range' | 'enum' | 'regex' | 'length';
  min?: number;
  max?: number;
  values?: any[];
  pattern?: string;
  message?: string;
}