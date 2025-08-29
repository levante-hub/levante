export class ProviderType {
  private static readonly VALID_TYPES = ['openrouter', 'vercel-gateway', 'local', 'cloud'] as const;
  
  public static readonly OPENROUTER = new ProviderType('openrouter');
  public static readonly VERCEL_GATEWAY = new ProviderType('vercel-gateway');
  public static readonly LOCAL = new ProviderType('local');
  public static readonly CLOUD = new ProviderType('cloud');

  constructor(private readonly value: (typeof ProviderType.VALID_TYPES)[number]) {
    if (!ProviderType.VALID_TYPES.includes(value)) {
      throw new Error(`Invalid provider type: ${value}. Valid types are: ${ProviderType.VALID_TYPES.join(', ')}`)
    }
  }

  toString(): string {
    return this.value
  }

  equals(other: ProviderType): boolean {
    return this.value === other.value
  }

  static fromString(value: string): ProviderType {
    const type = value.toLowerCase() as (typeof ProviderType.VALID_TYPES)[number]
    return new ProviderType(type)
  }

  static getValidTypes(): readonly string[] {
    return [...ProviderType.VALID_TYPES]
  }

  isOpenRouter(): boolean {
    return this.value === 'openrouter'
  }

  isVercelGateway(): boolean {
    return this.value === 'vercel-gateway'
  }

  isLocal(): boolean {
    return this.value === 'local'
  }

  isCloud(): boolean {
    return this.value === 'cloud'
  }

  requiresApiKey(): boolean {
    return this.value === 'openrouter' || this.value === 'vercel-gateway' || this.value === 'cloud'
  }

  requiresBaseUrl(): boolean {
    return this.value === 'vercel-gateway' || this.value === 'local'
  }

  supportsDynamicModels(): boolean {
    return this.value === 'openrouter' || this.value === 'vercel-gateway'
  }

  getDefaultBaseUrl(): string | null {
    switch (this.value) {
      case 'openrouter':
        return 'https://openrouter.ai/api/v1'
      case 'local':
        return 'http://localhost:11434'
      default:
        return null
    }
  }
}