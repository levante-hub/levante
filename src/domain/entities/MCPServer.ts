import { MCPServerId } from '../value-objects/MCPServerId';
import { ServerEndpoint } from '../value-objects/ServerEndpoint';
import { MCPTool } from './MCPTool';
import { MCPToolId } from '../value-objects/MCPToolId';
import { ToolSchema } from '../value-objects/ToolSchema';

export interface ServerStatus {
  isRunning: boolean;
  lastPing?: Date;
  error?: string;
  uptime?: number;
}

export class MCPServer {
  private _tools: MCPTool[] = [];
  private _status: ServerStatus = { isRunning: false };

  constructor(
    public readonly id: MCPServerId,
    public readonly name: string,
    public readonly endpoint: ServerEndpoint,
    private _isEnabled: boolean = true,
    public readonly createdAt: Date = new Date(),
    public readonly description?: string,
    public readonly version?: string
  ) {
    if (!name.trim()) {
      throw new Error('Server name cannot be empty')
    }
    if (name.length > 100) {
      throw new Error('Server name cannot exceed 100 characters')
    }
    if (description && description.length > 500) {
      throw new Error('Server description cannot exceed 500 characters')
    }
    if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
      throw new Error('Version must follow semantic versioning (e.g., 1.0.0)')
    }
  }

  getName(): string {
    return this.name
  }

  getDescription(): string {
    return this.description || ''
  }

  getVersion(): string {
    return this.version || '1.0.0'
  }

  getEndpoint(): ServerEndpoint {
    return this.endpoint
  }

  isEnabled(): boolean {
    return this._isEnabled
  }

  getStatus(): ServerStatus {
    return { ...this._status }
  }

  isRunning(): boolean {
    return this._status.isRunning
  }

  getTools(): readonly MCPTool[] {
    return [...this._tools]
  }

  getEnabledTools(): readonly MCPTool[] {
    return this._tools.filter(tool => tool.isEnabled())
  }

  getToolsRequiringConsent(): readonly MCPTool[] {
    return this._tools.filter(tool => tool.requiresConsent())
  }

  getToolCount(): number {
    return this._tools.length
  }

  getEnabledToolCount(): number {
    return this._tools.filter(tool => tool.isEnabled()).length
  }

  hasTools(): boolean {
    return this._tools.length > 0
  }

  enable(): void {
    this._isEnabled = true
  }

  disable(): void {
    this._isEnabled = false
    this._status = { isRunning: false }
  }

  updateStatus(status: Partial<ServerStatus>): void {
    this._status = { ...this._status, ...status }
  }

  markAsRunning(): void {
    this._status = {
      isRunning: true,
      lastPing: new Date(),
      error: undefined,
      uptime: this._status.uptime || 0
    }
  }

  markAsStopped(error?: string): void {
    this._status = {
      isRunning: false,
      lastPing: this._status.lastPing,
      error,
      uptime: undefined
    }
  }

  addTool(tool: MCPTool): void {
    if (!tool.belongsToServer(this.id)) {
      throw new Error('Tool must belong to this server')
    }

    const existingIndex = this._tools.findIndex(t => t.id.equals(tool.id))
    if (existingIndex >= 0) {
      this._tools[existingIndex] = tool
    } else {
      if (this._tools.length >= 100) {
        throw new Error('Server cannot have more than 100 tools')
      }
      this._tools.push(tool)
    }
  }

  removeTool(toolId: MCPToolId): boolean {
    const initialLength = this._tools.length
    this._tools = this._tools.filter(tool => !tool.id.equals(toolId))
    return this._tools.length < initialLength
  }

  getTool(toolId: MCPToolId): MCPTool | null {
    return this._tools.find(tool => tool.id.equals(toolId)) || null
  }

  getToolByName(name: string): MCPTool | null {
    return this._tools.find(tool => tool.getName() === name) || null
  }

  enableTool(toolId: MCPToolId): boolean {
    const tool = this.getTool(toolId)
    if (!tool) {
      return false
    }
    
    tool.enable()
    return true
  }

  disableTool(toolId: MCPToolId): boolean {
    const tool = this.getTool(toolId)
    if (!tool) {
      return false
    }
    
    tool.disable()
    return true
  }

  enableAllTools(): void {
    this._tools.forEach(tool => tool.enable())
  }

  disableAllTools(): void {
    this._tools.forEach(tool => tool.disable())
  }

  setToolConsentRequired(toolId: MCPToolId, required: boolean): boolean {
    const tool = this.getTool(toolId)
    if (!tool) {
      return false
    }
    
    tool.setConsentRequired(required)
    return true
  }

  syncTools(tools: MCPTool[]): void {
    // Preserve enabled/disabled state and consent settings
    const currentSettings = new Map<string, { enabled: boolean; consentRequired: boolean }>()
    
    this._tools.forEach(tool => {
      currentSettings.set(tool.getName(), {
        enabled: tool.isEnabled(),
        consentRequired: tool.requiresConsent()
      })
    })

    // Update tools while preserving settings
    this._tools = tools.map(tool => {
      const settings = currentSettings.get(tool.getName())
      if (settings) {
        if (!settings.enabled) {
          tool.disable()
        }
        tool.setConsentRequired(settings.consentRequired)
      }
      return tool
    })
  }

  searchTools(searchTerm: string): readonly MCPTool[] {
    if (!searchTerm.trim()) {
      return this.getTools()
    }
    
    return this._tools.filter(tool => tool.matchesSearchTerm(searchTerm))
  }

  canStart(): boolean {
    return this._isEnabled && !this._status.isRunning && this.endpoint.isExecutable()
  }

  canStop(): boolean {
    return this._status.isRunning
  }

  requiresRestart(): boolean {
    return this._status.error !== undefined && this._isEnabled
  }

  getHealthScore(): number {
    if (!this._isEnabled) return 0
    if (!this._status.isRunning) return 0.2
    if (this._status.error) return 0.5
    
    const toolsHealth = this.hasTools() ? 1 : 0.8
    const uptimeHealth = this._status.uptime ? Math.min(this._status.uptime / 3600, 1) : 0.5
    
    return (toolsHealth + uptimeHealth) / 2
  }

  validateConfiguration(): string[] {
    const errors: string[] = []
    
    if (!this._isEnabled) {
      return errors
    }
    
    if (!this.endpoint.isExecutable()) {
      errors.push('Server endpoint is not executable')
    }
    
    if (!this.hasTools() && this._status.isRunning) {
      errors.push('Running server has no tools available')
    }
    
    return errors
  }

  equals(other: MCPServer): boolean {
    return (
      this.id.equals(other.id) &&
      this.name === other.name &&
      this.endpoint.equals(other.endpoint) &&
      this._isEnabled === other._isEnabled &&
      this.description === other.description &&
      this.version === other.version &&
      this._tools.length === other._tools.length &&
      this._tools.every((tool, index) => tool.equals(other._tools[index]))
    )
  }

  clone(): MCPServer {
    const cloned = new MCPServer(
      this.id,
      this.name,
      this.endpoint,
      this._isEnabled,
      this.createdAt,
      this.description,
      this.version
    )
    
    cloned._status = { ...this._status }
    this._tools.forEach(tool => {
      cloned.addTool(tool.clone())
    })
    
    return cloned
  }

  toString(): string {
    const status = this._status.isRunning ? '●' : '○'
    const enabled = this._isEnabled ? '' : ' (disabled)'
    const toolCount = this.getEnabledToolCount()
    return `${status} ${this.name} (${toolCount} tools)${enabled}`
  }

  toJSON(): {
    id: string;
    name: string;
    endpoint: ReturnType<ServerEndpoint['toJSON']>;
    isEnabled: boolean;
    status: ServerStatus;
    createdAt: string;
    description?: string;
    version?: string;
    tools: ReturnType<MCPTool['toJSON']>[];
  } {
    return {
      id: this.id.toString(),
      name: this.name,
      endpoint: this.endpoint.toJSON(),
      isEnabled: this._isEnabled,
      status: this._status,
      createdAt: this.createdAt.toISOString(),
      ...(this.description && { description: this.description }),
      ...(this.version && { version: this.version }),
      tools: this._tools.map(tool => tool.toJSON())
    }
  }

  static create(
    name: string,
    endpoint: ServerEndpoint,
    description?: string,
    version?: string
  ): MCPServer {
    return new MCPServer(
      MCPServerId.generate(),
      name,
      endpoint,
      true,
      new Date(),
      description,
      version
    )
  }

  static createWithTools(
    name: string,
    endpoint: ServerEndpoint,
    toolDefinitions: Array<{
      name: string;
      schema: ToolSchema;
      description?: string;
      requiresConsent?: boolean;
    }>,
    description?: string,
    version?: string
  ): MCPServer {
    const server = MCPServer.create(name, endpoint, description, version)
    
    toolDefinitions.forEach(toolDef => {
      const tool = MCPTool.create(
        server.id,
        toolDef.name,
        toolDef.schema,
        toolDef.description
      )
      
      if (toolDef.requiresConsent) {
        tool.setConsentRequired(true)
      }
      
      server.addTool(tool)
    })
    
    return server
  }
}