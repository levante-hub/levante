import { ChatSession } from '../entities/ChatSession';
import { ChatSessionRepositorySimple } from '../ports/secondary/ChatSessionRepositorySimple';

export class CreateConversationUseCase {
  constructor(private sessionRepo: ChatSessionRepositorySimple) {}

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