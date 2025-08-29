export class SettingType {
  private static readonly VALID_TYPES = ['string', 'number', 'boolean', 'json'] as const;
  
  public static readonly STRING = new SettingType('string');
  public static readonly NUMBER = new SettingType('number');
  public static readonly BOOLEAN = new SettingType('boolean');
  public static readonly JSON = new SettingType('json');

  constructor(private readonly value: (typeof SettingType.VALID_TYPES)[number]) {
    if (!SettingType.VALID_TYPES.includes(value)) {
      throw new Error(`Invalid setting type: ${value}. Valid types are: ${SettingType.VALID_TYPES.join(', ')}`)
    }
  }

  toString(): string {
    return this.value
  }

  equals(other: SettingType): boolean {
    return this.value === other.value
  }

  static fromString(value: string): SettingType {
    const type = value.toLowerCase() as (typeof SettingType.VALID_TYPES)[number]
    return new SettingType(type)
  }

  static getValidTypes(): readonly string[] {
    return [...SettingType.VALID_TYPES]
  }

  isString(): boolean {
    return this.value === 'string'
  }

  isNumber(): boolean {
    return this.value === 'number'
  }

  isBoolean(): boolean {
    return this.value === 'boolean'
  }

  isJson(): boolean {
    return this.value === 'json'
  }

  validateValue(value: any): { valid: boolean; error?: string } {
    switch (this.value) {
      case 'string':
        if (typeof value !== 'string') {
          return { valid: false, error: 'Value must be a string' }
        }
        return { valid: true }

      case 'number':
        const num = typeof value === 'string' ? parseFloat(value) : value
        if (typeof num !== 'number' || isNaN(num)) {
          return { valid: false, error: 'Value must be a valid number' }
        }
        return { valid: true }

      case 'boolean':
        if (typeof value === 'boolean') {
          return { valid: true }
        }
        if (typeof value === 'string') {
          const lowerValue = value.toLowerCase()
          if (['true', 'false', '1', '0', 'yes', 'no'].includes(lowerValue)) {
            return { valid: true }
          }
        }
        return { valid: false, error: 'Value must be a boolean or boolean-like string' }

      case 'json':
        if (typeof value === 'object' && value !== null) {
          return { valid: true }
        }
        if (typeof value === 'string') {
          try {
            JSON.parse(value)
            return { valid: true }
          } catch {
            return { valid: false, error: 'Value must be valid JSON' }
          }
        }
        return { valid: false, error: 'Value must be a valid JSON object or string' }

      default:
        return { valid: false, error: 'Unknown setting type' }
    }
  }

  convertValue(value: any): any {
    const validation = this.validateValue(value)
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid value')
    }

    switch (this.value) {
      case 'string':
        return String(value)

      case 'number':
        return typeof value === 'string' ? parseFloat(value) : Number(value)

      case 'boolean':
        if (typeof value === 'boolean') {
          return value
        }
        if (typeof value === 'string') {
          const lowerValue = value.toLowerCase()
          return ['true', '1', 'yes'].includes(lowerValue)
        }
        return Boolean(value)

      case 'json':
        if (typeof value === 'object' && value !== null) {
          return value
        }
        return JSON.parse(value as string)

      default:
        return value
    }
  }

  serializeValue(value: any): string {
    const validation = this.validateValue(value)
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid value for serialization')
    }

    switch (this.value) {
      case 'string':
        return String(value)

      case 'number':
        const num = typeof value === 'string' ? parseFloat(value) : value
        return num.toString()

      case 'boolean':
        const bool = this.convertValue(value)
        return bool.toString()

      case 'json':
        const obj = this.convertValue(value)
        return JSON.stringify(obj)

      default:
        return String(value)
    }
  }

  deserializeValue(serializedValue: string): any {
    switch (this.value) {
      case 'string':
        return serializedValue

      case 'number':
        const num = parseFloat(serializedValue)
        if (isNaN(num)) {
          throw new Error('Cannot deserialize invalid number')
        }
        return num

      case 'boolean':
        const lowerValue = serializedValue.toLowerCase()
        return ['true', '1', 'yes'].includes(lowerValue)

      case 'json':
        try {
          return JSON.parse(serializedValue)
        } catch {
          throw new Error('Cannot deserialize invalid JSON')
        }

      default:
        return serializedValue
    }
  }

  getDefaultValue(): any {
    switch (this.value) {
      case 'string':
        return ''
      case 'number':
        return 0
      case 'boolean':
        return false
      case 'json':
        return {}
      default:
        return null
    }
  }

  getExampleValue(): any {
    switch (this.value) {
      case 'string':
        return 'example_value'
      case 'number':
        return 42
      case 'boolean':
        return true
      case 'json':
        return { example: 'value', nested: { key: 123 } }
      default:
        return null
    }
  }

  getTypescriptType(): string {
    switch (this.value) {
      case 'string':
        return 'string'
      case 'number':
        return 'number'
      case 'boolean':
        return 'boolean'
      case 'json':
        return 'object'
      default:
        return 'any'
    }
  }
}