/**
 * Window Management Module
 *
 * Handles browser window creation and security configuration
 */

import { BrowserWindow, nativeTheme } from "electron";
import { join } from "path";
import { getLogger } from "../services/logging";
import { safeOpenExternal } from "../utils/urlSecurity";

const logger = getLogger();

/**
 * Creates and configures the main application window
 * Includes security handlers and navigation protection
 */
export function createMainWindow(): BrowserWindow {
  // IMPORTANT: Set nativeTheme to follow system BEFORE creating window
  nativeTheme.themeSource = "system";

  logger.core.info("NativeTheme configured", {
    themeSource: nativeTheme.themeSource,
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
  });

  // Create the browser window
  const mainWindow = new BrowserWindow({
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
    mainWindow.show();

    if (process.env.NODE_ENV === "development") {
      mainWindow.webContents.openDevTools();

      // Note: Autofill DevTools errors are a known Electron issue and cannot be suppressed
      // See: https://github.com/electron/electron/issues/46868
    }
  });

  // Handle window closed
  mainWindow.on("closed", () => {
    // Window cleanup handled by Electron
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

  return mainWindow;
}
