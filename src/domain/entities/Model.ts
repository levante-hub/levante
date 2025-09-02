export type ModelCapability = 
  | 'text'
  | 'vision'
  | 'tools'
  | 'reasoning'
  | 'streaming'
  | 'web_search'
  | 'json_mode'
  | 'function_calling';

export interface ModelPricing {
  inputTokenPrice: number; // Per 1M tokens
  outputTokenPrice: number; // Per 1M tokens
  cacheInputTokenPrice?: number; // Per 1M tokens for cached inputs
  cacheOutputTokenPrice?: number; // Per 1M tokens for cached outputs
  currency: string;
}

export class Model {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly providerId: string,
    public readonly capabilities: ModelCapability[],
    public readonly contextLength: number,
    public readonly pricing: ModelPricing,
    private _isSelected: boolean = false,
    private _isAvailable: boolean = true,
    public readonly displayName?: string,
    public readonly description?: string
  ) {
    if (!name.trim()) {
      throw new Error('Model name cannot be empty')
    }
    if (name.length > 100) {
      throw new Error('Model name cannot exceed 100 characters')
    }
    if (contextLength <= 0) {
      throw new Error('Context length must be positive')
    }
    if (displayName && displayName.length > 150) {
      throw new Error('Display name cannot exceed 150 characters')
    }
    if (description && description.length > 500) {
      throw new Error('Description cannot exceed 500 characters')
    }
  }

  getDisplayName(): string {
    return this.displayName || this.name
  }

  getDescription(): string {
    return this.description || ''
  }

  isSelected(): boolean {
    return this._isSelected
  }

  isAvailable(): boolean {
    return this._isAvailable
  }

  select(): void {
    if (!this._isAvailable) {
      throw new Error('Cannot select an unavailable model')
    }
    this._isSelected = true
  }

  deselect(): void {
    this._isSelected = false
  }

  setAvailability(available: boolean): void {
    this._isAvailable = available
    if (!available) {
      this._isSelected = false
    }
  }

  hasCapability(capability: ModelCapability): boolean {
    return this.capabilities.includes(capability)
  }

  supportsVision(): boolean {
    return this.capabilities.includes('vision')
  }

  supportsTools(): boolean {
    return this.capabilities.includes('tools') || this.capabilities.includes('function_calling')
  }

  supportsReasoning(): boolean {
    return this.capabilities.includes('reasoning')
  }

  supportsStreaming(): boolean {
    return this.capabilities.includes('streaming')
  }

  supportsWebSearch(): boolean {
    return this.capabilities.includes('web_search')
  }

  canHandleContextLength(requiredLength: number): boolean {
    return this.contextLength >= requiredLength
  }

  estimateCost(inputTokens: number, outputTokens: number, cacheInputTokens: number = 0, cacheOutputTokens: number = 0): number {
    const inputCost = (inputTokens / 1_000_000) * this.pricing.inputTokenPrice
    const outputCost = (outputTokens / 1_000_000) * this.pricing.outputTokenPrice
    const cacheInputCost = (cacheInputTokens / 1_000_000) * (this.pricing.cacheInputTokenPrice || this.pricing.inputTokenPrice)
    const cacheOutputCost = (cacheOutputTokens / 1_000_000) * (this.pricing.cacheOutputTokenPrice || this.pricing.outputTokenPrice)
    return inputCost + outputCost + cacheInputCost + cacheOutputCost
  }

  isMoreExpensiveThan(other: Model): boolean {
    const thisAvgCost = (this.pricing.inputTokenPrice + this.pricing.outputTokenPrice) / 2
    const otherAvgCost = (other.pricing.inputTokenPrice + other.pricing.outputTokenPrice) / 2
    return thisAvgCost > otherAvgCost
  }

  isFree(): boolean {
    return this.pricing.inputTokenPrice === 0 && this.pricing.outputTokenPrice === 0 &&
           (this.pricing.cacheInputTokenPrice === undefined || this.pricing.cacheInputTokenPrice === 0) &&
           (this.pricing.cacheOutputTokenPrice === undefined || this.pricing.cacheOutputTokenPrice === 0)
  }

  getProviderName(): string {
    return this.providerId
  }

  getFullName(): string {
    return `${this.getProviderName()}/${this.name}`
  }

  matchesSearchTerm(searchTerm: string): boolean {
    const term = searchTerm.toLowerCase()
    return (
      this.name.toLowerCase().includes(term) ||
      this.getDisplayName().toLowerCase().includes(term) ||
      this.getDescription().toLowerCase().includes(term) ||
      this.getProviderName().toLowerCase().includes(term)
    )
  }

  clone(): Model {
    return new Model(
      this.id,
      this.name,
      this.providerId,
      this.capabilities,
      this.contextLength,
      this.pricing,
      this._isSelected,
      this._isAvailable,
      this.displayName,
      this.description
    )
  }

  equals(other: Model): boolean {
    return (
      this.id === other.id &&
      this.name === other.name &&
      this.providerId === other.providerId &&
      JSON.stringify(this.capabilities.sort()) === JSON.stringify(other.capabilities.sort()) &&
      this.contextLength === other.contextLength &&
      this.pricing.inputTokenPrice === other.pricing.inputTokenPrice &&
      this.pricing.outputTokenPrice === other.pricing.outputTokenPrice &&
      this.pricing.cacheInputTokenPrice === other.pricing.cacheInputTokenPrice &&
      this.pricing.cacheOutputTokenPrice === other.pricing.cacheOutputTokenPrice &&
      this.pricing.currency === other.pricing.currency &&
      this._isSelected === other._isSelected &&
      this._isAvailable === other._isAvailable &&
      this.displayName === other.displayName &&
      this.description === other.description
    )
  }

  toString(): string {
    const status = this._isSelected ? '✓' : ' '
    const availability = this._isAvailable ? '' : ' (unavailable)'
    return `[${status}] ${this.getDisplayName()}${availability}`
  }

  toJSON(): {
    id: string;
    name: string;
    providerId: string;
    capabilities: ModelCapability[];
    contextLength: number;
    pricing: ModelPricing;
    isSelected: boolean;
    isAvailable: boolean;
    displayName?: string;
    description?: string;
  } {
    return {
      id: this.id,
      name: this.name,
      providerId: this.providerId,
      capabilities: [...this.capabilities],
      contextLength: this.contextLength,
      pricing: { ...this.pricing },
      isSelected: this._isSelected,
      isAvailable: this._isAvailable,
      ...(this.displayName && { displayName: this.displayName }),
      ...(this.description && { description: this.description })
    }
  }

  static create(
    name: string,
    providerId: string,
    capabilities: ModelCapability[],
    contextLength: number,
    pricing: ModelPricing,
    displayName?: string,
    description?: string
  ): Model {
    const id = `${providerId}/${name}`
    return new Model(
      id,
      name,
      providerId,
      capabilities,
      contextLength,
      pricing,
      false,
      true,
      displayName,
      description
    )
  }
}