/**
 * Application Event Handlers Module
 *
 * Handles Electron app events:
 * - activate (macOS dock click)
 * - window-all-closed
 * - before-quit (graceful shutdown)
 * - open-url (deep links)
 */

import { app, BrowserWindow } from "electron";
import { getLogger } from "../services/logging";
import { deepLinkService } from "../services/deepLinkService";
import { gracefulShutdown } from "./shutdown";
import { createMainWindow } from "./window";

const logger = getLogger();

/**
 * Register all application event handlers
 * @param getMainWindow - Function to get current main window reference
 */
export function registerAppEvents(getMainWindow: () => BrowserWindow | null): void {
  // macOS: Re-create window when dock icon is clicked
  app.on("activate", () => {
    logger.core.debug("App activated");
    if (BrowserWindow.getAllWindows().length === 0) {
      const mainWindow = createMainWindow();
      // Notify caller about new window
      logger.core.info("Created new window on activate");
    }
  });

  // Handle window closure
  app.on("window-all-closed", () => {
    logger.core.debug("All windows closed");
    // On macOS, apps typically stay open until explicitly quit
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  // Graceful shutdown: cleanup before app quits
  app.on("before-quit", async (event) => {
    event.preventDefault();
    await gracefulShutdown();
    app.exit(0);
  });

  // macOS: Handle protocol URLs via 'open-url' event
  app.on("open-url", (event, url) => {
    event.preventDefault();
    logger.core.info("Received deep link URL (open-url)", { url });
    deepLinkService.handleDeepLink(url);
  });
}

/**
 * Setup deep link handling for Windows/Linux
 * Check command-line arguments for deep link URLs
 * Should be called after app.whenReady()
 */
export function setupDeepLinkHandling(): void {
  // Windows/Linux: Handle protocol URLs via command-line arguments
  const args = process.argv;
  logger.core.debug("Process arguments", { args });

  // Look for levante:// protocol in arguments
  const deepLinkUrl = args.find((arg) => arg.startsWith("levante://"));
  if (deepLinkUrl) {
    logger.core.info("Received deep link URL (command-line)", { url: deepLinkUrl });
    // Wait a bit to ensure window is ready
    setTimeout(() => {
      deepLinkService.handleDeepLink(deepLinkUrl);
    }, 1000);
  }
}
