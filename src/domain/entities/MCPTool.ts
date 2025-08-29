import { MCPToolId } from '../value-objects/MCPToolId';
import { MCPServerId } from '../value-objects/MCPServerId';
import { ToolSchema } from '../value-objects/ToolSchema';

export class MCPTool {
  constructor(
    public readonly id: MCPToolId,
    public readonly serverId: MCPServerId,
    public readonly name: string,
    public readonly schema: ToolSchema,
    private _isEnabled: boolean = true,
    private _consentRequired: boolean = false,
    public readonly description?: string
  ) {
    if (!name.trim()) {
      throw new Error('Tool name cannot be empty')
    }
    if (name.length > 100) {
      throw new Error('Tool name cannot exceed 100 characters')
    }
    if (!/^[a-zA-Z0-9_\-.:]+$/.test(name)) {
      throw new Error('Tool name contains invalid characters. Only alphanumeric, underscore, dash, dot and colon are allowed')
    }
    if (description && description.length > 500) {
      throw new Error('Tool description cannot exceed 500 characters')
    }
  }

  getName(): string {
    return this.name
  }

  getDescription(): string {
    return this.description || ''
  }

  getSchema(): ToolSchema {
    return this.schema
  }

  isEnabled(): boolean {
    return this._isEnabled
  }

  requiresConsent(): boolean {
    return this._consentRequired
  }

  enable(): void {
    this._isEnabled = true
  }

  disable(): void {
    this._isEnabled = false
  }

  setConsentRequired(required: boolean): void {
    this._consentRequired = required
  }

  canExecute(): boolean {
    return this._isEnabled
  }

  validateInput(input: any): { valid: boolean; errors: string[] } {
    return this.schema.validateInput(input)
  }

  generateExampleInput(): any {
    return this.schema.generateExample()
  }

  getInputPropertyNames(): string[] {
    return this.schema.getPropertyNames()
  }

  getRequiredProperties(): readonly string[] {
    return this.schema.getRequiredProperties()
  }

  hasComplexSchema(): boolean {
    return !this.schema.isSimpleSchema()
  }

  getSchemaDescription(): string {
    return this.schema.toString()
  }

  belongsToServer(serverId: MCPServerId): boolean {
    return this.serverId.equals(serverId)
  }

  matchesSearchTerm(searchTerm: string): boolean {
    const term = searchTerm.toLowerCase()
    return (
      this.name.toLowerCase().includes(term) ||
      this.getDescription().toLowerCase().includes(term) ||
      this.getSchemaDescription().toLowerCase().includes(term)
    )
  }

  clone(): MCPTool {
    return new MCPTool(
      this.id,
      this.serverId,
      this.name,
      this.schema,
      this._isEnabled,
      this._consentRequired,
      this.description
    )
  }

  equals(other: MCPTool): boolean {
    return (
      this.id.equals(other.id) &&
      this.serverId.equals(other.serverId) &&
      this.name === other.name &&
      this.schema.equals(other.schema) &&
      this._isEnabled === other._isEnabled &&
      this._consentRequired === other._consentRequired &&
      this.description === other.description
    )
  }

  toString(): string {
    const status = this._isEnabled ? '✓' : '✗'
    const consent = this._consentRequired ? '⚠' : ''
    return `[${status}${consent}] ${this.name} - ${this.getSchemaDescription()}`
  }

  toJSON(): {
    id: string;
    serverId: string;
    name: string;
    schema: ReturnType<ToolSchema['toJSON']>;
    isEnabled: boolean;
    consentRequired: boolean;
    description?: string;
  } {
    return {
      id: this.id.toString(),
      serverId: this.serverId.toString(),
      name: this.name,
      schema: this.schema.toJSON(),
      isEnabled: this._isEnabled,
      consentRequired: this._consentRequired,
      ...(this.description && { description: this.description })
    }
  }

  static create(
    serverId: MCPServerId,
    name: string,
    schema: ToolSchema,
    description?: string
  ): MCPTool {
    const id = MCPToolId.fromString(`${serverId.toString()}:${name}`)
    return new MCPTool(
      id,
      serverId,
      name,
      schema,
      true,
      false,
      description
    )
  }

  static createWithConsent(
    serverId: MCPServerId,
    name: string,
    schema: ToolSchema,
    description?: string
  ): MCPTool {
    const tool = MCPTool.create(serverId, name, schema, description)
    tool.setConsentRequired(true)
    return tool
  }
}