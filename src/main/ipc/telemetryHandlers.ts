/**
 * Telemetry IPC Handlers
 *
 * Handles communication between renderer and telemetry service
 */

import { ipcMain } from "electron";
import { telemetryService, TelemetryEventType } from "../services/TelemetryService";
import { getLogger } from "../services/logging";

const logger = getLogger();

/**
 * Setup all telemetry-related IPC handlers
 */
export function setupTelemetryHandlers(): void {
  // Get telemetry status
  ipcMain.handle("levante/telemetry/status", async () => {
    try {
      const status = telemetryService.getStatus();
      return { success: true, data: status };
    } catch (error) {
      logger.core.error("Failed to get telemetry status", {
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Track telemetry event
  ipcMain.handle(
    "levante/telemetry/track",
    async (_event, eventType: TelemetryEventType, data?: Record<string, any>) => {
      try {
        await telemetryService.trackEvent(eventType, data);
        return { success: true };
      } catch (error) {
        logger.core.error("Failed to track telemetry event", {
          eventType,
          error: error instanceof Error ? error.message : error,
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // Report crash
  ipcMain.handle("levante/telemetry/crash", async (_event, errorData: {
    message: string;
    stack?: string;
    name?: string;
  }) => {
    try {
      // Create an Error object from the data
      const error = new Error(errorData.message);
      if (errorData.stack) error.stack = errorData.stack;
      if (errorData.name) error.name = errorData.name;

      await telemetryService.reportCrash(error);
      return { success: true };
    } catch (error) {
      logger.core.error("Failed to report crash", {
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  logger.core.info("Telemetry IPC handlers registered");
}
