/**
 * ChatId Value Object
 * Represents a unique identifier for chat sessions
 */
export class ChatId {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(value?: string): ChatId {
    const id = value || `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (!ChatId.isValid(id)) {
      throw new Error(`Invalid ChatId: ${id}`);
    }
    
    return new ChatId(id);
  }

  static fromString(value: string): ChatId {
    return ChatId.create(value);
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

  equals(other: ChatId): boolean {
    return this.value === other.value;
  }

  toJSON(): string {
    return this.value;
  }
}