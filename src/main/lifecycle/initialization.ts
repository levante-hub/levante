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
import { getLogger, setLogTimezone } from "../services/logging";
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
import { setupInferenceHandlers } from "../ipc/inferenceHandlers";
import { setupAttachmentHandlers } from "../ipc/attachmentHandlers";
import { registerAnalyticsHandlers } from "../ipc/analyticsHandlers";
import { setupWidgetHandlers } from "../ipc/widgetHandlers";
import { setupAnnouncementHandlers } from "../ipc/announcementHandlers";
import { setupCoworkHandlers } from "../ipc/coworkHandlers";
import { setupTaskHandlers } from "../ipc/taskHandlers";
import { setupProjectHandlers } from "../ipc/projectHandlers";
import { setupSkillsHandlers } from "../ipc/skillsHandlers";
import { setupPlatformHandlers } from "../ipc/platformHandlers";
import { setupSubscriptionOAuthHandlers } from "../ipc/subscriptionOAuthHandlers";
import { setupFileSystemHandlers } from "../ipc/fileSystemHandlers";
import { setupCompactionHandlers } from "../ipc/compactionHandlers";
import { setupContextBudgetHandlers } from "../ipc/contextBudgetHandlers";
import { setupOriginsHandlers } from "../ipc/originsHandlers";
import { registerPdfProtocol } from "../services/filesystem/pdfProtocolService";

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

    // Configure log timezone from user preferences
    const timezone = preferencesService.get("timezone");
    if (timezone) {
      setLogTimezone(timezone);
      logger.core.info("Log timezone configured", { timezone });
    }
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

  // 6. Register PDF protocol handler
  registerPdfProtocol();
  logger.core.info("PDF protocol registered successfully");

  // 7. Auto-start Origins (Telegram) if enabled
  try {
    const origins = preferencesService.get("origins") as
      | { telegram?: { enabled?: boolean; botToken?: string } }
      | undefined;
    if (origins?.telegram?.enabled && origins.telegram.botToken) {
      const { telegramService } = await import("../services/telegramService");
      telegramService.start().catch((error) => {
        logger.core.error("Failed to auto-start Telegram bot", {
          error: error instanceof Error ? error.message : error,
        });
      });
    }
  } catch (error) {
    logger.core.error("Failed to check Origins auto-start", {
      error: error instanceof Error ? error.message : error,
    });
  }
}

/**
 * Register all IPC handlers
 * Should be called after service initialization
 * @param getMainWindow - Function to get current main window reference
 */
export async function registerIPCHandlers(getMainWindow: () => BrowserWindow | null): Promise<void> {
  // Service-specific handlers
  setupDatabaseHandlers();
  setupPreferencesHandlers();
  setupModelHandlers();
  setupInferenceHandlers();
  setupAttachmentHandlers();
  setupLoggerHandlers();
  setupWizardHandlers();
  setupProfileHandlers();
  await registerMCPHandlers();
  registerDebugHandlers();
  registerAnalyticsHandlers();

  // App-level handlers
  setupChatHandlers();
  setupCompactionHandlers();
  setupContextBudgetHandlers();
  setupAppHandlers(getMainWindow);
  setupOAuthHandlers();
  setupWidgetHandlers();
  setupAnnouncementHandlers();
  setupCoworkHandlers();
  setupTaskHandlers(getMainWindow);
  setupProjectHandlers();
  setupSkillsHandlers();
  setupPlatformHandlers();
  setupSubscriptionOAuthHandlers();
  setupFileSystemHandlers(getMainWindow);
  setupOriginsHandlers();

  // Note: Log viewer handlers are registered separately in main.ts after window creation

  logger.core.info("All IPC handlers registered successfully");
}
