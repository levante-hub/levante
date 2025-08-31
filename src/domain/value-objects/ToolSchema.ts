export interface JSONSchemaProperty {
  type: string;
  description?: string;
  enum?: any[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  default?: any;
  examples?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
}

export interface JSONSchemaDefinition {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  description?: string;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JSONSchemaProperty;
  examples?: any[];
}

export class ToolSchema {
  constructor(private readonly schema: JSONSchemaDefinition) {
    this.validateSchema(schema)
  }

  getSchema(): Readonly<JSONSchemaDefinition> {
    return JSON.parse(JSON.stringify(this.schema))
  }

  getDescription(): string {
    return this.schema.description || ''
  }

  getType(): string {
    return this.schema.type
  }

  getProperties(): Readonly<Record<string, JSONSchemaProperty>> {
    return this.schema.properties ? JSON.parse(JSON.stringify(this.schema.properties)) : {}
  }

  getRequiredProperties(): readonly string[] {
    return this.schema.required || []
  }

  hasProperty(propertyName: string): boolean {
    return !!(this.schema.properties && this.schema.properties[propertyName])
  }

  getProperty(propertyName: string): JSONSchemaProperty | null {
    if (!this.schema.properties || !this.schema.properties[propertyName]) {
      return null
    }
    return JSON.parse(JSON.stringify(this.schema.properties[propertyName]))
  }

  isPropertyRequired(propertyName: string): boolean {
    return this.getRequiredProperties().includes(propertyName)
  }

  validateInput(input: any): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (this.schema.type === 'object') {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        errors.push('Input must be an object')
        return { valid: false, errors }
      }

      // Check required properties
      const required = this.getRequiredProperties()
      for (const prop of required) {
        if (!(prop in input)) {
          errors.push(`Missing required property: ${prop}`)
        }
      }

      // Validate properties
      if (this.schema.properties) {
        for (const [propName, propSchema] of Object.entries(this.schema.properties)) {
          if (propName in input) {
            const propErrors = this.validateProperty(input[propName], propSchema, propName)
            errors.push(...propErrors)
          }
        }
      }

      // Check for additional properties if not allowed
      if (this.schema.additionalProperties === false) {
        const allowedProps = new Set(Object.keys(this.schema.properties || {}))
        for (const prop of Object.keys(input)) {
          if (!allowedProps.has(prop)) {
            errors.push(`Additional property not allowed: ${prop}`)
          }
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }

  generateExample(): any {
    if (this.schema.examples && this.schema.examples.length > 0) {
      return JSON.parse(JSON.stringify(this.schema.examples[0]))
    }

    return this.generateExampleForType(this.schema)
  }

  getPropertyNames(): string[] {
    return Object.keys(this.schema.properties || {})
  }

  getRequiredPropertyCount(): number {
    return this.getRequiredProperties().length
  }

  getOptionalPropertyCount(): number {
    return this.getPropertyNames().length - this.getRequiredPropertyCount()
  }

  isSimpleSchema(): boolean {
    const props = this.getPropertyNames()
    return props.length <= 3 && this.getRequiredPropertyCount() <= 2
  }

  equals(other: ToolSchema): boolean {
    return JSON.stringify(this.schema) === JSON.stringify(other.schema)
  }

  toString(): string {
    const props = this.getPropertyNames()
    const required = this.getRequiredProperties()
    const reqCount = required.length
    const optCount = this.getOptionalPropertyCount()
    
    if (props.length === 0) {
      return 'No parameters'
    }
    
    return `${reqCount} required, ${optCount} optional parameters`
  }

  toJSON(): JSONSchemaDefinition {
    return JSON.parse(JSON.stringify(this.schema))
  }

  private validateSchema(schema: JSONSchemaDefinition): void {
    if (!schema) {
      throw new Error('Schema cannot be null or undefined')
    }

    if (!schema.type) {
      throw new Error('Schema must have a type')
    }

    const validTypes = ['object', 'array', 'string', 'number', 'boolean', 'null']
    if (!validTypes.includes(schema.type)) {
      throw new Error(`Invalid schema type: ${schema.type}`)
    }

    if (schema.type === 'object' && schema.properties) {
      const propCount = Object.keys(schema.properties).length
      if (propCount > 50) {
        throw new Error('Schema cannot have more than 50 properties')
      }

      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propName.length > 100) {
          throw new Error(`Property name too long: ${propName}`)
        }
        this.validatePropertySchema(propSchema, propName)
      }
    }

    if (schema.required && schema.required.length > 20) {
      throw new Error('Cannot have more than 20 required properties')
    }
  }

  private validatePropertySchema(propSchema: JSONSchemaProperty, propName: string): void {
    if (!propSchema.type) {
      throw new Error(`Property ${propName} must have a type`)
    }

    if (propSchema.description && propSchema.description.length > 500) {
      throw new Error(`Property ${propName} description too long`)
    }

    if (propSchema.enum && propSchema.enum.length > 100) {
      throw new Error(`Property ${propName} enum has too many values`)
    }
  }

  private validateProperty(value: any, schema: JSONSchemaProperty, propName: string): string[] {
    const errors: string[] = []

    // Type validation
    const expectedType = schema.type
    const actualType = Array.isArray(value) ? 'array' : typeof value

    if (expectedType === 'integer' && actualType === 'number') {
      if (!Number.isInteger(value)) {
        errors.push(`${propName} must be an integer`)
      }
    } else if (expectedType !== actualType) {
      errors.push(`${propName} must be of type ${expectedType}, got ${actualType}`)
    }

    // String validations
    if (expectedType === 'string' && typeof value === 'string') {
      if (schema.minLength && value.length < schema.minLength) {
        errors.push(`${propName} must be at least ${schema.minLength} characters`)
      }
      if (schema.maxLength && value.length > schema.maxLength) {
        errors.push(`${propName} must be at most ${schema.maxLength} characters`)
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        errors.push(`${propName} does not match required pattern`)
      }
    }

    // Number validations
    if ((expectedType === 'number' || expectedType === 'integer') && typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push(`${propName} must be at least ${schema.minimum}`)
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push(`${propName} must be at most ${schema.maximum}`)
      }
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${propName} must be one of: ${schema.enum.join(', ')}`)
    }

    return errors
  }

  private generateExampleForType(schema: JSONSchemaProperty | JSONSchemaDefinition): any {
    if ('default' in schema && schema.default !== undefined) {
      return schema.default
    }

    if (schema.examples && schema.examples.length > 0) {
      return schema.examples[0]
    }

    switch (schema.type) {
      case 'string':
        return ('enum' in schema && schema.enum) ? schema.enum[0] : 'example'
      case 'number':
      case 'integer':
        return ('minimum' in schema && typeof schema.minimum === 'number') ? schema.minimum : 0
      case 'boolean':
        return true
      case 'array':
        return schema.items ? [this.generateExampleForType(schema.items)] : []
      case 'object':
        const obj: any = {}
        if (schema.properties) {
          for (const [propName, propSchema] of Object.entries(schema.properties)) {
            obj[propName] = this.generateExampleForType(propSchema)
          }
        }
        return obj
      default:
        return null
    }
  }

  static fromJSON(schema: JSONSchemaDefinition): ToolSchema {
    return new ToolSchema(schema)
  }

  static createEmpty(): ToolSchema {
    return new ToolSchema({
      type: 'object',
      properties: {},
      additionalProperties: false
    })
  }

  static createSimple(properties: Record<string, { type: string; description?: string }>, required: string[] = []): ToolSchema {
    const schemaProperties: Record<string, JSONSchemaProperty> = {}
    
    for (const [name, config] of Object.entries(properties)) {
      schemaProperties[name] = {
        type: config.type,
        description: config.description
      }
    }

    return new ToolSchema({
      type: 'object',
      properties: schemaProperties,
      required,
      additionalProperties: false
    })
  }
}