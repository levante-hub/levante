export interface ToolCallData {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
}

export class Message {
  constructor(
    public readonly id: string,
    public readonly role: 'user' | 'assistant' | 'system',
    public readonly content: string,
    public readonly createdAt: Date,
    private readonly toolCalls: ToolCallData[] = []
  ) {
    if (toolCalls.length > 10) {
      throw new Error('Message cannot have more than 10 tool calls')
    }
  }

  getToolCalls(): readonly ToolCallData[] {
    return [...this.toolCalls]
  }

  hasToolCalls(): boolean {
    return this.toolCalls.length > 0
  }

  addToolCall(toolCall: ToolCallData): Message {
    if (this.toolCalls.length >= 10) {
      throw new Error('Cannot add more than 10 tool calls to a message')
    }
    return new Message(
      this.id,
      this.role,
      this.content,
      this.createdAt,
      [...this.toolCalls, toolCall]
    )
  }

  updateToolCallResult(toolName: string, result: any): Message {
    const updatedToolCalls = this.toolCalls.map(toolCall =>
      toolCall.name === toolName ? { ...toolCall, result } : toolCall
    )
    
    return new Message(
      this.id,
      this.role,
      this.content,
      this.createdAt,
      updatedToolCalls
    )
  }

  isFromUser(): boolean {
    return this.role === 'user'
  }

  isFromAssistant(): boolean {
    return this.role === 'assistant'
  }

  isSystemMessage(): boolean {
    return this.role === 'system'
  }

  getContentText(): string {
    return this.content
  }

  getContentLength(): number {
    return this.content.length
  }

  equals(other: Message): boolean {
    return (
      this.id === other.id &&
      this.role === other.role &&
      this.content === other.content &&
      this.createdAt.getTime() === other.createdAt.getTime() &&
      this.toolCalls.length === other.toolCalls.length &&
      this.toolCalls.every((toolCall, index) => 
        toolCall.id === other.toolCalls[index].id &&
        toolCall.name === other.toolCalls[index].name &&
        JSON.stringify(toolCall.arguments) === JSON.stringify(other.toolCalls[index].arguments)
      )
    )
  }

  static create(
    role: 'user' | 'assistant' | 'system',
    content: string,
    toolCalls: ToolCallData[] = []
  ): Message {
    return new Message(
      crypto.randomUUID(),
      role,
      content,
      new Date(),
      toolCalls
    )
  }
}