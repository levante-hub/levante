import { ipcMain } from 'electron';
import { Container } from '../../infrastructure/di/Container';
import { ChatConversationPort } from '../../domain/ports/primary/ChatConversationPort';

export async function setupHexagonalChatHandlers(): Promise<void> {
  const container = Container.getInstance();
  const chatUseCase = container.resolve<ChatConversationPort>('ChatConversationUseCase');

  // Streaming chat con arquitectura hexagonal
  ipcMain.handle('levante/hexagonal/chat/stream', async (event, message: string, options: any) => {
    const streamId = `hexagonal_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    setTimeout(async () => {
      try {
        for await (const chunk of chatUseCase.streamMessage(message, options)) {
          event.sender.send(`levante/hexagonal/chat/stream/${streamId}`, chunk);
          await new Promise(resolve => setImmediate(resolve));
        }
      } catch (error) {
        event.sender.send(`levante/hexagonal/chat/stream/${streamId}`, {
          error: error instanceof Error ? error.message : 'Stream error',
          done: true
        });
      }
    }, 10);

    return { streamId };
  });

  // Send message con arquitectura hexagonal  
  ipcMain.handle('levante/hexagonal/chat/send', async (_, message: string, options: any) => {
    try {
      const result = await chatUseCase.sendMessage(message, options);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Create conversation
  ipcMain.handle('levante/hexagonal/conversation/create', async (_, title?: string, modelId?: string) => {
    try {
      const session = await chatUseCase.createNewConversation(title, modelId);
      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Load conversation
  ipcMain.handle('levante/hexagonal/conversation/load', async (_, sessionId: string, options?: any) => {
    try {
      const conversation = await chatUseCase.loadConversation(sessionId, options);
      return { success: true, data: conversation };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  console.log('Hexagonal chat IPC handlers registered');
}