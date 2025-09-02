import { OpenRouterAdapterSimple, AIRequest, AIResponse, AIStreamChunk } from '../../../domain/ports/secondary/OpenRouterAdapterSimple';
import { AIService } from '../../../main/services/aiService';

export class OpenRouterAdapterImpl implements OpenRouterAdapterSimple {
  constructor(private aiService: AIService) {}

  async sendMessage(request: AIRequest): Promise<AIResponse> {
    try {
      const chatRequest = this.mapToAIServiceRequest(request);
      const result = await this.aiService.sendSingleMessage(chatRequest);
      
      return {
        content: result.response || '',
        usage: undefined // AIService no devuelve usage info por ahora
      };
    } catch (error) {
      throw new Error(`OpenRouter adapter error: ${error}`);
    }
  }

  async *streamMessage(request: AIRequest): AsyncGenerator<AIStreamChunk> {
    try {
      const chatRequest = this.mapToAIServiceRequest(request);
      
      for await (const chunk of this.aiService.streamChat(chatRequest)) {
        if (chunk.error) {
          yield {
            content: '',
            done: true,
            error: chunk.error
          };
          return;
        }

        if (chunk.delta) {
          yield {
            content: chunk.delta,
            done: false
          };
        }

        if (chunk.done) {
          yield {
            content: '',
            done: true
          };
        }
      }
    } catch (error) {
      yield {
        content: '',
        done: true,
        error: error instanceof Error ? error.message : 'Stream error'
      };
    }
  }

  private mapToAIServiceRequest(request: AIRequest): any {
    return {
      messages: request.messages,
      model: request.modelId,
      webSearch: false // Por ahora deshabilitado para simplificar
    };
  }
}