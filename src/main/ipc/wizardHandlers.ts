import { ipcMain } from 'electron';
import { userProfileService } from '../services/userProfileService';
import { ApiValidationService, ProviderValidationConfig } from '../services/apiValidationService';
import { getLogger } from '../services/logging';
import type { WizardCompletionData } from '../../types/userProfile';

const logger = getLogger();

export function setupWizardHandlers() {
  // Check wizard status
  ipcMain.removeHandler('levante/wizard/check-status');
  ipcMain.handle('levante/wizard/check-status', async () => {
    try {
      const status = await userProfileService.getWizardStatus();
      const isCompleted = status === 'completed';

      logger.ipc.debug('Wizard status checked', { status, isCompleted });

      return {
        success: true,
        data: {
          status,
          isCompleted,
        },
      };
    } catch (error) {
      logger.ipc.error('Failed to check wizard status', {
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Mark wizard as in progress
  ipcMain.removeHandler('levante/wizard/start');
  ipcMain.handle('levante/wizard/start', async () => {
    try {
      await userProfileService.markWizardInProgress();

      logger.ipc.info('Wizard started');

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      logger.ipc.error('Failed to start wizard', {
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Complete wizard
  ipcMain.removeHandler('levante/wizard/complete');
  ipcMain.handle('levante/wizard/complete', async (_, data: WizardCompletionData) => {
    try {
      await userProfileService.completeWizard(data);

      logger.ipc.info('Wizard completed', {
        provider: data.provider,
        timestamp: data.timestamp,
      });

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      logger.ipc.error('Failed to complete wizard', {
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Reset wizard (for testing/debugging)
  ipcMain.removeHandler('levante/wizard/reset');
  ipcMain.handle('levante/wizard/reset', async () => {
    try {
      await userProfileService.resetWizard();

      logger.ipc.warn('Wizard reset');

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      logger.ipc.error('Failed to reset wizard', {
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Validate provider API key/endpoint
  ipcMain.removeHandler('levante/wizard/validate-provider');
  ipcMain.handle('levante/wizard/validate-provider', async (_, config: ProviderValidationConfig) => {
    try {
      logger.ipc.debug('Validating provider', { type: config.type });

      const result = await ApiValidationService.validateProvider(config);

      if (result.isValid) {
        logger.ipc.info('Provider validation successful', {
          type: config.type,
          modelsCount: result.modelsCount,
        });
      } else {
        logger.ipc.warn('Provider validation failed', {
          type: config.type,
          error: result.error,
        });
      }

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      logger.ipc.error('Provider validation error', {
        type: config.type,
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  logger.ipc.info('Wizard IPC handlers registered');
}
