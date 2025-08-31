/**
 * MessageId Value Object
 * Represents a unique identifier for chat messages
 */
export class MessageId {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(value?: string): MessageId {
    const id = value || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (!MessageId.isValid(id)) {
      throw new Error(`Invalid MessageId: ${id}`);
    }
    
    return new MessageId(id);
  }

  static fromString(value: string): MessageId {
    return MessageId.create(value);
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

  equals(other: MessageId): boolean {
    return this.value === other.value;
  }

  toJSON(): string {
    return this.value;
  }
}