import { ipcMain } from 'electron';
import { getMainProcessContainer } from '../../infrastructure/container/ElectronServiceContainer';
import { ChatSessionPort } from '../../../domain/ports/primary/ChatSessionPort';

export function setupChatSessionHandlers() {
  const container = getMainProcessContainer();
  const chatSessionService: ChatSessionPort = container.getChatSessionService();

  // List chat sessions
  ipcMain.removeHandler('levante/chat-sessions/list');
  ipcMain.handle('levante/chat-sessions/list', async (_, options?: {
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    try {
      const result = await chatSessionService.listSessions(options);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('[ChatSessionHandlers] Failed to list sessions:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get specific chat session
  ipcMain.removeHandler('levante/chat-sessions/get');
  ipcMain.handle('levante/chat-sessions/get', async (_, sessionId: string) => {
    try {
      const session = await chatSessionService.getSession(sessionId);
      return {
        success: true,
        data: session
      };
    } catch (error) {
      console.error('[ChatSessionHandlers] Failed to get session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Update chat session
  ipcMain.removeHandler('levante/chat-sessions/update');
  ipcMain.handle('levante/chat-sessions/update', async (_, sessionId: string, updates: {
    title?: string;
    archived?: boolean;
    starred?: boolean;
    folderId?: string;
    tags?: string[];
    metadata?: Record<string, any>;
  }) => {
    try {
      const session = await chatSessionService.updateSession(sessionId, updates);
      return {
        success: true,
        data: session
      };
    } catch (error) {
      console.error('[ChatSessionHandlers] Failed to update session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Update session title
  ipcMain.removeHandler('levante/chat-sessions/update-title');
  ipcMain.handle('levante/chat-sessions/update-title', async (_, sessionId: string, title: string) => {
    try {
      const session = await chatSessionService.updateSessionTitle(sessionId, title);
      return {
        success: true,
        data: session
      };
    } catch (error) {
      console.error('[ChatSessionHandlers] Failed to update session title:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Delete chat session
  ipcMain.removeHandler('levante/chat-sessions/delete');
  ipcMain.handle('levante/chat-sessions/delete', async (_, sessionId: string, options?: { archive?: boolean }) => {
    try {
      const result = await chatSessionService.deleteSession(sessionId, options);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('[ChatSessionHandlers] Failed to delete session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Search chat sessions
  ipcMain.removeHandler('levante/chat-sessions/search');
  ipcMain.handle('levante/chat-sessions/search', async (_, options: {
    query: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    includeArchived?: boolean;
    modelFilter?: string[];
    dateRange?: { start?: Date; end?: Date };
  }) => {
    try {
      const result = await chatSessionService.searchSessions(options);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('[ChatSessionHandlers] Failed to search sessions:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Archive/unarchive session
  ipcMain.removeHandler('levante/chat-sessions/archive');
  ipcMain.handle('levante/chat-sessions/archive', async (_, sessionId: string, archived: boolean) => {
    try {
      const session = await chatSessionService.archiveSession(sessionId, archived);
      return {
        success: true,
        data: session
      };
    } catch (error) {
      console.error('[ChatSessionHandlers] Failed to archive session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Star/unstar session
  ipcMain.removeHandler('levante/chat-sessions/star');
  ipcMain.handle('levante/chat-sessions/star', async (_, sessionId: string, starred: boolean) => {
    try {
      const session = await chatSessionService.starSession(sessionId, starred);
      return {
        success: true,
        data: session
      };
    } catch (error) {
      console.error('[ChatSessionHandlers] Failed to star session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Move session to folder
  ipcMain.removeHandler('levante/chat-sessions/move-to-folder');
  ipcMain.handle('levante/chat-sessions/move-to-folder', async (_, sessionId: string, folderId?: string) => {
    try {
      const session = await chatSessionService.moveToFolder(sessionId, folderId);
      return {
        success: true,
        data: session
      };
    } catch (error) {
      console.error('[ChatSessionHandlers] Failed to move session to folder:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Duplicate session
  ipcMain.removeHandler('levante/chat-sessions/duplicate');
  ipcMain.handle('levante/chat-sessions/duplicate', async (_, sessionId: string, title?: string) => {
    try {
      const session = await chatSessionService.duplicateSession(sessionId, title);
      return {
        success: true,
        data: session
      };
    } catch (error) {
      console.error('[ChatSessionHandlers] Failed to duplicate session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get session statistics
  ipcMain.removeHandler('levante/chat-sessions/stats');
  ipcMain.handle('levante/chat-sessions/stats', async () => {
    try {
      const stats = await chatSessionService.getSessionStats();
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      console.error('[ChatSessionHandlers] Failed to get session stats:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Bulk delete sessions
  ipcMain.removeHandler('levante/chat-sessions/bulk-delete');
  ipcMain.handle('levante/chat-sessions/bulk-delete', async (_, sessionIds: string[]) => {
    try {
      const results = await chatSessionService.bulkDeleteSessions(sessionIds);
      return {
        success: true,
        data: results
      };
    } catch (error) {
      console.error('[ChatSessionHandlers] Failed to bulk delete sessions:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Bulk archive sessions
  ipcMain.removeHandler('levante/chat-sessions/bulk-archive');
  ipcMain.handle('levante/chat-sessions/bulk-archive', async (_, sessionIds: string[], archived: boolean) => {
    try {
      const sessions = await chatSessionService.bulkArchiveSessions(sessionIds, archived);
      return {
        success: true,
        data: sessions
      };
    } catch (error) {
      console.error('[ChatSessionHandlers] Failed to bulk archive sessions:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Export session
  ipcMain.removeHandler('levante/chat-sessions/export');
  ipcMain.handle('levante/chat-sessions/export', async (_, sessionId: string, format: 'json' | 'markdown' | 'txt' = 'json') => {
    try {
      const exportData = await chatSessionService.exportSession(sessionId, format);
      return {
        success: true,
        data: exportData
      };
    } catch (error) {
      console.error('[ChatSessionHandlers] Failed to export session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Import session
  ipcMain.removeHandler('levante/chat-sessions/import');
  ipcMain.handle('levante/chat-sessions/import', async (_, importData: {
    format: 'json' | 'markdown' | 'txt';
    data: string | object;
  }) => {
    try {
      const session = await chatSessionService.importSession(importData);
      return {
        success: true,
        data: session
      };
    } catch (error) {
      console.error('[ChatSessionHandlers] Failed to import session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  console.log('[ChatSessionHandlers] IPC handlers registered');
}