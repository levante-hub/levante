/**
 * ModelId Value Object
 * Represents a unique identifier for AI models
 */
export class ModelId {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(value: string): ModelId {
    if (!ModelId.isValid(value)) {
      throw new Error(`Invalid ModelId: ${value}`);
    }
    
    return new ModelId(value);
  }

  static fromString(value: string): ModelId {
    return ModelId.create(value);
  }

  static isValid(value: string): boolean {
    // Model IDs should follow pattern: provider/model-name or just model-name
    return typeof value === 'string' && 
           value.length > 0 && 
           value.length <= 500 &&
           /^[a-zA-Z0-9\-_\/\.]+$/.test(value);
  }

  getValue(): string {
    return this.value;
  }

  toString(): string {
    return this.value;
  }

  equals(other: ModelId): boolean {
    return this.value === other.value;
  }

  getProvider(): string | null {
    const parts = this.value.split('/');
    return parts.length > 1 ? parts[0] : null;
  }

  getModelName(): string {
    const parts = this.value.split('/');
    return parts.length > 1 ? parts[1] : parts[0];
  }

  toJSON(): string {
    return this.value;
  }
}