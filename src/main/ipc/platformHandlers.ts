/**
 * IPC handlers for Levante Platform operations
 * Channels: levante/platform/*
 */

import { ipcMain } from 'electron';
import { platformService, PlatformModelFetchError } from '../services/platformService';
import type { FetchModelsReason } from '../services/platformService';
import { getLogger } from '../services/logging';

const logger = getLogger();

export function setupPlatformHandlers(): void {
  // Login to Levante Platform via OAuth
  ipcMain.handle('levante/platform/login', async (_, baseUrl?: string) => {
    try {
      const status = await platformService.login(baseUrl);
      return { success: true, data: status };
    } catch (error) {
      logger.oauth.error('Platform login failed', {
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  });

  // Logout from Levante Platform
  ipcMain.handle('levante/platform/logout', async () => {
    try {
      await platformService.logout();
      return { success: true };
    } catch (error) {
      logger.oauth.error('Platform logout failed', {
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Logout failed',
      };
    }
  });

  // Get platform status (auth state, user info, allowedModels)
  ipcMain.handle('levante/platform/status', async () => {
    try {
      const status = await platformService.getStatus();
      return { success: true, data: status };
    } catch (error) {
      logger.oauth.error('Platform status check failed', {
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Status check failed',
      };
    }
  });

  // Fetch org ID on demand (lazy — not fetched during login to avoid blocking)
  ipcMain.handle('levante/platform/org-id', async () => {
    try {
      const orgId = await platformService.fetchOrgId();
      return { success: true, data: orgId };
    } catch (error) {
      return { success: false, data: undefined };
    }
  });

  // Fetch models with metadata from platform API
  ipcMain.handle('levante/platform/models', async (_, payload?: { baseUrl?: string; reason?: FetchModelsReason } | string) => {
    // Support legacy signature (plain string) and new payload object
    const baseUrl = typeof payload === 'string' ? payload : payload?.baseUrl;
    const reason = typeof payload === 'string' ? undefined : payload?.reason;

    try {
      const models = await platformService.fetchModelsWithMetadata(baseUrl, reason);
      return { success: true, data: models };
    } catch (error) {
      const code = error instanceof PlatformModelFetchError ? error.code : 'UNKNOWN';
      const message = error instanceof Error ? error.message : 'Model fetch failed';

      logger.models.error('Platform model fetch failed', {
        reason,
        code,
        error: message,
      });
      return {
        success: false,
        error: message,
        code,
      };
    }
  });
}
