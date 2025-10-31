/**
 * Graceful Shutdown Module
 *
 * Handles cleanup of all resources before app exit:
 * - MCP server disconnection
 * - Database closure
 * - OAuth server shutdown
 */

import { getLogger } from "../services/logging";
import { databaseService } from "../services/databaseService";
import { mcpService } from "../ipc/mcpHandlers";
import { oauthCallbackServer } from "../services/oauthCallbackServer";

const logger = getLogger();

/**
 * Performs graceful shutdown of all services
 * Call this before app.exit() to ensure clean resource cleanup
 *
 * NOTE: Event listeners (like nativeTheme) should be removed BEFORE
 * calling this function to allow the event loop to close properly.
 */
export async function gracefulShutdown(): Promise<void> {
  logger.core.info("App is quitting, performing cleanup...");

  // 1. Disconnect all MCP servers
  try {
    await mcpService.disconnectAll();
    logger.core.info("All MCP servers disconnected");
  } catch (error) {
    logger.core.error("Error disconnecting MCP servers", {
      error: error instanceof Error ? error.message : error,
    });
  }

  // 2. Close database connection
  try {
    await databaseService.close();
    logger.core.info("Database connection closed");
  } catch (error) {
    logger.core.error("Error closing database", {
      error: error instanceof Error ? error.message : error,
    });
  }

  // 3. Stop OAuth callback server
  try {
    await oauthCallbackServer.stop();
    logger.core.info("OAuth callback server stopped");
  } catch (error) {
    logger.core.error("Error stopping OAuth server", {
      error: error instanceof Error ? error.message : error,
    });
  }

  logger.core.info("Cleanup completed, ready to exit");
}
