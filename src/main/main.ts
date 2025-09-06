import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "path";
import { config } from "dotenv";
import { AIService, ChatRequest } from "./services/aiService";
import { databaseService } from "./services/databaseService";
import { setupDatabaseHandlers } from "./ipc/databaseHandlers";
import { setupPreferencesHandlers } from "./ipc/preferencesHandlers";
import { setupModelHandlers } from "./ipc/modelHandlers";
import { registerMCPHandlers } from "./ipc/mcpHandlers";
import { setupLoggerHandlers } from "./ipc/loggerHandlers";
import { preferencesService } from "./services/preferencesService";
import { getLogger } from "./services/logging";

// Load environment variables from .env.local and .env files
config({ path: join(__dirname, "../../.env.local") });
config({ path: join(__dirname, "../../.env") });

// Initialize logger after environment variables are loaded
const logger = getLogger();

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
      preload: join(__dirname, "../preload/preload.js"),
      sandbox: false, // Required for some native modules
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // Load the app
  if (
    process.env.NODE_ENV === "development" &&
    process.env["ELECTRON_RENDERER_URL"]
  ) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
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

  // Setup IPC handlers
  setupDatabaseHandlers();
  setupPreferencesHandlers();
  setupModelHandlers();
  setupLoggerHandlers();
  registerMCPHandlers();

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
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error closing database:', error);
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
  console.log("Received chat stream request:", request);
  const streamId = `stream_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 11)}`;
  
  // Track cancellation state
  let isCancelled = false;
  
  // Store cancellation function
  activeStreams.set(streamId, {
    cancel: () => {
      isCancelled = true;
      console.log(`Stream ${streamId} cancelled`);
    }
  });

  // Start streaming immediately - listeners should be ready (Expo pattern)
  setTimeout(async () => {
    try {
      console.log("Starting AI stream...");
      for await (const chunk of aiService.streamChat(request)) {
        // Check if stream was cancelled
        if (isCancelled) {
          console.log("Stream cancelled, stopping generation");
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
          console.log("AI stream completed successfully");
          break;
        }
      }
    } catch (error) {
      console.error("AI Stream error:", error);
      event.sender.send(`levante/chat/stream/${streamId}`, {
        error: error instanceof Error ? error.message : "Stream error",
        done: true,
      });
    } finally {
      // Clean up active stream tracking
      activeStreams.delete(streamId);
    }
  }, 10); // Reduced delay following Expo patterns

  console.log("Returning streamId:", streamId);
  return { streamId };
});

// Stop streaming handler
ipcMain.handle("levante/chat/stop-stream", async (event, streamId: string) => {
  console.log("Received stop stream request for:", streamId);
  
  try {
    const streamControl = activeStreams.get(streamId);
    if (streamControl) {
      streamControl.cancel();
      activeStreams.delete(streamId);
      console.log(`Stream ${streamId} stopped successfully`);
      return { success: true };
    } else {
      console.log(`Stream ${streamId} not found or already completed`);
      return { success: false, error: "Stream not found or already completed" };
    }
  } catch (error) {
    console.error("Error stopping stream:", error);
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
