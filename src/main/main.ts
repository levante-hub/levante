import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "path";
import { config } from "dotenv";
import { databaseService } from "./services/databaseService";
import { setupDatabaseHandlers } from "./ipc/databaseHandlers";
import { setupPreferencesHandlers } from "./ipc/preferencesHandlers";
import { setupModelHandlers } from "./ipc/modelHandlers";
import { setupHexagonalChatHandlers } from "./ipc/hexagonalChatHandlers";
import { setupDependencies } from "../infrastructure/di/setup";
import { preferencesService } from "./services/preferencesService";

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

  // Initialize database
  try {
    await databaseService.initialize();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    // Could show error dialog or continue with degraded functionality
  }

  // Initialize preferences service
  try {
    await preferencesService.initialize();
    console.log('Preferences service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize preferences service:', error);
    // Could show error dialog or continue with degraded functionality
  }

  // Setup hexagonal architecture
  try {
    await setupDependencies();
    console.log('Hexagonal dependencies configured successfully');
  } catch (error) {
    console.error('Failed to setup hexagonal dependencies:', error);
    // Continue with degraded functionality
  }

  // Setup IPC handlers (existing + hexagonal)
  setupDatabaseHandlers();
  setupPreferencesHandlers();
  setupModelHandlers();
  
  try {
    await setupHexagonalChatHandlers();
    console.log('Hexagonal chat handlers registered successfully');
  } catch (error) {
    console.error('Failed to setup hexagonal handlers:', error);
    // Continue with existing handlers only
  }

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


