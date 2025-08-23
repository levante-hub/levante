import { ipcMain } from 'electron';
import { ModelFetchService } from '../services/modelFetchService';

export function setupModelHandlers() {
  // Fetch OpenRouter models
  ipcMain.removeHandler('levante/models/openrouter');
  ipcMain.handle('levante/models/openrouter', async (_, apiKey?: string) => {
    try {
      const models = await ModelFetchService.fetchOpenRouterModels(apiKey);
      return {
        success: true,
        data: models
      };
    } catch (error) {
      console.error('[ModelHandlers] Failed to fetch OpenRouter models:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Fetch Gateway models
  ipcMain.removeHandler('levante/models/gateway');
  ipcMain.handle('levante/models/gateway', async (_, apiKey: string, baseUrl?: string) => {
    try {
      const models = await ModelFetchService.fetchGatewayModels(apiKey, baseUrl);
      return {
        success: true,
        data: models
      };
    } catch (error) {
      console.error('[ModelHandlers] Failed to fetch Gateway models:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Fetch local models
  ipcMain.removeHandler('levante/models/local');
  ipcMain.handle('levante/models/local', async (_, endpoint: string) => {
    try {
      const models = await ModelFetchService.fetchLocalModels(endpoint);
      return {
        success: true,
        data: models
      };
    } catch (error) {
      console.error('[ModelHandlers] Failed to fetch local models:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  console.log('[ModelHandlers] IPC handlers registered');
}