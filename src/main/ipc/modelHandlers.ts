import { ipcMain } from 'electron';
import { ModelFetchService } from '../services/modelFetchService';
import { getLogger } from '../services/logging';

const logger = getLogger();

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
      logger.ipc.error('Failed to fetch OpenRouter models', { error: error instanceof Error ? error.message : error });
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
      logger.ipc.error('Failed to fetch Gateway models', { error: error instanceof Error ? error.message : error });
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
      logger.ipc.error('Failed to fetch local models', { endpoint, error: error instanceof Error ? error.message : error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  logger.ipc.info('Model IPC handlers registered');
}