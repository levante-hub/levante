/**
 * MessageContent Value Object
 * Represents the content of a chat message with support for different content types
 */
export interface ContentPart {
  type: 'text' | 'image' | 'file' | 'code' | 'reasoning';
  content: string;
  metadata?: Record<string, any>;
}

export class MessageContent {
  private readonly parts: ContentPart[];

  private constructor(parts: ContentPart[]) {
    this.parts = parts;
  }

  static create(parts: ContentPart[]): MessageContent {
    if (!MessageContent.isValid(parts)) {
      throw new Error('Invalid message content parts');
    }
    
    return new MessageContent(parts);
  }

  static createText(text: string): MessageContent {
    return MessageContent.create([{
      type: 'text',
      content: text
    }]);
  }

  static createMultipart(parts: ContentPart[]): MessageContent {
    return MessageContent.create(parts);
  }

  static isValid(parts: ContentPart[]): boolean {
    return Array.isArray(parts) && 
           parts.length > 0 && 
           parts.every(part => 
             typeof part.type === 'string' && 
             typeof part.content === 'string' &&
             part.content.length > 0
           );
  }

  getParts(): ContentPart[] {
    return [...this.parts];
  }

  getText(): string {
    return this.parts
      .filter(part => part.type === 'text')
      .map(part => part.content)
      .join('\n');
  }

  getTextContent(): string {
    // Get all content as text, including non-text parts
    return this.parts
      .map(part => {
        switch (part.type) {
          case 'text':
            return part.content;
          case 'code':
            return `\`\`\`\n${part.content}\n\`\`\``;
          case 'reasoning':
            return `[Reasoning: ${part.content}]`;
          case 'image':
            return `[Image: ${part.metadata?.alt || 'Image'}]`;
          case 'file':
            return `[File: ${part.metadata?.name || 'File'}]`;
          default:
            return part.content;
        }
      })
      .join('\n');
  }

  hasImages(): boolean {
    return this.parts.some(part => part.type === 'image');
  }

  hasFiles(): boolean {
    return this.parts.some(part => part.type === 'file');
  }

  hasCode(): boolean {
    return this.parts.some(part => part.type === 'code');
  }

  hasReasoning(): boolean {
    return this.parts.some(part => part.type === 'reasoning');
  }

  getImages(): ContentPart[] {
    return this.parts.filter(part => part.type === 'image');
  }

  getFiles(): ContentPart[] {
    return this.parts.filter(part => part.type === 'file');
  }

  getCodeBlocks(): ContentPart[] {
    return this.parts.filter(part => part.type === 'code');
  }

  getReasoning(): ContentPart[] {
    return this.parts.filter(part => part.type === 'reasoning');
  }

  isEmpty(): boolean {
    return this.parts.length === 0 || 
           this.parts.every(part => !part.content.trim());
  }

  length(): number {
    return this.parts.reduce((total, part) => total + part.content.length, 0);
  }

  equals(other: MessageContent): boolean {
    if (this.parts.length !== other.parts.length) {
      return false;
    }

    return this.parts.every((part, index) => {
      const otherPart = other.parts[index];
      return part.type === otherPart.type && 
             part.content === otherPart.content &&
             JSON.stringify(part.metadata || {}) === JSON.stringify(otherPart.metadata || {});
    });
  }

  toJSON(): any {
    return {
      parts: this.parts
    };
  }

  toString(): string {
    return this.getTextContent();
  }
}