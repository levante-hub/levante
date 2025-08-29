export type MessagePartType = 'text' | 'source-url' | 'reasoning' | 'image' | 'file' | 'code';

export interface TextPart {
  type: 'text';
  text: string;
}

export interface SourceUrlPart {
  type: 'source-url';
  url: string;
  title?: string;
  description?: string;
}

export interface ReasoningPart {
  type: 'reasoning';
  text: string;
  confidence?: number;
}

export interface ImagePart {
  type: 'image';
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface FilePart {
  type: 'file';
  name: string;
  url: string;
  mimeType: string;
  size?: number;
}

export interface CodePart {
  type: 'code';
  code: string;
  language?: string;
  filename?: string;
}

export type MessagePart = TextPart | SourceUrlPart | ReasoningPart | ImagePart | FilePart | CodePart;

export class MessageParts {
  constructor(private readonly parts: MessagePart[]) {
    if (parts.length === 0) {
      throw new Error('MessageParts cannot be empty');
    }
    
    if (parts.length > 50) {
      throw new Error('MessageParts cannot have more than 50 parts');
    }

    // Validate each part
    parts.forEach((part, index) => {
      this.validatePart(part, index);
    });

    // Must have at least one text part
    if (!parts.some(part => part.type === 'text')) {
      throw new Error('MessageParts must contain at least one text part');
    }
  }

  getParts(): readonly MessagePart[] {
    return [...this.parts];
  }

  getPartCount(): number {
    return this.parts.length;
  }

  getTextParts(): TextPart[] {
    return this.parts.filter(part => part.type === 'text') as TextPart[];
  }

  getSourceParts(): SourceUrlPart[] {
    return this.parts.filter(part => part.type === 'source-url') as SourceUrlPart[];
  }

  getReasoningParts(): ReasoningPart[] {
    return this.parts.filter(part => part.type === 'reasoning') as ReasoningPart[];
  }

  getImageParts(): ImagePart[] {
    return this.parts.filter(part => part.type === 'image') as ImagePart[];
  }

  getFileParts(): FilePart[] {
    return this.parts.filter(part => part.type === 'file') as FilePart[];
  }

  getCodeParts(): CodePart[] {
    return this.parts.filter(part => part.type === 'code') as CodePart[];
  }

  hasType(type: MessagePartType): boolean {
    return this.parts.some(part => part.type === type);
  }

  hasText(): boolean {
    return this.hasType('text');
  }

  hasSources(): boolean {
    return this.hasType('source-url');
  }

  hasReasoning(): boolean {
    return this.hasType('reasoning');
  }

  hasImages(): boolean {
    return this.hasType('image');
  }

  hasFiles(): boolean {
    return this.hasType('file');
  }

  hasCode(): boolean {
    return this.hasType('code');
  }

  getCombinedText(): string {
    return this.getTextParts()
      .map(part => part.text)
      .join('\n');
  }

  getContentLength(): number {
    return this.parts.reduce((total, part) => {
      switch (part.type) {
        case 'text':
        case 'reasoning':
          return total + part.text.length;
        case 'code':
          return total + part.code.length;
        case 'source-url':
          return total + part.url.length + (part.title?.length || 0) + (part.description?.length || 0);
        case 'image':
        case 'file':
          return total + part.url.length + (part.name || part.alt || '').length;
        default:
          return total;
      }
    }, 0);
  }

  addText(text: string): MessageParts {
    if (!text.trim()) {
      throw new Error('Text cannot be empty');
    }
    
    const newPart: TextPart = { type: 'text', text: text.trim() };
    return new MessageParts([...this.parts, newPart]);
  }

  addSource(url: string, title?: string, description?: string): MessageParts {
    this.validateUrl(url);
    
    const newPart: SourceUrlPart = { 
      type: 'source-url', 
      url,
      ...(title && { title: title.trim() }),
      ...(description && { description: description.trim() })
    };
    
    return new MessageParts([...this.parts, newPart]);
  }

  addReasoning(text: string, confidence?: number): MessageParts {
    if (!text.trim()) {
      throw new Error('Reasoning text cannot be empty');
    }
    
    if (confidence !== undefined && (confidence < 0 || confidence > 1)) {
      throw new Error('Confidence must be between 0 and 1');
    }
    
    const newPart: ReasoningPart = { 
      type: 'reasoning', 
      text: text.trim(),
      ...(confidence !== undefined && { confidence })
    };
    
    return new MessageParts([...this.parts, newPart]);
  }

  addImage(url: string, alt?: string, width?: number, height?: number): MessageParts {
    this.validateUrl(url);
    
    if (width !== undefined && width <= 0) {
      throw new Error('Image width must be positive');
    }
    
    if (height !== undefined && height <= 0) {
      throw new Error('Image height must be positive');
    }
    
    const newPart: ImagePart = { 
      type: 'image', 
      url,
      ...(alt && { alt: alt.trim() }),
      ...(width && { width }),
      ...(height && { height })
    };
    
    return new MessageParts([...this.parts, newPart]);
  }

