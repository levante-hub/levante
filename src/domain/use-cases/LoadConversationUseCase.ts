import { ConversationData } from '../ports/primary/ChatConversationPort';
import { ChatSessionRepository } from '../ports/secondary/ChatSessionRepository';
import { MessageRepository } from '../ports/secondary/MessageRepository';

export class LoadConversationUseCase {
  constructor(
    private sessionRepo: ChatSessionRepository,
    private messageRepo: MessageRepository
  ) {}

  async execute(sessionId: string, options?: { messageLimit?: number; messageOffset?: number }): Promise<ConversationData> {
    const sessionResult = await this.sessionRepo.findById(sessionId);
    if (!sessionResult.success || !sessionResult.data) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const messageResult = await this.messageRepo.findBySessionId(sessionId, {
      limit: options?.messageLimit || 50,
      offset: options?.messageOffset || 0
    });

    return {
      session: sessionResult.data,
      messages: messageResult.data?.items || [],
      hasMoreMessages: messageResult.data?.hasMore || false,
      totalMessages: messageResult.data?.total || 0
    };
  }
}