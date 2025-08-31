import { ModelCapability } from '../entities/Model';

export class ModelCapabilities {
  private readonly capabilities: Set<ModelCapability>;

  private constructor(capabilities: ModelCapability[]) {
    this.capabilities = new Set(capabilities);
  }

  static create(capabilities: ModelCapability[]): ModelCapabilities {
    return new ModelCapabilities(capabilities);
  }

  hasCapability(capability: ModelCapability): boolean {
    return this.capabilities.has(capability);
  }

  getCapabilities(): ModelCapability[] {
    return Array.from(this.capabilities);
  }

  hasText(): boolean {
    return this.hasCapability('text');
  }

  hasVision(): boolean {
    return this.hasCapability('vision');
  }

  hasTools(): boolean {
    return this.hasCapability('tools') || this.hasCapability('function_calling');
  }

  hasReasoning(): boolean {
    return this.hasCapability('reasoning');
  }

  hasStreaming(): boolean {
    return this.hasCapability('streaming');
  }

  hasWebSearch(): boolean {
    return this.hasCapability('web_search');
  }

  hasJsonMode(): boolean {
    return this.hasCapability('json_mode');
  }

  hasFunctionCalling(): boolean {
    return this.hasCapability('function_calling');
  }

  count(): number {
    return this.capabilities.size;
  }

  isEmpty(): boolean {
    return this.capabilities.size === 0;
  }

  includes(other: ModelCapabilities): boolean {
    for (const capability of Array.from(other.capabilities)) {
      if (!this.capabilities.has(capability)) {
        return false;
      }
    }
    return true;
  }

  intersects(other: ModelCapabilities): boolean {
    for (const capability of Array.from(other.capabilities)) {
      if (this.capabilities.has(capability)) {
        return true;
      }
    }
    return false;
  }

  union(other: ModelCapabilities): ModelCapabilities {
    const allCapabilities = new Set([...Array.from(this.capabilities), ...Array.from(other.capabilities)]);
    return new ModelCapabilities(Array.from(allCapabilities));
  }

  intersection(other: ModelCapabilities): ModelCapabilities {
    const commonCapabilities: ModelCapability[] = [];
    for (const capability of Array.from(this.capabilities)) {
      if (other.capabilities.has(capability)) {
        commonCapabilities.push(capability);
      }
    }
    return new ModelCapabilities(commonCapabilities);
  }

  difference(other: ModelCapabilities): ModelCapabilities {
    const uniqueCapabilities: ModelCapability[] = [];
    for (const capability of Array.from(this.capabilities)) {
      if (!other.capabilities.has(capability)) {
        uniqueCapabilities.push(capability);
      }
    }
    return new ModelCapabilities(uniqueCapabilities);
  }

  equals(other: ModelCapabilities): boolean {
    if (this.capabilities.size !== other.capabilities.size) {
      return false;
    }
    
    for (const capability of Array.from(this.capabilities)) {
      if (!other.capabilities.has(capability)) {
        return false;
      }
    }
    
    return true;
  }

  toString(): string {
    return Array.from(this.capabilities).sort().join(', ');
  }

  toArray(): ModelCapability[] {
    return Array.from(this.capabilities).sort();
  }

  toSet(): Set<ModelCapability> {
    return new Set(this.capabilities);
  }

  static empty(): ModelCapabilities {
    return new ModelCapabilities([]);
  }

  static text(): ModelCapabilities {
    return new ModelCapabilities(['text']);
  }

  static multimodal(): ModelCapabilities {
    return new ModelCapabilities(['text', 'vision']);
  }

  static withTools(): ModelCapabilities {
    return new ModelCapabilities(['text', 'tools']);
  }

  static advanced(): ModelCapabilities {
    return new ModelCapabilities([
      'text',
      'vision',
      'tools',
      'reasoning',
      'streaming',
      'web_search',
      'json_mode',
      'function_calling'
    ]);
  }
}