export type SettingTypeValue = 'string' | 'number' | 'boolean' | 'json';

export class SettingType {
  private constructor(private readonly value: SettingTypeValue) {
    this.validate(value);
  }

  static create(value: SettingTypeValue): SettingType {
    return new SettingType(value);
  }

  static readonly STRING = new SettingType('string');
  static readonly NUMBER = new SettingType('number');
  static readonly BOOLEAN = new SettingType('boolean');
  static readonly JSON = new SettingType('json');

  toString(): string {
    return this.value;
  }

  equals(other: SettingType): boolean {
    return this.value === other.value;
  }

  isString(): boolean {
    return this.value === 'string';
  }

  isNumber(): boolean {
    return this.value === 'number';
  }

  isBoolean(): boolean {
    return this.value === 'boolean';
  }

  isJson(): boolean {
    return this.value === 'json';
  }

  getDefaultValue(): any {
    switch (this.value) {
      case 'string':
        return '';
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'json':
        return {};
      default:
        return null;
    }
  }

  getExampleValue(): any {
    switch (this.value) {
      case 'string':
        return 'example string';
      case 'number':
        return 42;
      case 'boolean':
        return true;
      case 'json':
        return { example: 'value' };
      default:
        return null;
    }
  }

  getTypescriptType(): string {
    switch (this.value) {
      case 'string':
        return 'string';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'json':
        return 'object';
      default:
        return 'any';
    }
  }

  validateValue(value: any): { valid: boolean; error?: string } {
    switch (this.value) {
      case 'string':
        if (typeof value !== 'string') {
          return { valid: false, error: 'Value must be a string' };
        }
        break;
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return { valid: false, error: 'Value must be a number' };
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          return { valid: false, error: 'Value must be a boolean' };
        }
        break;
      case 'json':
        if (value === null || typeof value !== 'object') {
          return { valid: false, error: 'Value must be an object' };
        }
        break;
      default:
        return { valid: false, error: `Unknown type: ${this.value}` };
    }
    
    return { valid: true };
  }

  convertValue(value: any): any {
    switch (this.value) {
      case 'string':
        return String(value);
      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Cannot convert "${value}" to number`);
        }
        return num;
      case 'boolean':
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (lower === 'true' || lower === '1' || lower === 'yes') return true;
          if (lower === 'false' || lower === '0' || lower === 'no') return false;
        }
        if (typeof value === 'number') {
          return value !== 0;
        }
        throw new Error(`Cannot convert "${value}" to boolean`);
      case 'json':
        if (typeof value === 'object') return value;
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            throw new Error(`Cannot parse "${value}" as JSON`);
          }
        }
        throw new Error(`Cannot convert "${value}" to object`);
      default:
        return value;
    }
  }

  serializeValue(value: any): string {
    switch (this.value) {
      case 'string':
        return String(value);
      case 'number':
        return String(value);
      case 'boolean':
        return String(value);
      case 'json':
        return JSON.stringify(value);
      default:
        return String(value);
    }
  }

  deserializeValue(serializedValue: string): any {
    switch (this.value) {
      case 'string':
        return serializedValue;
      case 'number':
        const num = Number(serializedValue);
        if (isNaN(num)) {
          throw new Error(`Cannot deserialize "${serializedValue}" as number`);
        }
        return num;
      case 'boolean':
        const lower = serializedValue.toLowerCase();
        if (lower === 'true') return true;
        if (lower === 'false') return false;
        throw new Error(`Cannot deserialize "${serializedValue}" as boolean`);
      case 'json':
        try {
          return JSON.parse(serializedValue);
        } catch {
          throw new Error(`Cannot deserialize "${serializedValue}" as JSON`);
        }
      default:
        return serializedValue;
    }
  }

  static fromString(value: string): SettingType {
    switch (value.toLowerCase()) {
      case 'string':
        return SettingType.STRING;
      case 'number':
        return SettingType.NUMBER;
      case 'boolean':
        return SettingType.BOOLEAN;
      case 'json':
        return SettingType.JSON;
      default:
        throw new Error(`Invalid setting type: ${value}`);
    }
  }

  private validate(value: SettingTypeValue): void {
    const validTypes: SettingTypeValue[] = ['string', 'number', 'boolean', 'json'];
    if (!validTypes.includes(value)) {
      throw new Error(`Invalid setting type: ${value}. Must be one of: ${validTypes.join(', ')}`);
    }
  }
}