/**
 * OAuth Callback Server IPC Handlers Module
 *
 * Handles OAuth callback server control:
 * - Starting local OAuth callback server
 * - Stopping OAuth callback server
 */

import { ipcMain, IpcMainInvokeEvent } from "electron";
import { getLogger } from "../services/logging";
import { oauthCallbackServer } from "../services/oauthCallbackServer";

const logger = getLogger();

/**
 * Register all OAuth-related IPC handlers
 */
export function setupOAuthHandlers(): void {
  // Start OAuth callback server
  ipcMain.handle("levante/oauth/start-server", handleStartServer);

  // Stop OAuth callback server
  ipcMain.handle("levante/oauth/stop-server", handleStopServer);

  logger.core.info("OAuth handlers registered successfully");
}

/**
 * Start the local OAuth callback server
 */
async function handleStartServer(): Promise<{
  success: boolean;
  port?: number;
  callbackUrl?: string;
  error?: string;
}> {
  try {
    logger.core.info("Starting OAuth callback server");
    const result = await oauthCallbackServer.start();
    logger.core.info("OAuth callback server started", result);
    return { success: true, ...result };
  } catch (error) {
    logger.core.error("Error starting OAuth callback server", {
      error: error instanceof Error ? error.message : error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Stop the OAuth callback server
 */
async function handleStopServer(): Promise<{ success: boolean; error?: string }> {
  try {
    logger.core.info("Stopping OAuth callback server");
    await oauthCallbackServer.stop();
    return { success: true };
  } catch (error) {
    logger.core.error("Error stopping OAuth callback server", {
      error: error instanceof Error ? error.message : error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
