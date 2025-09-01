import { ChatSession } from '../entities/ChatSession';
import { ChatSessionRepository } from '../ports/secondary/ChatSessionRepository';

export class CreateConversationUseCase {
  constructor(private sessionRepo: ChatSessionRepository) {}

  async execute(title?: string, modelId?: string): Promise<ChatSession> {
    const effectiveTitle = title || `New Chat - ${new Date().toLocaleDateString()}`;
    const effectiveModel = modelId || 'openai/gpt-4o';

    const session = ChatSession.create(effectiveTitle, effectiveModel);
    const result = await this.sessionRepo.save(session);
    
    if (!result.success || !result.data) {
      throw new Error('Failed to create conversation');
    }

    return result.data;
  }
}