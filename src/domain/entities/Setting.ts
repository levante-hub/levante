import { SettingKey, SettingValidationRule } from '../value-objects/SettingKey';
import { SettingType } from '../value-objects/SettingType';
import { Timestamp } from '../value-objects/Timestamp';

export class Setting {
  constructor(
    public readonly key: SettingKey,
    public readonly type: SettingType,
    private _value: any,
    private _updatedAt: Timestamp = Timestamp.now()
  ) {
    this.validateAndSetValue(_value);
  }

  getValue(): any {
    return this._value;
  }

  getSerializedValue(): string {
    return this.type.serializeValue(this._value);
  }

  getUpdatedAt(): Timestamp {
    return this._updatedAt;
  }

  setValue(newValue: any): void {
    if (this.key.isReadOnly()) {
      throw new Error(`Setting ${this.key.toString()} is read-only and cannot be modified`);
    }

    this.validateAndSetValue(newValue);
    this._updatedAt = Timestamp.now();
  }

  updateFromSerializedValue(serializedValue: string): void {
    if (this.key.isReadOnly()) {
      throw new Error(`Setting ${this.key.toString()} is read-only and cannot be modified`);
    }

    try {
      const deserializedValue = this.type.deserializeValue(serializedValue);
      this.validateAndSetValue(deserializedValue);
      this._updatedAt = Timestamp.now();
    } catch (error) {
      throw new Error(`Failed to update setting from serialized value: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  resetToDefault(): void {
    if (this.key.isReadOnly()) {
      throw new Error(`Setting ${this.key.toString()} is read-only and cannot be reset`);
    }

    const defaultValue = this.getDefaultValue();
    this.setValue(defaultValue);
  }

  getDefaultValue(): any {
    // Get default based on specific setting key
    switch (this.key.toString()) {
      case 'system.default_model':
        return 'openai/gpt-4o';
      case 'system.max_context_length':
        return 128000;
      case 'system.enable_streaming':
        return true;
      case 'system.api_timeout':
        return 30000;
      case 'system.debug_mode':
        return false;
      case 'ui.theme':
        return 'system';
      case 'ui.language':
        return 'en';
      case 'ui.font_size':
        return 14;
      case 'chat.history_limit':
        return 1000;
      case 'chat.auto_save_interval':
        return 30000;
      case 'features.enable_web_search':
        return false;
      case 'features.enable_mcp':
        return true;
      case 'privacy.telemetry_enabled':
        return false;
      case 'privacy.data_retention_days':
        return 90;
      default:
        return this.type.getDefaultValue();
    }
  }

  isDefaultValue(): boolean {
    const defaultValue = this.getDefaultValue();
    
    if (this.type.isJson()) {
      return JSON.stringify(this._value) === JSON.stringify(defaultValue);
    }
    
    return this._value === defaultValue;
  }

  isRequired(): boolean {
    return this.key.isRequired();
  }

  isReadOnly(): boolean {
    return this.key.isReadOnly();
  }

  getDisplayName(): string {
    return this.key.getDisplayName();
  }

  getCategory(): string {
    return this.key.getCategory();
  }

  getTypescriptType(): string {
    return this.type.getTypescriptType();
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Type validation
    const typeValidation = this.type.validateValue(this._value);
    if (!typeValidation.valid && typeValidation.error) {
      errors.push(typeValidation.error);
    }

    // Key-specific validation rules
    const validationRules = this.key.getValidationRules();
    
    for (const rule of validationRules) {
      const ruleValidation = this.validateRule(rule);
      if (!ruleValidation.valid && ruleValidation.error) {
        errors.push(ruleValidation.error);
      }
    }

    // Custom business logic validation
    const businessValidation = this.validateBusinessRules();
    errors.push(...businessValidation);

    return { valid: errors.length === 0, errors };
  }

  canBeDeleted(): boolean {
    return !this.isRequired() && !this.isReadOnly();
  }

  getExampleValue(): any {
    // Provide realistic examples for known settings
    switch (this.key.toString()) {
      case 'system.default_model':
        return 'openai/gpt-4o';
      case 'ui.theme':
        return 'dark';
      case 'ui.language':
        return 'es';
      case 'system.debug_mode':
        return true;
      default:
        return this.type.getExampleValue();
    }
  }

  hasChangedSince(timestamp: Timestamp): boolean {
    return this._updatedAt.isAfter(timestamp);
  }

  hasChangedInLastMinutes(minutes: number): boolean {
    const cutoff = Timestamp.now().subtractMinutes(minutes);
    return this._updatedAt.isAfter(cutoff);
  }

  getValueAsString(): string {
    if (this.type.isString()) {
      return this._value as string;
    }
    return this.getSerializedValue();
  }

  getValueAsNumber(): number {
    if (!this.type.isNumber()) {
      throw new Error('Setting is not a number type');
    }
    return this._value as number;
  }

  getValueAsBoolean(): boolean {
    if (!this.type.isBoolean()) {
      throw new Error('Setting is not a boolean type');
    }
    return this._value as boolean;
  }

  getValueAsJson(): object {
    if (!this.type.isJson()) {
      throw new Error('Setting is not a JSON type');
    }
    return this._value as object;
  }

  clone(): Setting {
    return new Setting(
      this.key,
      this.type,
      this._value,
      this._updatedAt
    );
  }

  equals(other: Setting): boolean {
    if (!this.key.equals(other.key) || !this.type.equals(other.type)) {
      return false;
    }

    if (this.type.isJson()) {
      return JSON.stringify(this._value) === JSON.stringify(other._value);
    }

    return this._value === other._value;
  }

  toString(): string {
    return `${this.key.toString()} = ${this.getSerializedValue()} (${this.type.toString()})`;
  }

  toJSON(): {
    key: string;
    type: string;
    value: any;
    serializedValue: string;
    updatedAt: string;
    isDefault: boolean;
    isRequired: boolean;
    isReadOnly: boolean;
  } {
    return {
      key: this.key.toString(),
      type: this.type.toString(),
      value: this._value,
      serializedValue: this.getSerializedValue(),
      updatedAt: this._updatedAt.toISOString(),
      isDefault: this.isDefaultValue(),
      isRequired: this.isRequired(),
      isReadOnly: this.isReadOnly()
    };
  }

  private validateAndSetValue(value: any): void {
    const validation = this.validate();
    
    // Temporarily set the value for validation
    const originalValue = this._value;
    this._value = value;
    
    const newValidation = this.validate();
    
    if (!newValidation.valid) {
      // Restore original value if validation fails
      this._value = originalValue;
      throw new Error(`Invalid value for setting ${this.key.toString()}: ${newValidation.errors.join(', ')}`);
    }

    // Convert the value to the appropriate type
    try {
      this._value = this.type.convertValue(value);
    } catch (error) {
      this._value = originalValue;
      throw new Error(`Failed to convert value for setting ${this.key.toString()}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private validateRule(rule: SettingValidationRule): { valid: boolean; error?: string } {
    switch (rule.type) {
      case 'range':
        if (this.type.isNumber()) {
          const num = this._value as number;
          if (rule.min !== undefined && num < rule.min) {
            return { valid: false, error: rule.message || `Value must be at least ${rule.min}` };
          }
          if (rule.max !== undefined && num > rule.max) {
            return { valid: false, error: rule.message || `Value must be at most ${rule.max}` };
          }
        }
        break;

      case 'enum':
        if (rule.values && !rule.values.includes(this._value)) {
          return { valid: false, error: rule.message || `Value must be one of: ${rule.values.join(', ')}` };
        }
        break;

      case 'length':
        if (this.type.isString()) {
          const str = this._value as string;
          if (rule.min !== undefined && str.length < rule.min) {
            return { valid: false, error: rule.message || `Length must be at least ${rule.min} characters` };
          }
          if (rule.max !== undefined && str.length > rule.max) {
            return { valid: false, error: rule.message || `Length must be at most ${rule.max} characters` };
          }
        }
        break;

      case 'regex':
        if (this.type.isString() && rule.pattern) {
          const str = this._value as string;
          const regex = new RegExp(rule.pattern);
          if (!regex.test(str)) {
            return { valid: false, error: rule.message || 'Value does not match required pattern' };
          }
        }
        break;
    }

    return { valid: true };
  }

  private validateBusinessRules(): string[] {
    const errors: string[] = [];

    // Custom business logic validation
    switch (this.key.toString()) {
      case 'system.default_model':
        if (this.type.isString()) {
          const model = this._value as string;
          if (!model.includes('/')) {
            errors.push('Model must be in format provider/model_name');
          }
        }
        break;

      case 'ui.theme':
        if (this.type.isString()) {
          const theme = this._value as string;
          const validThemes = ['light', 'dark', 'system'];
          if (!validThemes.includes(theme)) {
            errors.push(`Theme must be one of: ${validThemes.join(', ')}`);
          }
        }
        break;

      case 'ui.language':
        if (this.type.isString()) {
          const lang = this._value as string;
          if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(lang)) {
            errors.push('Language must be in format: en, es, en-US, etc.');
          }
        }
        break;
    }

    return errors;
  }

  static create(key: SettingKey, type: SettingType, value?: any): Setting {
    const setting = new Setting(key, type, type.getDefaultValue());
    
    if (value !== undefined) {
      setting.setValue(value);
    } else {
      // Set to actual default for this specific key
      setting.setValue(setting.getDefaultValue());
    }
    
    return setting;
  }

  static fromSerialized(keyString: string, typeString: string, serializedValue: string, updatedAt?: string): Setting {
    const key = SettingKey.fromString(keyString);
    const type = SettingType.fromString(typeString);
    const value = type.deserializeValue(serializedValue);
    const timestamp = updatedAt ? Timestamp.fromISOString(updatedAt) : Timestamp.now();
    
    return new Setting(key, type, value, timestamp);
  }

  static createSystemDefaults(): Setting[] {
    const settings: Setting[] = [];

    // System settings
    settings.push(Setting.create(SettingKey.DEFAULT_MODEL, SettingType.STRING));
    settings.push(Setting.create(SettingKey.MAX_CONTEXT_LENGTH, SettingType.NUMBER));
    settings.push(Setting.create(SettingKey.ENABLE_STREAMING, SettingType.BOOLEAN));
    settings.push(Setting.create(SettingKey.API_TIMEOUT, SettingType.NUMBER));
    settings.push(Setting.create(SettingKey.DEBUG_MODE, SettingType.BOOLEAN));

    // UI settings
    settings.push(Setting.create(SettingKey.THEME, SettingType.STRING));
    settings.push(Setting.create(SettingKey.LANGUAGE, SettingType.STRING));
    settings.push(Setting.create(SettingKey.FONT_SIZE, SettingType.NUMBER));

    // Chat settings
    settings.push(Setting.create(SettingKey.CHAT_HISTORY_LIMIT, SettingType.NUMBER));
    settings.push(Setting.create(SettingKey.AUTO_SAVE_INTERVAL, SettingType.NUMBER));

    // Feature settings
    settings.push(Setting.create(SettingKey.ENABLE_WEB_SEARCH, SettingType.BOOLEAN));
    settings.push(Setting.create(SettingKey.ENABLE_MCP, SettingType.BOOLEAN));

    // Privacy settings
    settings.push(Setting.create(SettingKey.TELEMETRY_ENABLED, SettingType.BOOLEAN));
    settings.push(Setting.create(SettingKey.DATA_RETENTION_DAYS, SettingType.NUMBER));

    return settings;
  }
}