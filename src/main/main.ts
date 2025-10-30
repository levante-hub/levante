// Fix PATH for packaged macOS apps - must be first import
import fixPath from "fix-path";

// Initialize PATH fix for macOS packaged apps
// This ensures Node.js, npm, npx, and other shell commands are available
// In development this has no effect, in production it reads from user's shell
fixPath();

import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import { join } from "path";
import { config } from "dotenv";
import { AIService, ChatRequest } from "./services/aiService";
import { databaseService } from "./services/databaseService";
import { setupDatabaseHandlers } from "./ipc/databaseHandlers";
import { setupPreferencesHandlers } from "./ipc/preferencesHandlers";
import { setupModelHandlers } from "./ipc/modelHandlers";
import { registerMCPHandlers, mcpService, configManager } from "./ipc/mcpHandlers";
import { setupLoggerHandlers } from "./ipc/loggerHandlers";
import { registerDebugHandlers } from "./ipc/debugHandlers";
import { setupWizardHandlers } from "./ipc/wizardHandlers";
import { setupProfileHandlers } from "./ipc/profileHandlers";
import { preferencesService } from "./services/preferencesService";
import { userProfileService } from "./services/userProfileService";
import { configMigrationService } from "./services/configMigrationService";
import { getLogger, initializeLogger } from "./services/logging";
import { createApplicationMenu } from "./menu";
import { updateService } from "./services/updateService";
import { deepLinkService } from "./services/deepLinkService";
import { oauthCallbackServer } from "./services/oauthCallbackServer";
import { safeOpenExternal } from "./utils/urlSecurity";

// Load environment variables from .env.local and .env files
config({ path: join(__dirname, "../../.env.local") });
config({ path: join(__dirname, "../../.env") });

// Initialize logger after environment variables are loaded
const logger = getLogger();
// Explicitly initialize logger with environment variables
initializeLogger();

// Initialize auto-updates
updateService.initialize();

// Register custom protocol for deep linking
// This should be called before app.whenReady()
if (process.defaultApp) {
  // Development mode with electron .
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("levante", process.execPath, [
      join(__dirname, "../../"),
    ]);
  }
} else {
  // Production mode
  app.setAsDefaultProtocolClient("levante");
}

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  // IMPORTANT: Set nativeTheme to follow system BEFORE creating window
  nativeTheme.themeSource = "system";

  logger.core.info("NativeTheme configured", {
    themeSource: nativeTheme.themeSource,
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
  });

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: join(__dirname, "../../resources/icons/icon.png"), // App icon
    // macOS: hiddenInset (hide titlebar but keep traffic lights)
    // Windows/Linux: default (keep native titlebar for now, can use frame: false for custom titlebar)
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#ffffff", // White background for titlebar
    trafficLightPosition:
      process.platform === "darwin" ? { x: 10, y: 10 } : undefined, // Position traffic lights (macOS only)
    // Note: For Windows/Linux without native titlebar, set frame: false and implement custom window controls
    webPreferences: {
      // Con Electron Forge + Vite, preload.js está en __dirname directamente
      preload: join(__dirname, "preload.js"),
      sandbox: true, // ✅ Enabled - renderer uses only Web APIs
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // Load the app
  // Electron Forge usa MAIN_WINDOW_VITE_DEV_SERVER_URL para dev
  // electron-vite usa ELECTRON_RENDERER_URL para dev

  // Debug: ver qué variables están disponibles
  logger.core.debug("Environment variables", {
    MAIN_WINDOW_VITE_DEV_SERVER_URL:
      process.env["MAIN_WINDOW_VITE_DEV_SERVER_URL"],
    ELECTRON_RENDERER_URL: process.env["ELECTRON_RENDERER_URL"],
    NODE_ENV: process.env.NODE_ENV,
    viteVars: Object.keys(process.env).filter((k) => k.includes("VITE")),
  });

  if (process.env["MAIN_WINDOW_VITE_DEV_SERVER_URL"]) {
    logger.core.info("Loading from Forge dev server", {
      url: process.env["MAIN_WINDOW_VITE_DEV_SERVER_URL"],
    });
    mainWindow.loadURL(process.env["MAIN_WINDOW_VITE_DEV_SERVER_URL"]);
  } else if (
    process.env.NODE_ENV === "development" &&
    process.env["ELECTRON_RENDERER_URL"]
  ) {
    logger.core.info("Loading from electron-vite dev server", {
      url: process.env["ELECTRON_RENDERER_URL"],
    });
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    // En producción con Forge: main está en .vite/build/main.js
    // y renderer está en .vite/renderer/main_window/index.html
    const filePath = join(__dirname, "../renderer/main_window/index.html");
    logger.core.info("Loading from file (production build)", { filePath });
    mainWindow.loadFile(filePath);
  }

  // Force light theme for window (affects titlebar on macOS)
  nativeTheme.themeSource = "light";

  // Show window when ready to prevent visual flash
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();

    if (process.env.NODE_ENV === "development") {
      mainWindow?.webContents.openDevTools();

      // Note: Autofill DevTools errors are a known Electron issue and cannot be suppressed
      // See: https://github.com/electron/electron/issues/46868
    }
  });

  // Handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Security: Handle external links with protocol validation
  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Validate and open URL with protocol allowlist (http, https, mailto only)
    // Blocks file://, javascript:, and other dangerous protocols
    safeOpenExternal(details.url, "window-open-handler");
    return { action: "deny" };
  });

  // Security: Prevent navigation to external/malicious URLs
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const parsedUrl = new URL(url);

    // Allow navigation within the app
    const isDevServer = url.startsWith(process.env["MAIN_WINDOW_VITE_DEV_SERVER_URL"] || "");
    const isLocalhost = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
    const isAppFile = parsedUrl.protocol === "file:";

    if (isDevServer || (isLocalhost && process.env.NODE_ENV === "development") || isAppFile) {
      // Allow internal navigation
      logger.core.debug("Allowing internal navigation", {
        url: parsedUrl.host + parsedUrl.pathname,
        protocol: parsedUrl.protocol
      });
      return;
    }

    // Block and open externally
    event.preventDefault();
    logger.core.info("Blocked external navigation, opening in browser", {
      protocol: parsedUrl.protocol,
      host: parsedUrl.host
    });

    // Open in external browser with validation
    safeOpenExternal(url, "will-navigate");
  });
}

