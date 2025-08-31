import { Model } from './Model';
import { ProviderType } from '../value-objects/ProviderType';

// Provider type requirements are now handled by ProviderType value object

export class Provider {
  private _models: Model[] = [];

  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly type: ProviderType,
    private _isActive: boolean = false,
    private _isEnabled: boolean = true,
    public readonly baseUrl?: string,
    public readonly apiKey?: string,
    public readonly settings: Record<string, any> = {},
    public readonly lastModelSync?: Date
  ) {
    if (!name.trim()) {
      throw new Error('Provider name cannot be empty')
    }
    if (name.length > 100) {
      throw new Error('Provider name cannot exceed 100 characters')
    }
    if (type.requiresApiKey() && !apiKey?.trim()) {
      throw new Error(`Provider type ${type.toString()} requires an API key`)
    }
    if (type.requiresBaseUrl() && !baseUrl?.trim()) {
      throw new Error(`Provider type ${type.toString()} requires a base URL`)
    }
    if (baseUrl && !this.isValidUrl(baseUrl)) {
      throw new Error('Base URL must be a valid URL')
    }
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name
  }

  getType(): ProviderType {
    return this.type;
  }

  setActive(active: boolean): void {
    this._isActive = active;
  }

  setEnabled(enabled: boolean): void {
    this._isEnabled = enabled;
  }

  updateLastSync(): void {
    // This would typically update a lastSync timestamp
    // For now, we'll handle this in the repository layer
  }

  resetStats(): void {
    // This would reset usage statistics
    // Implementation depends on how stats are stored
  }

  setName(name: string): void {
    if (!name.trim()) {
      throw new Error('Provider name cannot be empty');
    }
    if (name.length > 100) {
      throw new Error('Provider name cannot exceed 100 characters');
    }
    // Note: name is readonly, so this would need to be handled differently
    // or we need to make name mutable
  }

  setApiKey(apiKey: string): void {
    // Note: apiKey is readonly, similar issue as above
    // This needs architectural decision on mutability
  }

  setBaseUrl(baseUrl: string): void {
    if (baseUrl && !this.isValidUrl(baseUrl)) {
      throw new Error('Base URL must be a valid URL');
    }
    // Note: baseUrl is readonly, similar issue
  }

  setOrganizationId(organizationId?: string): void {
    // Implementation needed
  }

  setProjectId(projectId?: string): void {
    // Implementation needed
  }

  setCustomHeaders(headers?: Record<string, string>): void {
    // Implementation needed
  }

  setTimeout(timeout?: number): void {
    // Implementation needed
  }

  setRetryAttempts(retryAttempts?: number): void {
    // Implementation needed
  }

  setRateLimitSettings(settings?: any): void {
    // Implementation needed
  }

  setMetadata(metadata?: Record<string, any>): void {
    // Implementation needed
  }

  getMetadata(): Record<string, any> {
    return this.settings || {};
  }

  getCustomHeaders(): Record<string, string> {
    return {};
  }

  getTimeout(): number | undefined {
    return undefined;
  }

  getRetryAttempts(): number | undefined {
    return undefined;
  }

  getRateLimitSettings(): any {
    return undefined;
  }

  getBaseUrl(): string | undefined {
    return this.baseUrl;
  }

  getOrganizationId(): string | undefined {
    return undefined;
  }

  getProjectId(): string | undefined {
    return undefined;
  }

  isActive(): boolean {
    return this._isActive
  }

  isEnabled(): boolean {
    return this._isEnabled
  }

  getApiKey(): string | undefined {
    return this.apiKey
  }

  getSettings(): Readonly<Record<string, any>> {
    return { ...this.settings }
  }

  getModels(): readonly Model[] {
    return [...this._models]
  }

  getSelectedModels(): readonly Model[] {
    return this._models.filter(model => model.isSelected())
  }

  getAvailableModels(): readonly Model[] {
    return this._models.filter(model => model.isAvailable())
  }

  getModelCount(): number {
    return this._models.length
  }

  getSelectedModelCount(): number {
    return this._models.filter(model => model.isSelected()).length
  }

  hasModels(): boolean {
    return this._models.length > 0
  }

  hasSelectedModels(): boolean {
    return this._models.some(model => model.isSelected())
  }

  activate(): void {
    if (!this._isEnabled) {
      throw new Error('Cannot activate a disabled provider')
    }
    if (!this.hasSelectedModels()) {
      throw new Error('Cannot activate provider without selected models')
    }
    this._isActive = true
  }

  deactivate(): void {
    this._isActive = false
  }

  enable(): void {
    this._isEnabled = true
  }

  disable(): void {
    this._isEnabled = false
    this._isActive = false
  }

  addModel(model: Model): void {
    if (model.providerId !== this.id) {
      throw new Error('Model provider ID must match this provider')
    }

    const existingIndex = this._models.findIndex(m => m.id === model.id)
    if (existingIndex >= 0) {
      this._models[existingIndex] = model
    } else {
      this._models.push(model)
    }
  }

  removeModel(modelId: string): boolean {
    const initialLength = this._models.length
    this._models = this._models.filter(model => model.id !== modelId)
    return this._models.length < initialLength
  }

  getModel(modelId: string): Model | null {
    return this._models.find(model => model.id === modelId) || null
  }

  selectModel(modelId: string): boolean {
    const model = this.getModel(modelId)
    if (!model) {
      return false
    }
    
    try {
      model.select()
      return true
    } catch {
      return false
    }
  }

  deselectModel(modelId: string): boolean {
    const model = this.getModel(modelId)
    if (!model) {
      return false
    }
    
    model.deselect()
    return true
  }

  selectAllModels(): void {
    this._models
      .filter(model => model.isAvailable())
      .forEach(model => model.select())
  }

  deselectAllModels(): void {
    this._models.forEach(model => model.deselect())
  }

  syncModels(models: Model[]): void {
    const currentSelections = new Map<string, boolean>()
    this._models.forEach(model => {
      currentSelections.set(model.id, model.isSelected())
    })

    this._models = models.map(model => {
      if (currentSelections.has(model.id)) {
        const wasSelected = currentSelections.get(model.id)!
        if (wasSelected && model.isAvailable()) {
          model.select()
        }
      }
      return model
    })
  }

  searchModels(searchTerm: string): readonly Model[] {
    if (!searchTerm.trim()) {
      return this.getModels()
    }
    
    return this._models.filter(model => model.matchesSearchTerm(searchTerm))
  }

  requiresSync(): boolean {
    if (!this.type.supportsDynamicModels()) {
      return false
    }
    
    if (!this.lastModelSync) {
      return true
    }
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    return this.lastModelSync < oneDayAgo
  }

  canBeActivated(): boolean {
    return this._isEnabled && this.hasSelectedModels()
  }

  validateConfiguration(): string[] {
    const errors: string[] = []
    
    if (this.type.requiresApiKey() && !this.apiKey?.trim()) {
      errors.push('API key is required')
    }
    
    if (this.type.requiresBaseUrl() && !this.baseUrl?.trim()) {
      errors.push('Base URL is required')
    }
    
    if (this.baseUrl && !this.isValidUrl(this.baseUrl)) {
      errors.push('Base URL is not valid')
    }
    
    if (this._isActive && !this.hasSelectedModels()) {
      errors.push('Active provider must have selected models')
    }
    
    return errors
  }

  equals(other: Provider): boolean {
    return (
      this.id === other.id &&
      this.name === other.name &&
      this.type === other.type &&
      this._isActive === other._isActive &&
      this._isEnabled === other._isEnabled &&
      this.baseUrl === other.baseUrl &&
      this.apiKey === other.apiKey &&
      JSON.stringify(this.settings) === JSON.stringify(other.settings) &&
      this._models.length === other._models.length &&
      this._models.every((model, index) => model.equals(other._models[index]))
    )
  }

  clone(): Provider {
    const cloned = new Provider(
      this.id,
      this.name,
      this.type,
      this._isActive,
      this._isEnabled,
      this.baseUrl,
      this.apiKey,
      { ...this.settings },
      this.lastModelSync
    )
    
    this._models.forEach(model => {
      cloned.addModel(model.clone())
    })
    
    return cloned
  }

  toString(): string {
    const status = this._isActive ? '●' : '○'
    const enabled = this._isEnabled ? '' : ' (disabled)'
    const modelCount = this.getSelectedModelCount()
    return `${status} ${this.name} (${modelCount} models)${enabled}`
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  static create(config: {
    type: ProviderType;
    name: string;
    apiKey?: any;
    baseUrl?: string;
    organizationId?: string;
    projectId?: string;
    customHeaders?: Record<string, string>;
    timeout?: number;
    retryAttempts?: number;
    rateLimitSettings?: any;
    metadata?: Record<string, any>;
  }): Provider {
    const id = `${config.type}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
    return new Provider(
      id,
      config.name,
      config.type,
      false,
      true,
      config.baseUrl,
      config.apiKey?.toString(),
      config.metadata || {}
    )
  }
}