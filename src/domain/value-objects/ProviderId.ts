/**
 * ProviderId Value Object
 * Represents a unique identifier for AI providers
 */
export class ProviderId {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(value: string): ProviderId {
    if (!ProviderId.isValid(value)) {
      throw new Error(`Invalid ProviderId: ${value}`);
    }
    
    return new ProviderId(value);
  }

  static fromString(value: string): ProviderId {
    return ProviderId.create(value);
  }

  static isValid(value: string): boolean {
    // Provider IDs should be lowercase with hyphens, alphanumeric
    return typeof value === 'string' && 
           value.length > 0 && 
           value.length <= 100 &&
           /^[a-z0-9\-_]+$/.test(value);
  }

  getValue(): string {
    return this.value;
  }

  toString(): string {
    return this.value;
  }

  equals(other: ProviderId): boolean {
    return this.value === other.value;
  }

  toJSON(): string {
    return this.value;
  }
}