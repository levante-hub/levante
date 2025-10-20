import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "path";
import { config } from "dotenv";
import { AIService, ChatRequest } from "./services/aiService";
import { databaseService } from "./services/databaseService";
import { setupDatabaseHandlers } from "./ipc/databaseHandlers";
import { setupPreferencesHandlers } from "./ipc/preferencesHandlers";
import { setupModelHandlers } from "./ipc/modelHandlers";
import { registerMCPHandlers, configManager } from "./ipc/mcpHandlers";
import { setupLoggerHandlers } from "./ipc/loggerHandlers";
import { registerDebugHandlers } from "./ipc/debugHandlers";
import { setupWizardHandlers } from "./ipc/wizardHandlers";
import { setupProfileHandlers } from "./ipc/profileHandlers";
import { preferencesService } from "./services/preferencesService";
import { userProfileService } from "./services/userProfileService";
import { getLogger, initializeLogger } from "./services/logging";

// Load environment variables from .env.local and .env files
config({ path: join(__dirname, "../../.env.local") });
config({ path: join(__dirname, "../../.env") });

// Initialize logger after environment variables are loaded
const logger = getLogger();
// Explicitly initialize logger with environment variables
initializeLogger();

// Enable auto-updates (official Electron module)
// Only enable in production builds
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'production') {
  // Usar require() con destructuring porque updateElectronApp es un named export
  const { updateElectronApp } = require('update-electron-app');
  updateElectronApp({
    repo: 'levante-hub/levante',
    updateInterval: '1 hour', // Check for updates every hour
    notifyUser: true, // Show update notifications to user
    logger: {
      log: (...args: any[]) => logger.core.info('Auto-update:', ...args),
      error: (...args: any[]) => logger.core.error('Auto-update error:', ...args)
    }
  });
  logger.core.info('Auto-update system initialized');
}

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: join(__dirname, "../../resources/icons/icon.png"), // App icon
    titleBarStyle: process.platform === "darwin" ? "default" : "default",
    webPreferences: {
      // Con Electron Forge + Vite, preload.js está en __dirname directamente
      preload: join(__dirname, "preload.js"),
      sandbox: false, // Required for some native modules
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // Load the app
  // Electron Forge usa MAIN_WINDOW_VITE_DEV_SERVER_URL para dev
  // electron-vite usa ELECTRON_RENDERER_URL para dev

  // Debug: ver qué variables están disponibles
  logger.core.debug('Environment variables', {
    MAIN_WINDOW_VITE_DEV_SERVER_URL: process.env["MAIN_WINDOW_VITE_DEV_SERVER_URL"],
    ELECTRON_RENDERER_URL: process.env["ELECTRON_RENDERER_URL"],
    NODE_ENV: process.env.NODE_ENV,
    viteVars: Object.keys(process.env).filter(k => k.includes('VITE'))
  });

  if (process.env["MAIN_WINDOW_VITE_DEV_SERVER_URL"]) {
    logger.core.info('Loading from Forge dev server', { url: process.env["MAIN_WINDOW_VITE_DEV_SERVER_URL"] });
    mainWindow.loadURL(process.env["MAIN_WINDOW_VITE_DEV_SERVER_URL"]);
  } else if (
    process.env.NODE_ENV === "development" &&
    process.env["ELECTRON_RENDERER_URL"]
  ) {
    logger.core.info('Loading from electron-vite dev server', { url: process.env["ELECTRON_RENDERER_URL"] });
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    // En producción con Forge: main está en .vite/build/main.js
    // y renderer está en .vite/renderer/main_window/index.html
    const filePath = join(__dirname, "../renderer/main_window/index.html");
    logger.core.info('Loading from file (production build)', { filePath });
    mainWindow.loadFile(filePath);
  }

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

  // Security: Handle external links
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
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
    logger.core.info('Database initialized successfully');
  } catch (error) {
    logger.core.error('Failed to initialize database', { error: error instanceof Error ? error.message : error });
    // Could show error dialog or continue with degraded functionality
  }

  // Initialize preferences service
  try {
    await preferencesService.initialize();
    logger.core.info('Preferences service initialized successfully');
  } catch (error) {
    logger.core.error('Failed to initialize preferences service', { error: error instanceof Error ? error.message : error });
    // Could show error dialog or continue with degraded functionality
  }

  // Initialize user profile service
  try {
    await userProfileService.initialize();
    logger.core.info('User profile service initialized successfully');
  } catch (error) {
    logger.core.error('Failed to initialize user profile service', { error: error instanceof Error ? error.message : error });
    // Could show error dialog or continue with degraded functionality
  }

  // Migrate MCP configuration to include disabled section
  try {
    await configManager.migrateConfiguration();
    logger.core.info('MCP configuration migrated successfully');
  } catch (error) {
    logger.core.error('Failed to migrate MCP configuration', {
      error: error instanceof Error ? error.message : error
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

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  // Close database connection before quitting
  try {
    await databaseService.close();
    logger.core.info('Database connection closed');
  } catch (error) {
    logger.core.error('Error closing database', { error: error instanceof Error ? error.message : error });
  }
  
  if (process.platform !== "darwin") app.quit();
});

// IPC handlers for secure communication
ipcMain.handle("levante/app/version", () => {
  return app.getVersion();
});

ipcMain.handle("levante/app/platform", () => {
  return process.platform;
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
    messagesCount: request.messages.length 
  });
  
  // Track cancellation state
  let isCancelled = false;
  
  // Store cancellation function
  activeStreams.set(streamId, {
    cancel: () => {
      isCancelled = true;
      logger.aiSdk.info("Stream cancelled", { streamId });
    }
  });

  // Start streaming immediately - listeners should be ready (Expo pattern)
  setTimeout(async () => {
    try {
      logger.aiSdk.debug("Starting AI stream", { streamId });
      for await (const chunk of aiService.streamChat(request)) {
        // Check if stream was cancelled
        if (isCancelled) {
          logger.aiSdk.info("Stream cancelled, stopping generation", { streamId });
          event.sender.send(`levante/chat/stream/${streamId}`, {
            error: "Stream cancelled by user",
            done: true,
          });
          break;
        }

        // Send chunk immediately without buffering (pattern from Expo)
        event.sender.send(`levante/chat/stream/${streamId}`, chunk);
        // Small yield to prevent blocking the event loop
        await new Promise((resolve) => setImmediate(resolve));

        // Log when stream completes
        if (chunk.done) {
          logger.aiSdk.info("AI stream completed successfully", { streamId });
          break;
        }
      }
    } catch (error) {
      logger.aiSdk.error("AI Stream error", {
        streamId,
        error: error instanceof Error ? error.message : error
      });
      event.sender.send(`levante/chat/stream/${streamId}`, {
        error: error instanceof Error ? error.message : "Stream error",
        done: true,
      });
    } finally {
      // Clean up active stream tracking
      activeStreams.delete(streamId);
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
      error: error instanceof Error ? error.message : error 
    });
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
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
