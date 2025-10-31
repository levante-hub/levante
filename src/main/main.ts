// Fix PATH for packaged macOS/Linux apps - must be first import
// Safe on Windows (no-op), required for macOS/Linux GUI apps
import fixPath from "fix-path";
fixPath();

import { app, BrowserWindow } from "electron";
import { join } from "path";
import { config } from "dotenv";
import { initializeLogger } from "./services/logging";
import { updateService } from "./services/updateService";
import { deepLinkService } from "./services/deepLinkService";
import { oauthCallbackServer } from "./services/oauthCallbackServer";
import { createApplicationMenu } from "./menu";

// Lifecycle modules
import { initializeServices, registerIPCHandlers } from "./lifecycle/initialization";
import { createMainWindow } from "./lifecycle/window";
import { registerAppEvents, setupDeepLinkHandling } from "./lifecycle/events";

// Load environment variables
config({ path: join(__dirname, "../../.env.local") });
config({ path: join(__dirname, "../../.env") });

// Initialize logger
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
  registerIPCHandlers(() => mainWindow);

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
