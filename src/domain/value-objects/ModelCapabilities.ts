export type ModelCapability = 'text' | 'vision' | 'tools' | 'reasoning' | 'streaming' | 'web-search';

export class ModelCapabilities {
  private static readonly VALID_CAPABILITIES: readonly ModelCapability[] = [
    'text', 'vision', 'tools', 'reasoning', 'streaming', 'web-search'
  ] as const;

  constructor(private readonly capabilities: Set<ModelCapability>) {
    capabilities.forEach(capability => {
      if (!ModelCapabilities.VALID_CAPABILITIES.includes(capability)) {
        throw new Error(`Invalid capability: ${capability}. Valid capabilities are: ${ModelCapabilities.VALID_CAPABILITIES.join(', ')}`)
      }
    });

    if (capabilities.size === 0) {
      throw new Error('At least one capability must be specified')
    }

    if (!capabilities.has('text')) {
      throw new Error('Text capability is required for all models')
    }
  }

  has(capability: ModelCapability): boolean {
    return this.capabilities.has(capability)
  }

  getAll(): readonly ModelCapability[] {
    return Array.from(this.capabilities).sort()
  }

  count(): number {
    return this.capabilities.size
  }

  equals(other: ModelCapabilities): boolean {
    if (this.capabilities.size !== other.capabilities.size) {
      return false
    }
    
    for (const capability of this.capabilities) {
      if (!other.capabilities.has(capability)) {
        return false
      }
    }
    
    return true
  }

  contains(other: ModelCapabilities): boolean {
    for (const capability of other.capabilities) {
      if (!this.capabilities.has(capability)) {
        return false
      }
    }
    return true
  }

  add(capability: ModelCapability): ModelCapabilities {
    if (!ModelCapabilities.VALID_CAPABILITIES.includes(capability)) {
      throw new Error(`Invalid capability: ${capability}`)
    }
    
    const newCapabilities = new Set(this.capabilities)
    newCapabilities.add(capability)
    return new ModelCapabilities(newCapabilities)
  }

  remove(capability: ModelCapability): ModelCapabilities {
    if (capability === 'text') {
      throw new Error('Cannot remove text capability - it is required')
    }
    
    const newCapabilities = new Set(this.capabilities)
    newCapabilities.delete(capability)
    return new ModelCapabilities(newCapabilities)
  }

  toString(): string {
    return Array.from(this.capabilities).sort().join(', ')
  }

  toArray(): ModelCapability[] {
    return Array.from(this.capabilities).sort()
  }

  // Convenience methods
  supportsVision(): boolean {
    return this.has('vision')
  }

  supportsTools(): boolean {
    return this.has('tools')
  }

  supportsReasoning(): boolean {
    return this.has('reasoning')
  }

  supportsStreaming(): boolean {
    return this.has('streaming')
  }

  supportsWebSearch(): boolean {
    return this.has('web-search')
  }

  // Factory methods
  static textOnly(): ModelCapabilities {
    return new ModelCapabilities(new Set(['text']))
  }

  static withVision(): ModelCapabilities {
    return new ModelCapabilities(new Set(['text', 'vision']))
  }

  static withTools(): ModelCapabilities {
    return new ModelCapabilities(new Set(['text', 'tools']))
  }

  static advanced(): ModelCapabilities {
    return new ModelCapabilities(new Set(['text', 'vision', 'tools', 'reasoning', 'streaming']))
  }

  static fromArray(capabilities: ModelCapability[]): ModelCapabilities {
    return new ModelCapabilities(new Set(capabilities))
  }

  static fromString(capabilitiesStr: string): ModelCapabilities {
    const capabilities = capabilitiesStr
      .split(',')
      .map(cap => cap.trim() as ModelCapability)
      .filter(cap => cap.length > 0)
    
    return new ModelCapabilities(new Set(capabilities))
  }
}