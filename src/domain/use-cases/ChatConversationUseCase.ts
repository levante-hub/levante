import { 
  ChatConversationPort, 
  ChatOptions, 
  ChatResponse, 
  ChatStreamChunk, 
  ConversationData
} from '../ports/primary/ChatConversationPort';
import { ChatSession } from '../entities/ChatSession';
import { SendMessageUseCase } from './SendMessageUseCase';
import { LoadConversationUseCase } from './LoadConversationUseCase';
import { CreateConversationUseCase } from './CreateConversationUseCase';

export class ChatConversationUseCase implements ChatConversationPort {
  constructor(
    private sendMessageUC: SendMessageUseCase,
    private loadConversationUC: LoadConversationUseCase,
    private createConversationUC: CreateConversationUseCase
  ) {}

  async sendMessage(message: string, options?: ChatOptions & { sessionId?: string }): Promise<ChatResponse> {
    return this.sendMessageUC.execute(message, options);
  }

  streamMessage(message: string, options?: ChatOptions & { sessionId?: string }): AsyncGenerator<ChatStreamChunk> {
    return this.sendMessageUC.stream(message, options);
  }

  async loadConversation(sessionId: string, options?: any): Promise<ConversationData> {
    return this.loadConversationUC.execute(sessionId, options);
  }

  async createNewConversation(title?: string, modelId?: string): Promise<ChatSession> {
    return this.createConversationUC.execute(title, modelId);
  }

  // Métodos adicionales del puerto - implementación mínima
  async getConversationSummary(sessionId: string): Promise<any> { throw new Error('Not implemented'); }
  async continueConversation(sessionId: string, message: string, options?: any): Promise<ChatResponse> { throw new Error('Not implemented'); }
  async loadMoreMessages(sessionId: string, options?: any): Promise<any> { throw new Error('Not implemented'); }
  async *regenerateLastResponse(sessionId: string, options?: any): AsyncGenerator<ChatStreamChunk> { throw new Error('Not implemented'); }
  async generateConversationTitle(sessionId: string, forceRegenerate?: boolean): Promise<string> { throw new Error('Not implemented'); }
}