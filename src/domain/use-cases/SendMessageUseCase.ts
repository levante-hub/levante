import { ChatStreamChunk } from '../ports/primary/ChatConversationPort';

// Simple use case that delegates to existing AI service
export class SendMessageUseCase {
  constructor(
    private aiService: any // AIService from existing system
  ) {}

  async *stream(message: string, options?: any): AsyncGenerator<ChatStreamChunk> {
    try {
      // Convert to format expected by existing AI service
      const request = {
        messages: options?.messages || [{ 
          id: `temp_${Date.now()}`, 
          role: 'user', 
          content: message,
          parts: [{ type: 'text', text: message }]
        }],
        model: options?.model || 'openai/gpt-4o',
        webSearch: options?.webSearch || false
      };

      // Delegate to existing AI service
      for await (const chunk of this.aiService.streamChat(request)) {
        yield {
          id: `chunk_${Date.now()}`,
          delta: chunk.delta,
          done: chunk.done || false,
          finishReason: chunk.done ? 'stop' : undefined,
          usage: chunk.done ? { promptTokens: 0, completionTokens: 0, totalTokens: 0 } : undefined,
          sources: chunk.sources,
          reasoning: chunk.reasoning,
          sessionId: options?.sessionId
        };
      }
    } catch (error) {
      console.error('[SendMessageUseCase] Stream error:', error);
      yield {
        id: `error_${Date.now()}`,
        done: true,
        finishReason: 'cancelled',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        sessionId: options?.sessionId
      };
    }
  }
}