import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "path";
import { config } from "dotenv";

// Hexagonal Architecture imports
import { 
  initializeMainProcessContainer,
  getMainProcessContainer,
  disposeMainProcessContainer,
  checkMainProcessHealth
} from "./infrastructure/container/ElectronServiceContainer";
import { setupHexagonalIPCHandlers, cleanupHexagonalIPCHandlers } from "./ipc/ElectronBridge";

// Load environment variables from .env.local and .env files
config({ path: join(__dirname, "../../.env.local") });
config({ path: join(__dirname, "../../.env") });

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


  // Initialize Hexagonal Architecture
  try {
    console.log('Initializing hexagonal architecture...');
    initializeMainProcessContainer();
    console.log('Hexagonal architecture initialized successfully');

    // Perform health check
    const healthCheck = await checkMainProcessHealth();
    if (healthCheck.healthy) {
      console.log('All hexagonal services are healthy');
    } else {
      console.warn('Some hexagonal services are unhealthy:', healthCheck.services);
    }
  } catch (error) {
    console.error('Failed to initialize hexagonal architecture:', error);
    // Could show error dialog or continue with legacy services
  }


  // Setup Hexagonal IPC handlers
  setupHexagonalIPCHandlers();
  console.log('Hexagonal IPC handlers initialized successfully');

  createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  // Cleanup hexagonal architecture
  try {
    console.log('Cleaning up hexagonal architecture...');
    cleanupHexagonalIPCHandlers();
    disposeMainProcessContainer();
    console.log('Hexagonal architecture cleanup completed');
  } catch (error) {
    console.error('Error cleaning up hexagonal architecture:', error);
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


// Health check endpoint for hexagonal architecture
ipcMain.handle("levante/health", async () => {
  try {
    const healthCheck = await checkMainProcessHealth();
    return {
      success: true,
      data: healthCheck
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
});
