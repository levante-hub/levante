export class MCPServerId {
  constructor(private readonly value: string) {
    if (!value.trim()) {
      throw new Error('MCPServerId cannot be empty')
    }
    if (!this.isValidUUID(value)) {
      throw new Error('MCPServerId must be a valid UUID')
    }
  }
  
  toString(): string {
    return this.value
  }
  
  equals(other: MCPServerId): boolean {
    return this.value === other.value
  }
  
  static generate(): MCPServerId {
    return new MCPServerId(crypto.randomUUID())
  }
  
  static fromString(value: string): MCPServerId {
    return new MCPServerId(value)
  }
  
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidRegex.test(uuid)
  }
}