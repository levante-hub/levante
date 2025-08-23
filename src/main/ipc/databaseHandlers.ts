import { ipcMain } from 'electron';
import { chatService } from '../services/chatService';
import { databaseService } from '../services/databaseService';
import { titleGenerationService } from '../services/titleGenerationService';
import {
  CreateChatSessionInput,
  CreateMessageInput,
  UpdateChatSessionInput,
  GetMessagesQuery,
  GetChatSessionsQuery
} from '../../types/database';

export function setupDatabaseHandlers() {
  // Database health check
  ipcMain.handle('levante/db/health', async () => {
    try {
      const isHealthy = await databaseService.healthCheck();
      const info = databaseService.getDatabaseInfo();
      
      return {
        success: true,
        data: {
          healthy: isHealthy,
          ...info
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Chat Sessions
  ipcMain.handle('levante/db/sessions/create', async (_, input: CreateChatSessionInput) => {
    return await chatService.createSession(input);
  });

  ipcMain.handle('levante/db/sessions/get', async (_, id: string) => {
    return await chatService.getSession(id);
  });

  ipcMain.handle('levante/db/sessions/list', async (_, query: GetChatSessionsQuery) => {
    return await chatService.getSessions(query);
  });

  ipcMain.handle('levante/db/sessions/update', async (_, input: UpdateChatSessionInput) => {
    return await chatService.updateSession(input);
  });

  ipcMain.handle('levante/db/sessions/delete', async (_, id: string) => {
    return await chatService.deleteSession(id);
  });

  // Messages
  ipcMain.handle('levante/db/messages/create', async (_, input: CreateMessageInput) => {
    return await chatService.createMessage(input);
  });

  ipcMain.handle('levante/db/messages/list', async (_, query: GetMessagesQuery) => {
    return await chatService.getMessages(query);
  });

  ipcMain.handle('levante/db/messages/search', async (_, searchQuery: string, sessionId?: string, limit?: number) => {
    return await chatService.searchMessages(searchQuery, sessionId, limit);
  });

  // Title generation
  ipcMain.handle('levante/db/generateTitle', async (_, message: string) => {
    try {
      const title = await titleGenerationService.generateTitle(message);
      return {
        success: true,
        data: title
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  console.log('Database IPC handlers registered');
}