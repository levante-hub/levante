/**
 * Application Initialization Module
 *
 * Handles startup sequence:
 * - Database initialization
 * - Config migrations
 * - Service initialization
 * - IPC handler registration
 */

import { app, BrowserWindow } from "electron";
import { getLogger } from "../services/logging";
import { databaseService } from "../services/databaseService";
import { preferencesService } from "../services/preferencesService";
import { userProfileService } from "../services/userProfileService";
import { configMigrationService } from "../services/configMigrationService";
import { setupDatabaseHandlers } from "../ipc/databaseHandlers";
import { setupPreferencesHandlers } from "../ipc/preferencesHandlers";
import { setupModelHandlers } from "../ipc/modelHandlers";
import { setupLoggerHandlers } from "../ipc/loggerHandlers";
import { setupWizardHandlers } from "../ipc/wizardHandlers";
import { setupProfileHandlers } from "../ipc/profileHandlers";
import { registerMCPHandlers, configManager } from "../ipc/mcpHandlers";
import { registerDebugHandlers } from "../ipc/debugHandlers";
import { setupChatHandlers } from "../ipc/chatHandlers";
import { setupAppHandlers } from "../ipc/appHandlers";
import { setupOAuthHandlers } from "../ipc/oauthHandlers";

const logger = getLogger();

/**
 * Initialize all application services
 * Should be called during app.whenReady()
 */
export async function initializeServices(): Promise<void> {
  // Set app user model id for Windows
  if (process.platform === "win32") {
    app.setAppUserModelId("com.levante.app");
  }

  // 1. Initialize database
  try {
    await databaseService.initialize();
    logger.core.info("Database initialized successfully");
  } catch (error) {
    logger.core.error("Failed to initialize database", {
      error: error instanceof Error ? error.message : error,
    });
    // Could show error dialog or continue with degraded functionality
  }

  // 2. Run configuration migrations BEFORE initializing services
  // This ensures old JSON files are migrated before electron-store loads them
  try {
    await configMigrationService.runMigrations();
    logger.core.info("Config migrations completed successfully");
  } catch (error) {
    logger.core.error("Failed to run config migrations", {
      error: error instanceof Error ? error.message : error,
    });
    // Continue with degraded functionality
  }

  // 3. Initialize preferences service
  try {
    await preferencesService.initialize();
    logger.core.info("Preferences service initialized successfully");
  } catch (error) {
    logger.core.error("Failed to initialize preferences service", {
      error: error instanceof Error ? error.message : error,
    });
    // Could show error dialog or continue with degraded functionality
  }

  // 4. Initialize user profile service
  try {
    await userProfileService.initialize();
    logger.core.info("User profile service initialized successfully");
  } catch (error) {
    logger.core.error("Failed to initialize user profile service", {
      error: error instanceof Error ? error.message : error,
    });
    // Could show error dialog or continue with degraded functionality
  }

  // 5. Migrate MCP configuration to include disabled section
  try {
    await configManager.migrateConfiguration();
    logger.core.info("MCP configuration migrated successfully");
  } catch (error) {
    logger.core.error("Failed to migrate MCP configuration", {
      error: error instanceof Error ? error.message : error,
    });
  }
}

/**
 * Register all IPC handlers
 * Should be called after service initialization
 * @param getMainWindow - Function to get current main window reference
 */
export function registerIPCHandlers(getMainWindow: () => BrowserWindow | null): void {
  // Service-specific handlers
  setupDatabaseHandlers();
  setupPreferencesHandlers();
  setupModelHandlers();
  setupLoggerHandlers();
  setupWizardHandlers();
  setupProfileHandlers();
  registerMCPHandlers();
  registerDebugHandlers();

  // App-level handlers
  setupChatHandlers();
  setupAppHandlers(getMainWindow);
  setupOAuthHandlers();

  logger.core.info("All IPC handlers registered successfully");
}
