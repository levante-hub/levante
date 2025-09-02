export class MessageRole {
  private static readonly VALID_ROLES = ['user', 'assistant', 'system'] as const;
  public static readonly USER = new MessageRole('user');
  public static readonly ASSISTANT = new MessageRole('assistant');
  public static readonly SYSTEM = new MessageRole('system');

  constructor(private readonly value: (typeof MessageRole.VALID_ROLES)[number]) {
    if (!MessageRole.VALID_ROLES.includes(value)) {
      throw new Error(`Invalid message role: ${value}. Valid roles are: ${MessageRole.VALID_ROLES.join(', ')}`)
    }
  }

  toString(): string {
    return this.value
  }

  equals(other: MessageRole): boolean {
    return this.value === other.value
  }

  static fromString(value: string): MessageRole {
    const role = value.toLowerCase() as (typeof MessageRole.VALID_ROLES)[number]
    return new MessageRole(role)
  }

  isUser(): boolean {
    return this.value === 'user'
  }

  isAssistant(): boolean {
    return this.value === 'assistant'
  }

  isSystem(): boolean {
    return this.value === 'system'
  }
}