import { ConversationData } from '../ports/primary/ChatConversationPort';
import { ChatSessionRepositorySimple } from '../ports/secondary/ChatSessionRepositorySimple';
import { MessageRepositorySimple } from '../ports/secondary/MessageRepositorySimple';

export class LoadConversationUseCase {
  constructor(
    private sessionRepo: ChatSessionRepositorySimple,
    private messageRepo: MessageRepositorySimple
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

    const messages = messageResult.success ? messageResult.data : [];

    return {
      session: sessionResult.data,
      messages,
      hasMoreMessages: messages.length === (options?.messageLimit || 50),
      totalMessages: messages.length
    };
  }
}