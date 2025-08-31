import { MessageRole } from '../value-objects/MessageRole';
import { MessageParts } from '../value-objects/MessageParts';
import { ToolCall } from '../value-objects/ToolCall';

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

  static create(data: {
    sessionId: string;
    role: MessageRole;
    content: MessageParts;
    modelId: string;
    toolCalls?: ToolCall[];
  }): Message {
    const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    return new Message(
      id,
      data.role.toString() as 'user' | 'assistant' | 'system',
      data.content.getCombinedText(),
      new Date(),
      data.toolCalls?.map((tc, index) => ({
        id: `tool_${index}_${Date.now()}`,
        name: tc.getName(),
        arguments: tc.getArguments(),
        result: tc.getResult()
      })) || []
    );
  }

  getId(): string {
    return this.id;
  }

  getRole(): MessageRole {
    return new MessageRole(this.role);
  }

  getContent(): MessageParts {
    return MessageParts.textOnly(this.content);
  }

  updateContent(content: MessageParts): void {
    // Since content is readonly, this would need architectural changes
    // For now, this is a placeholder
  }

  getTimestamp(): Date {
    return this.createdAt;
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

}