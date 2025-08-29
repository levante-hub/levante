export interface ToolCallData {
  name: string;
  arguments: Record<string, any>;
  result?: any;
}

export class ToolCall {
  constructor(
    private readonly name: string,
    private readonly args: Record<string, any>,
    private readonly result?: any
  ) {
    if (!name.trim()) {
      throw new Error('Tool name cannot be empty')
    }
    if (name.length > 100) {
      throw new Error('Tool name cannot exceed 100 characters')
    }
    if (!/^[a-zA-Z0-9_\-.:]+$/.test(name)) {
      throw new Error('Tool name contains invalid characters. Only alphanumeric, underscore, dash, dot and colon are allowed')
    }
  }

  getName(): string {
    return this.name
  }

  getArguments(): Record<string, any> {
    return { ...this.args }
  }

  getResult(): any {
    return this.result
  }

  hasResult(): boolean {
    return this.result !== undefined
  }

  withResult(result: any): ToolCall {
    return new ToolCall(this.name, this.args, result)
  }

  toJSON(): ToolCallData {
    return {
      name: this.name,
      arguments: this.args,
      ...(this.result !== undefined && { result: this.result })
    }
  }

  static fromJSON(data: ToolCallData): ToolCall {
    return new ToolCall(data.name, data.arguments, data.result)
  }

  equals(other: ToolCall): boolean {
    return (
      this.name === other.name &&
      JSON.stringify(this.args) === JSON.stringify(other.args) &&
      JSON.stringify(this.result) === JSON.stringify(other.result)
    )
  }

  toString(): string {
    return `${this.name}(${JSON.stringify(this.args)})`
  }
}