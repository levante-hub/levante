/**
 * FolderId Value Object
 * Represents a unique identifier for chat session folders
 */
export class FolderId {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(value?: string): FolderId {
    const id = value || `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (!FolderId.isValid(id)) {
      throw new Error(`Invalid FolderId: ${id}`);
    }
    
    return new FolderId(id);
  }

  static fromString(value: string): FolderId {
    return FolderId.create(value);
  }

  static isValid(value: string): boolean {
    return typeof value === 'string' && value.length > 0 && value.length <= 255;
  }

  getValue(): string {
    return this.value;
  }

  toString(): string {
    return this.value;
  }

  equals(other: FolderId): boolean {
    return this.value === other.value;
  }

  toJSON(): string {
    return this.value;
  }
}