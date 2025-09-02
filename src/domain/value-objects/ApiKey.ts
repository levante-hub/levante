export class ApiKey {
  private static readonly MIN_LENGTH = 8;
  private static readonly MAX_LENGTH = 500;

  constructor(private readonly value: string) {
    this.validateApiKey(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: ApiKey): boolean {
    return this.value === other.value;
  }

  getMasked(): string {
    if (this.value.length <= 8) {
      return '***';
    }
    
    const visibleStart = Math.min(4, Math.floor(this.value.length / 4));
    const visibleEnd = Math.min(4, Math.floor(this.value.length / 4));
    const hiddenLength = this.value.length - visibleStart - visibleEnd;
    
    return `${this.value.substring(0, visibleStart)}${'*'.repeat(Math.min(hiddenLength, 10))}${this.value.substring(this.value.length - visibleEnd)}`;
  }

  getPrefix(): string {
    if (this.value.length <= 8) {
      return this.value.substring(0, 3);
    }
    
    return this.value.substring(0, 8);
  }

  getSuffix(): string {
    if (this.value.length <= 8) {
      return this.value.substring(this.value.length - 3);
    }
    
    return this.value.substring(this.value.length - 4);
  }

  length(): number {
    return this.value.length;
  }

  isEmpty(): boolean {
    return this.value.length === 0;
  }

  isValid(): boolean {
    try {
      this.validateApiKey(this.value);
      return true;
    } catch {
      return false;
    }
  }

  hasPrefix(prefix: string): boolean {
    return this.value.startsWith(prefix);
  }

  hasSuffix(suffix: string): boolean {
    return this.value.endsWith(suffix);
  }

  getKeyType(): string {
    // Detect common API key patterns
    if (this.value.startsWith('sk-')) {
      return 'OpenAI';
    } else if (this.value.startsWith('pk-')) {
      return 'OpenAI Public';
    } else if (this.value.startsWith('claude-')) {
      return 'Anthropic';
    } else if (this.value.startsWith('AIza')) {
      return 'Google';
    } else if (this.value.startsWith('Bearer ')) {
      return 'Bearer Token';
    } else if (this.value.match(/^[A-Za-z0-9+/]{40,}={0,2}$/)) {
      return 'Base64 Encoded';
    } else if (this.value.match(/^[a-f0-9]{32,}$/i)) {
      return 'Hex Encoded';
    } else if (this.value.match(/^[A-Z0-9]{20,}$/)) {
      return 'Alphanumeric';
    } else {
      return 'Custom';
    }
  }

  isSecure(): boolean {
    // Check for minimum security requirements
    if (this.value.length < 16) {
      return false;
    }

    // Should not be common weak patterns
    const weakPatterns = [
      /^(test|demo|example|sample|default)/i,
      /^(123|000|aaa|abc)/,
      /password|secret|key/i
    ];

    return !weakPatterns.some(pattern => pattern.test(this.value));
  }

  getSecurityScore(): number {
    let score = 0;

    // Length score (0-30)
    if (this.value.length >= 32) score += 30;
    else if (this.value.length >= 24) score += 25;
    else if (this.value.length >= 16) score += 20;
    else if (this.value.length >= 12) score += 15;
    else if (this.value.length >= 8) score += 10;

    // Character variety score (0-25)
    const hasLower = /[a-z]/.test(this.value);
    const hasUpper = /[A-Z]/.test(this.value);
    const hasNumbers = /[0-9]/.test(this.value);
    const hasSpecial = /[^a-zA-Z0-9]/.test(this.value);

    if (hasLower) score += 5;
    if (hasUpper) score += 5;
    if (hasNumbers) score += 5;
    if (hasSpecial) score += 10;

    // Entropy score (0-25)
    const entropy = this.calculateEntropy();
    if (entropy >= 4.5) score += 25;
    else if (entropy >= 4.0) score += 20;
    else if (entropy >= 3.5) score += 15;
    else if (entropy >= 3.0) score += 10;
    else if (entropy >= 2.5) score += 5;

    // Pattern deductions (-20)
    if (!this.isSecure()) score -= 20;

    // Known prefix bonus (0-20)
    const keyType = this.getKeyType();
    if (['OpenAI', 'Anthropic', 'Google'].includes(keyType)) {
      score += 20;
    } else if (['Base64 Encoded', 'Hex Encoded'].includes(keyType)) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  private validateApiKey(key: string): void {
    if (typeof key !== 'string') {
      throw new Error('API key must be a string');
    }

    if (key.length === 0) {
      throw new Error('API key cannot be empty');
    }

    if (key.length < ApiKey.MIN_LENGTH) {
      throw new Error(`API key must be at least ${ApiKey.MIN_LENGTH} characters long`);
    }

    if (key.length > ApiKey.MAX_LENGTH) {
      throw new Error(`API key cannot exceed ${ApiKey.MAX_LENGTH} characters`);
    }

    // Check for obvious non-printable characters
    if (!/^[\x20-\x7E]*$/.test(key)) {
      throw new Error('API key contains invalid characters');
    }

    // Check for whitespace at start/end
    if (key !== key.trim()) {
      throw new Error('API key cannot have leading or trailing whitespace');
    }

    // Check for internal whitespace (usually not allowed in API keys)
    if (key.includes(' ') && !key.startsWith('Bearer ')) {
      throw new Error('API key cannot contain spaces');
    }
  }

  private calculateEntropy(): number {
    const freq: { [key: string]: number } = {};
    
    for (const char of this.value) {
      freq[char] = (freq[char] || 0) + 1;
    }

    let entropy = 0;
    const length = this.value.length;

    for (const count of Object.values(freq)) {
      const probability = count / length;
      entropy -= probability * Math.log2(probability);
    }

    return entropy;
  }

  static fromString(value: string): ApiKey {
    return new ApiKey(value);
  }

  static fromMasked(maskedValue: string, originalKey: ApiKey): ApiKey {
    // This is for display purposes only - cannot reconstruct from masked
    throw new Error('Cannot reconstruct API key from masked value');
  }

  static isValidKeyFormat(value: string): boolean {
    try {
      new ApiKey(value);
      return true;
    } catch {
      return false;
    }
  }

  static generateSecureKey(length: number = 32, includeSpecialChars: boolean = false): ApiKey {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const fullCharset = includeSpecialChars ? charset + specialChars : charset;
    
    let result = '';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    
    for (let i = 0; i < length; i++) {
      result += fullCharset.charAt(array[i] % fullCharset.length);
    }
    
    return new ApiKey(result);
  }

  static createOpenAIKey(keyValue: string): ApiKey {
    const fullKey = keyValue.startsWith('sk-') ? keyValue : `sk-${keyValue}`;
    return new ApiKey(fullKey);
  }

  static createBearerToken(token: string): ApiKey {
    const fullToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    return new ApiKey(fullToken);
  }
}