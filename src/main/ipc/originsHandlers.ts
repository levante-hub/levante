/**
 * Origins IPC Handlers
 *
 * Handles IPC communication for Levante Origins (Telegram, etc.)
 */

import { ipcMain } from "electron";
import { telegramService } from "../services/telegramService";
import { preferencesService } from "../services/preferencesService";
import { getLogger } from "../services/logging";
import type { TelegramOriginConfig } from "../../types/origins";

const logger = getLogger();

export function setupOriginsHandlers(): void {
  // Start Telegram bot
  ipcMain.handle("levante/origins/telegram/start", async () => {
    try {
      await telegramService.start();
      return { success: true, data: telegramService.getStatus() };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Stop Telegram bot
  ipcMain.handle("levante/origins/telegram/stop", async () => {
    try {
      await telegramService.stop();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Get current status
  ipcMain.handle("levante/origins/telegram/status", async () => {
    try {
      return { success: true, data: telegramService.getStatus() };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Validate bot token (test connection without starting)
  ipcMain.handle(
    "levante/origins/telegram/validate-token",
    async (_event, token: string) => {
      try {
        const { Telegraf } = await import("telegraf");
        const testBot = new Telegraf(token);
        const me = await testBot.telegram.getMe();
        return {
          success: true,
          data: { username: me.username, firstName: me.first_name },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Invalid token",
        };
      }
    }
  );

  // Unlink owner (reset ownerChatId)
  ipcMain.handle("levante/origins/telegram/unlink-owner", async () => {
    try {
      const origins = (preferencesService.get("origins") as {
        telegram?: TelegramOriginConfig;
      }) || {};
      if (origins.telegram) {
        origins.telegram.ownerChatId = null;
        preferencesService.set("origins", origins);
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  logger.ipc.info("Origins IPC handlers registered");
}