  addFile(name: string, url: string, mimeType: string, size?: number): MessageParts {
    if (!name.trim()) {
      throw new Error('File name cannot be empty');
    }
    
    this.validateUrl(url);
    
    if (!mimeType.trim()) {
      throw new Error('MIME type cannot be empty');
    }
    
    if (size !== undefined && size < 0) {
      throw new Error('File size cannot be negative');
    }
    
    const newPart: FilePart = { 
      type: 'file', 
      name: name.trim(), 
      url, 
      mimeType: mimeType.trim(),
      ...(size !== undefined && { size })
    };
    
    return new MessageParts([...this.parts, newPart]);
  }

  addCode(code: string, language?: string, filename?: string): MessageParts {
    if (!code.trim()) {
      throw new Error('Code cannot be empty');
    }
    
    const newPart: CodePart = { 
      type: 'code', 
      code: code.trim(),
      ...(language && { language: language.trim() }),
      ...(filename && { filename: filename.trim() })
    };
    
    return new MessageParts([...this.parts, newPart]);
  }

  filter(predicate: (part: MessagePart) => boolean): MessageParts {
    const filteredParts = this.parts.filter(predicate);
    
    if (filteredParts.length === 0) {
      throw new Error('Filtered parts cannot be empty');
    }
    
    return new MessageParts(filteredParts);
  }

  filterByType(type: MessagePartType): MessageParts {
    return this.filter(part => part.type === type);
  }

  equals(other: MessageParts): boolean {
    if (this.parts.length !== other.parts.length) {
      return false;
    }
    
    return this.parts.every((part, index) => {
      const otherPart = other.parts[index];
      return JSON.stringify(part) === JSON.stringify(otherPart);
    });
  }

  toString(): string {
    return this.getCombinedText();
  }

  toJSON(): MessagePart[] {
    return this.parts.map(part => ({ ...part }));
  }

  private validatePart(part: MessagePart, index: number): void {
    if (!part || typeof part !== 'object') {
      throw new Error(`Part ${index} must be a valid object`);
    }

    if (!part.type) {
      throw new Error(`Part ${index} must have a type`);
    }

    const validTypes: MessagePartType[] = ['text', 'source-url', 'reasoning', 'image', 'file', 'code'];
    if (!validTypes.includes(part.type)) {
      throw new Error(`Part ${index} has invalid type: ${part.type}`);
    }

    switch (part.type) {
      case 'text':
      case 'reasoning':
        if (!part.text || typeof part.text !== 'string' || !part.text.trim()) {
          throw new Error(`${part.type} part ${index} must have non-empty text`);
        }
        if (part.text.length > 100000) {
          throw new Error(`${part.type} part ${index} text too long`);
        }
        break;

      case 'source-url':
      case 'image':
        this.validateUrl((part as SourceUrlPart | ImagePart).url);
        break;

      case 'file':
        const filePart = part as FilePart;
        if (!filePart.name || !filePart.name.trim()) {
          throw new Error(`File part ${index} must have a name`);
        }
        if (!filePart.mimeType || !filePart.mimeType.trim()) {
          throw new Error(`File part ${index} must have a MIME type`);
        }
        this.validateUrl(filePart.url);
        break;

      case 'code':
        const codePart = part as CodePart;
        if (!codePart.code || typeof codePart.code !== 'string' || !codePart.code.trim()) {
          throw new Error(`Code part ${index} must have non-empty code`);
        }
        if (codePart.code.length > 50000) {
          throw new Error(`Code part ${index} code too long`);
        }
        break;
    }
  }

  private validateUrl(url: string): void {
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new Error('URL cannot be empty');
    }

    try {
      new URL(url);
    } catch {
      throw new Error('URL must be valid');
    }

    if (url.length > 2000) {
      throw new Error('URL cannot exceed 2000 characters');
    }
  }

  static textOnly(text: string): MessageParts {
    return new MessageParts([{ type: 'text', text: text.trim() }]);
  }

  static fromArray(parts: MessagePart[]): MessageParts {
    return new MessageParts(parts);
  }

  static fromJSON(parts: MessagePart[]): MessageParts {
    return new MessageParts(parts);
  }

  static empty(): MessageParts {
    return MessageParts.textOnly('');
  }

  static withTextAndSources(text: string, sources: Array<{ url: string; title?: string; description?: string }>): MessageParts {
    const parts: MessagePart[] = [{ type: 'text', text: text.trim() }];
    
    sources.forEach(source => {
      parts.push({
        type: 'source-url',
        url: source.url,
        ...(source.title && { title: source.title }),
        ...(source.description && { description: source.description })
      });
    });
    
    return new MessageParts(parts);
  }
}