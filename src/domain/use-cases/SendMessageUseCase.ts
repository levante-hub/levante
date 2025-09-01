import { ChatResponse, ChatStreamChunk, ChatOptions } from '../ports/primary/ChatConversationPort';
import { ChatSessionRepository } from '../ports/secondary/ChatSessionRepository';
import { MessageRepository } from '../ports/secondary/MessageRepository';
import { BaseAIAdapter } from '../ports/secondary/BaseAIAdapter';

export class SendMessageUseCase {
  constructor(
    private sessionRepo: ChatSessionRepository,
    private messageRepo: MessageRepository,
    private aiAdapter: BaseAIAdapter
  ) {}

  async execute(message: string, options?: ChatOptions & { sessionId?: string }): Promise<ChatResponse> {
    const sessionId = options?.sessionId || await this.getOrCreateSession(options?.model);
    
    await this.messageRepo.createMessage(sessionId, { role: 'user', content: message, toolCalls: null });
    
    const messages = await this.getMessages(sessionId);
    const response = await this.aiAdapter.sendMessage({
      messages: messages.map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.createdAt })),
      model: options?.model || 'openai/gpt-4o',
      options
    });

    const aiMessage = await this.messageRepo.createMessage(sessionId, { 
      role: 'assistant', 
      content: response.content, 
      toolCalls: null 
    });

    return {
      id: response.id,
      content: response.content,
      finishReason: response.finishReason,
      usage: response.usage,
      sessionId,
      messageId: aiMessage.data!.id
    };
  }

  async *stream(message: string, options?: ChatOptions & { sessionId?: string }): AsyncGenerator<ChatStreamChunk> {
    const sessionId = options?.sessionId || await this.getOrCreateSession(options?.model);
    
    await this.messageRepo.createMessage(sessionId, { role: 'user', content: message, toolCalls: null });
    
    const messages = await this.getMessages(sessionId);
    let fullContent = '';

    for await (const chunk of this.aiAdapter.streamChat({
      messages: messages.map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.createdAt })),
      model: options?.model || 'openai/gpt-4o',
      options
    })) {
      if (chunk.delta) fullContent += chunk.delta;
      
      yield { ...chunk, sessionId };
      
      if (chunk.done && fullContent) {
        await this.messageRepo.createMessage(sessionId, { 
          role: 'assistant', 
          content: fullContent, 
          toolCalls: null 
        });
      }
    }
  }

  private async getOrCreateSession(model?: string): Promise<string> {
    const session = await import('../entities/ChatSession').then(m => 
      m.ChatSession.create('New Chat', model || 'openai/gpt-4o')
    );
    const result = await this.sessionRepo.save(session);
    return result.data!.id;
  }

  private async getMessages(sessionId: string) {
    const result = await this.messageRepo.findBySessionId(sessionId, { limit: 50 });
    return result.data?.items || [];
  }
}