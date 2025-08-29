export class MCPToolId {
  constructor(private readonly value: string) {
    if (!value.trim()) {
      throw new Error('MCPToolId cannot be empty')
    }
    if (value.length > 100) {
      throw new Error('MCPToolId cannot exceed 100 characters')
    }
    if (!/^[a-zA-Z0-9_\-.:]+$/.test(value)) {
      throw new Error('MCPToolId contains invalid characters. Only alphanumeric, underscore, dash, dot and colon are allowed')
    }
  }

  toString(): string {
    return this.value
  }

  equals(other: MCPToolId): boolean {
    return this.value === other.value
  }

  static fromString(value: string): MCPToolId {
    return new MCPToolId(value)
  }

  static generate(): MCPToolId {
    return new MCPToolId(crypto.randomUUID())
  }
}