import { ipcMain } from "electron";
import { chatService } from "../services/chatService";
import { databaseService } from "../services/databaseService";
import { titleGenerationService } from "../services/titleGenerationService";
import {
  CreateChatSessionInput,
  CreateMessageInput,
  UpdateChatSessionInput,
  UpdateMessageInput,
  GetMessagesQuery,
  GetChatSessionsQuery,
} from "../../types/database";
import { getLogger } from '../services/logging';

const logger = getLogger();

export function setupDatabaseHandlers() {
  // Database health check
  ipcMain.removeHandler("levante/db/health");
  ipcMain.handle("levante/db/health", async () => {
    try {
      const isHealthy = await databaseService.healthCheck();
      const info = databaseService.getDatabaseInfo();

      return {
        success: true,
        data: {
          healthy: isHealthy,
          ...info,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Chat Sessions
  ipcMain.removeHandler("levante/db/sessions/create");
  ipcMain.handle(
    "levante/db/sessions/create",
    async (_, input: CreateChatSessionInput) => {
      return await chatService.createSession(input);
    }
  );

  ipcMain.removeHandler("levante/db/sessions/get");
  ipcMain.handle("levante/db/sessions/get", async (_, id: string) => {
    return await chatService.getSession(id);
  });

  ipcMain.removeHandler("levante/db/sessions/list");
  ipcMain.handle(
    "levante/db/sessions/list",
    async (_, query: GetChatSessionsQuery) => {
      return await chatService.getSessions(query);
    }
  );

  ipcMain.removeHandler("levante/db/sessions/update");
  ipcMain.handle(
    "levante/db/sessions/update",
    async (_, input: UpdateChatSessionInput) => {
      return await chatService.updateSession(input);
    }
  );

  ipcMain.removeHandler("levante/db/sessions/delete");
  ipcMain.handle("levante/db/sessions/delete", async (_, id: string) => {
    return await chatService.deleteSession(id);
  });

  // Messages
  ipcMain.removeHandler("levante/db/messages/create");
  ipcMain.handle(
    "levante/db/messages/create",
    async (_, input: CreateMessageInput) => {
      return await chatService.createMessage(input);
    }
  );

  ipcMain.removeHandler("levante/db/messages/list");
  ipcMain.handle(
    "levante/db/messages/list",
    async (_, query: GetMessagesQuery) => {
      return await chatService.getMessages(query);
    }
  );

  ipcMain.removeHandler("levante/db/messages/search");
  ipcMain.handle(
    "levante/db/messages/search",
    async (_, searchQuery: string, sessionId?: string, limit?: number) => {
      return await chatService.searchMessages(searchQuery, sessionId, limit);
    }
  );

  // Update message
  ipcMain.removeHandler("levante/db/messages/update");
  ipcMain.handle(
    "levante/db/messages/update",
    async (_, input: UpdateMessageInput) => {
      return await chatService.updateMessage(input);
    }
  );

  // Delete messages after timestamp
  ipcMain.removeHandler("levante/db/messages/deleteAfter");
  ipcMain.handle(
    "levante/db/messages/deleteAfter",
    async (_, sessionId: string, afterTimestamp: number) => {
      return await chatService.deleteMessagesAfter(sessionId, afterTimestamp);
    }
  );

  // Title generation
  ipcMain.removeHandler("levante/db/generateTitle");
  ipcMain.handle("levante/db/generateTitle", async (_, message: string) => {
    try {
      const title = await titleGenerationService.generateTitle(message);
      return {
        success: true,
        data: title,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Migration diagnostics
  ipcMain.removeHandler("levante/db/migrations/status");
  ipcMain.handle("levante/db/migrations/status", async () => {
    try {
      // Get current schema version
      const result = await databaseService.execute(
        'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1'
      );
      const currentVersion = result.rows.length > 0 ? Number(result.rows[0][0]) : 0;

      // Get all applied migrations
      const allResult = await databaseService.execute(
        'SELECT version, applied_at FROM schema_migrations ORDER BY version'
      );
      const appliedMigrations = allResult.rows.map(row => ({
        version: Number(row[0]),
        appliedAt: Number(row[1])
      }));

      return {
        success: true,
        data: {
          currentVersion,
          appliedMigrations,
          expectedVersion: 6, // Latest migration version
          needsMigration: currentVersion < 6
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  });

  // Force re-run migrations (for development/debugging)
  ipcMain.removeHandler("levante/db/migrations/run");
  ipcMain.handle("levante/db/migrations/run", async () => {
    try {
      logger.database.info("Manually triggering database migrations...");

      // Re-initialize database (which runs migrations)
      await databaseService.initialize();

      return {
        success: true,
        data: { message: "Migrations completed successfully" }
      };
    } catch (error) {
      logger.database.error("Manual migration failed", {
        error: error instanceof Error ? error.message : error
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  });

  logger.ipc.info('Database IPC handlers registered');
}
