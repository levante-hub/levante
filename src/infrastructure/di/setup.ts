import { Container } from './Container';
import { ChatSessionRepositoryImpl } from '../adapters/secondary/ChatSessionRepositoryImpl';
import { MessageRepositoryImpl } from '../adapters/secondary/MessageRepositoryImpl';
import { CreateConversationUseCase } from '../../domain/use-cases/CreateConversationUseCase';
import { SendMessageUseCase } from '../../domain/use-cases/SendMessageUseCase';
import { LoadConversationUseCase } from '../../domain/use-cases/LoadConversationUseCase';
import { ChatConversationUseCase } from '../../domain/use-cases/ChatConversationUseCase';

// Import services from main process
let aiService: any;
let chatService: any;

// Lazy imports to avoid circular dependencies
async function getServices() {
  if (!aiService || !chatService) {
    const { AIService } = await import('../../main/services/aiService');
    const { chatService: cs } = await import('../../main/services/chatService');
    aiService = new AIService();
    chatService = cs;
  }
  return { aiService, chatService };
}

export async function setupDependencies(): Promise<void> {
  const container = Container.getInstance();
  const { aiService: ai } = await getServices();

  // Secondary Ports (Adapters)
  container.register('ChatSessionRepository', () => 
    new ChatSessionRepositoryImpl()
  );
  
  container.register('MessageRepository', () => 
    new MessageRepositoryImpl()
  );


  // Use Cases
  container.register('CreateConversationUseCase', () =>
    new CreateConversationUseCase(container.resolve('ChatSessionRepository'))
  );

  container.register('SendMessageUseCase', () =>
    new SendMessageUseCase(ai)
  );

  container.register('LoadConversationUseCase', () =>
    new LoadConversationUseCase(
      container.resolve('ChatSessionRepository'),
      container.resolve('MessageRepository')
    )
  );

  // Primary Port (Compositor)
  container.register('ChatConversationUseCase', () =>
    new ChatConversationUseCase(
      container.resolve('SendMessageUseCase'),
      container.resolve('LoadConversationUseCase'),
      container.resolve('CreateConversationUseCase')
    )
  );
}