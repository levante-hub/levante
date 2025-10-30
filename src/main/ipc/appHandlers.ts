/**
 * App Metadata IPC Handlers Module
 *
 * Handles application-level IPC communication:
 * - App version, platform, theme information
 * - Manual update checks
 * - External URL opening
 * - Theme change notifications
 */

import { app, ipcMain, nativeTheme, BrowserWindow, IpcMainInvokeEvent } from "electron";
import { getLogger } from "../services/logging";
import { updateService } from "../services/updateService";
import { safeOpenExternal } from "../utils/urlSecurity";

const logger = getLogger();

/**
 * Register all app metadata IPC handlers
 * @param getMainWindow - Function to get current main window reference
 */
export function setupAppHandlers(getMainWindow: () => BrowserWindow | null): void {
  // App version
  ipcMain.handle("levante/app/version", handleGetVersion);

  // App platform
  ipcMain.handle("levante/app/platform", handleGetPlatform);

  // App theme
  ipcMain.handle("levante/app/theme", handleGetTheme);

  // Manual update check
  ipcMain.handle("levante/app/check-for-updates", handleCheckForUpdates);

  // Open external URLs
  ipcMain.handle("levante/app/open-external", handleOpenExternal);

  // Setup theme change notifications
  setupThemeChangeListener(getMainWindow);

  logger.core.info("App handlers registered successfully");
}

/**
 * Get application version
 */
function handleGetVersion(): string {
  return app.getVersion();
}

/**
 * Get current platform
 */
function handleGetPlatform(): NodeJS.Platform {
  return process.platform;
}

/**
 * Get current theme information
 */
function handleGetTheme(): {
  shouldUseDarkColors: boolean;
  themeSource: "system" | "light" | "dark";
} {
  return {
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    themeSource: nativeTheme.themeSource,
  };
}

/**
 * Manually check for application updates
 */
async function handleCheckForUpdates(): Promise<{ success: boolean; error?: string }> {
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
}

/**
 * Open external URL with security validation
 */
async function handleOpenExternal(
  event: IpcMainInvokeEvent,
  url: string
): Promise<{ success: boolean; error?: string }> {
  return await safeOpenExternal(url, "ipc-handler");
}

/**
 * Setup listener for theme changes to notify renderer
 */
function setupThemeChangeListener(getMainWindow: () => BrowserWindow | null): void {
  nativeTheme.on("updated", () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send("levante/app/theme-changed", {
        shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
        themeSource: nativeTheme.themeSource,
      });
    }
  });

  logger.core.info("Theme change listener registered");
}