// App event handlers
app.whenReady().then(async () => {
  // Set app user model id for windows
  if (process.platform === "win32") {
    app.setAppUserModelId("com.levante.app");
  }

  // Initialize database
  try {
    await databaseService.initialize();
    logger.core.info("Database initialized successfully");
  } catch (error) {
    logger.core.error("Failed to initialize database", {
      error: error instanceof Error ? error.message : error,
    });
    // Could show error dialog or continue with degraded functionality
  }

  // Run configuration migrations BEFORE initializing services
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

  // Initialize preferences service
  try {
    await preferencesService.initialize();
    logger.core.info("Preferences service initialized successfully");
  } catch (error) {
    logger.core.error("Failed to initialize preferences service", {
      error: error instanceof Error ? error.message : error,
    });
    // Could show error dialog or continue with degraded functionality
  }

  // Initialize user profile service
  try {
    await userProfileService.initialize();
    logger.core.info("User profile service initialized successfully");
  } catch (error) {
    logger.core.error("Failed to initialize user profile service", {
      error: error instanceof Error ? error.message : error,
    });
    // Could show error dialog or continue with degraded functionality
  }

  // Migrate MCP configuration to include disabled section
  try {
    await configManager.migrateConfiguration();
    logger.core.info("MCP configuration migrated successfully");
  } catch (error) {
    logger.core.error("Failed to migrate MCP configuration", {
      error: error instanceof Error ? error.message : error,
    });
  }

  // Setup IPC handlers
  setupDatabaseHandlers();
  setupPreferencesHandlers();
  setupModelHandlers();
  setupLoggerHandlers();
  setupWizardHandlers();
  setupProfileHandlers();
  registerMCPHandlers();
  registerDebugHandlers();

  createWindow();

  // Create application menu after window is created
  createApplicationMenu(mainWindow);

  // Register main window with deep link service and OAuth callback server
  if (mainWindow) {
    deepLinkService.setMainWindow(mainWindow);
    oauthCallbackServer.setMainWindow(mainWindow);
  }

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Graceful shutdown: cleanup before app quits
app.on("before-quit", async (event) => {
  event.preventDefault();

  logger.core.info("App is quitting, performing cleanup...");

  // Disconnect all MCP servers
  try {
    await mcpService.disconnectAll();
    logger.core.info("All MCP servers disconnected");
  } catch (error) {
    logger.core.error("Error disconnecting MCP servers", {
      error: error instanceof Error ? error.message : error,
    });
  }

  // Close database connection
  try {
    await databaseService.close();
    logger.core.info("Database connection closed");
  } catch (error) {
    logger.core.error("Error closing database", {
      error: error instanceof Error ? error.message : error,
    });
  }

  // Stop OAuth callback server
  try {
    await oauthCallbackServer.stop();
    logger.core.info("OAuth callback server stopped");
  } catch (error) {
    logger.core.error("Error stopping OAuth server", {
      error: error instanceof Error ? error.message : error,
    });
  }

  logger.core.info("Cleanup completed, exiting app");
  app.exit(0);
});

app.on("window-all-closed", () => {
  // On macOS, apps typically stay open until explicitly quit
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// IPC handlers for secure communication
ipcMain.handle("levante/app/version", () => {
  return app.getVersion();
});

ipcMain.handle("levante/app/platform", () => {
  return process.platform;
});

ipcMain.handle("levante/app/theme", () => {
  return {
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    themeSource: nativeTheme.themeSource,
  };
});

// Listen for theme changes and notify renderer
nativeTheme.on("updated", () => {
  if (mainWindow) {
    mainWindow.webContents.send("levante/app/theme-changed", {
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
      themeSource: nativeTheme.themeSource,
    });
  }
});

// Handle manual update check
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

// Handle opening external URLs with protocol validation
ipcMain.handle("levante/app/open-external", async (event, url: string) => {
  // Use centralized validation to prevent RCE via file://, javascript:, etc.
  return await safeOpenExternal(url, "ipc-handler");
});

// OAuth callback server handlers
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

// Initialize AI service
const aiService = new AIService();

// Track active streams for cancellation
const activeStreams = new Map<string, { cancel: () => void }>();

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

  // Track cancellation state
  let isCancelled = false;

  // Store cancellation function
  activeStreams.set(streamId, {
    cancel: () => {
      isCancelled = true;
      logger.aiSdk.info("Stream cancelled", { streamId });
    },
  });

  // Start streaming immediately - listeners should be ready (Expo pattern)
  setTimeout(async () => {
    try {
      logger.aiSdk.debug("Starting AI stream", { streamId });
      let chunkCount = 0;
      for await (const chunk of aiService.streamChat(request)) {
        chunkCount++;
        // logger.aiSdk.debug("Received chunk from AI service", {
        //   streamId,
        //   chunkCount,
        //   chunkType: chunk.delta
        //     ? "delta"
        //     : chunk.done
        //       ? "done"
        //       : chunk.error
        //         ? "error"
        //         : "other",
        //   chunk,
        // });

        // Check if stream was cancelled
        if (isCancelled) {
          logger.aiSdk.info("Stream cancelled, stopping generation", {
            streamId,
          });
          event.sender.send(`levante/chat/stream/${streamId}`, {
            error: "Stream cancelled by user",
            done: true,
          });
          break;
        }

        // Send chunk immediately without buffering (pattern from Expo)
        // logger.aiSdk.debug("Sending chunk to renderer", { streamId, chunkCount });
        event.sender.send(`levante/chat/stream/${streamId}`, chunk);
        // Small yield to prevent blocking the event loop
        await new Promise((resolve) => setImmediate(resolve));

        // Log when stream completes
        if (chunk.done) {
          logger.aiSdk.info("AI stream completed successfully", {
            streamId,
            totalChunks: chunkCount,
          });
          break;
        }
      }
      logger.aiSdk.info("Exited streaming loop", {
        streamId,
        totalChunks: chunkCount,
      });
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
      // Clean up active stream tracking
      activeStreams.delete(streamId);
      logger.aiSdk.debug("Stream cleanup complete", { streamId });
    }
  }, 10); // Reduced delay following Expo patterns

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

// Non-streaming chat handler (for compatibility)
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

// Deep link handlers
// macOS: Handle protocol URLs via 'open-url' event
app.on("open-url", (event, url) => {
  event.preventDefault();
  logger.core.info("Received deep link URL (open-url)", { url });
  deepLinkService.handleDeepLink(url);
});

// Windows/Linux: Handle protocol URLs via command-line arguments
// This needs to run after app is ready
app.whenReady().then(() => {
  // Check if app was launched with a deep link URL
  const args = process.argv;
  logger.core.debug("Process arguments", { args });

  // Look for levante:// protocol in arguments
  const deepLinkUrl = args.find((arg) => arg.startsWith("levante://"));
  if (deepLinkUrl) {
    logger.core.info("Received deep link URL (command-line)", {
      url: deepLinkUrl,
    });
    // Wait a bit to ensure window is ready
    setTimeout(() => {
      deepLinkService.handleDeepLink(deepLinkUrl);
    }, 1000);
  }
});
