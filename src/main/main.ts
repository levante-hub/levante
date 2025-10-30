// Fix PATH for packaged macOS/Linux apps - must be first import
// Safe on Windows (no-op), required for macOS/Linux GUI apps
import fixPath from "fix-path";
fixPath();

import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import { join } from "path";
import { config } from "dotenv";
import { getLogger, initializeLogger } from "./services/logging";
import { updateService } from "./services/updateService";
import { deepLinkService } from "./services/deepLinkService";
import { oauthCallbackServer } from "./services/oauthCallbackServer";
import { createApplicationMenu } from "./menu";
import { AIService, ChatRequest } from "./services/aiService";
import { safeOpenExternal } from "./utils/urlSecurity";

// Lifecycle modules
import { initializeServices, registerIPCHandlers } from "./lifecycle/initialization";
import { createMainWindow } from "./lifecycle/window";
import { registerAppEvents, setupDeepLinkHandling } from "./lifecycle/events";

// Load environment variables
config({ path: join(__dirname, "../../.env.local") });
config({ path: join(__dirname, "../../.env") });

// Initialize logger
const logger = getLogger();
initializeLogger();

// Initialize auto-updates
updateService.initialize();

// Register custom protocol for deep linking
if (process.defaultApp) {
  // Development mode
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("levante", process.execPath, [
      join(__dirname, "../../"),
    ]);
  }
} else {
  // Production mode
  app.setAsDefaultProtocolClient("levante");
}

// Keep global reference to main window
let mainWindow: BrowserWindow | null = null;

// App ready event
app.whenReady().then(async () => {
  // Initialize all services
  await initializeServices();

  // Register all IPC handlers
  registerIPCHandlers();

  // Create main window
  mainWindow = createMainWindow();

  // Create application menu
  createApplicationMenu(mainWindow);

  // Register main window with services
  deepLinkService.setMainWindow(mainWindow);
  oauthCallbackServer.setMainWindow(mainWindow);

  // Register app event handlers
  registerAppEvents(() => mainWindow);

  // Setup deep link handling (Windows/Linux)
  setupDeepLinkHandling();
});

// =============================================================================
// IPC Handlers for Chat and App Metadata
// =============================================================================

const aiService = new AIService();
const activeStreams = new Map<string, { cancel: () => void }>();

// App version
ipcMain.handle("levante/app/version", () => {
  return app.getVersion();
});

// App platform
ipcMain.handle("levante/app/platform", () => {
  return process.platform;
});

// App theme
ipcMain.handle("levante/app/theme", () => {
  return {
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    themeSource: nativeTheme.themeSource,
  };
});

// Theme change notifications
nativeTheme.on("updated", () => {
  if (mainWindow) {
    mainWindow.webContents.send("levante/app/theme-changed", {
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
      themeSource: nativeTheme.themeSource,
    });
  }
});

// Manual update check
ipcMain.handle("levante/app/check-for-updates", async () => {
  try {
    await updateService.checkForUpdates();
    return { success: true };
  } catch (error) {
    logger.core.error("Error in manual update check", {
      error: error instanceof Error ? error.message : error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Open external URLs
ipcMain.handle("levante/app/open-external", async (event, url: string) => {
  return await safeOpenExternal(url, "ipc-handler");
});

// OAuth callback server
ipcMain.handle("levante/oauth/start-server", async () => {
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
});

ipcMain.handle("levante/oauth/stop-server", async () => {
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
});

// Streaming chat handler
ipcMain.handle("levante/chat/stream", async (event, request: ChatRequest) => {
  const streamId = `stream_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 11)}`;

  logger.aiSdk.debug("Received chat stream request", {
    requestId: streamId,
    model: request.model,
    messagesCount: request.messages.length,
  });

  let isCancelled = false;

  activeStreams.set(streamId, {
    cancel: () => {
      isCancelled = true;
      logger.aiSdk.info("Stream cancelled", { streamId });
    },
  });

  setTimeout(async () => {
    try {
      logger.aiSdk.debug("Starting AI stream", { streamId });
      let chunkCount = 0;
      for await (const chunk of aiService.streamChat(request)) {
        chunkCount++;

        if (isCancelled) {
          logger.aiSdk.info("Stream cancelled, stopping generation", { streamId });
          event.sender.send(`levante/chat/stream/${streamId}`, {
            error: "Stream cancelled by user",
            done: true,
          });
          break;
        }

        event.sender.send(`levante/chat/stream/${streamId}`, chunk);
        await new Promise((resolve) => setImmediate(resolve));

        if (chunk.done) {
          logger.aiSdk.info("AI stream completed successfully", {
            streamId,
            totalChunks: chunkCount,
          });
          break;
        }
      }
      logger.aiSdk.info("Exited streaming loop", { streamId, totalChunks: chunkCount });
    } catch (error) {
      logger.aiSdk.error("AI Stream error", {
        streamId,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      event.sender.send(`levante/chat/stream/${streamId}`, {
        error: error instanceof Error ? error.message : "Stream error",
        done: true,
      });
    } finally {
      activeStreams.delete(streamId);
      logger.aiSdk.debug("Stream cleanup complete", { streamId });
    }
  }, 10);

  logger.aiSdk.debug("Returning streamId", { streamId });
  return { streamId };
});

// Stop streaming handler
ipcMain.handle("levante/chat/stop-stream", async (event, streamId: string) => {
  logger.aiSdk.debug("Received stop stream request", { streamId });

  try {
    const streamControl = activeStreams.get(streamId);
    if (streamControl) {
      streamControl.cancel();
      activeStreams.delete(streamId);
      logger.aiSdk.info("Stream stopped successfully", { streamId });
      return { success: true };
    } else {
      logger.aiSdk.warn("Stream not found or already completed", { streamId });
      return { success: false, error: "Stream not found or already completed" };
    }
  } catch (error) {
    logger.aiSdk.error("Error stopping stream", {
      streamId,
      error: error instanceof Error ? error.message : error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Non-streaming chat handler
ipcMain.handle("levante/chat/send", async (event, request: ChatRequest) => {
  try {
    const result = await aiService.sendSingleMessage(request);
    return {
      success: true,
      ...result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});
