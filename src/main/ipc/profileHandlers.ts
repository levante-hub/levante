import { ipcMain, shell } from 'electron';
import { userProfileService } from '../services/userProfileService';
import { directoryService } from '../services/directoryService';
import { getLogger } from '../services/logging';
import type { UserProfile } from '../../types/userProfile';

const logger = getLogger();

export function setupProfileHandlers() {
  // Get user profile
  ipcMain.removeHandler('levante/profile/get');
  ipcMain.handle('levante/profile/get', async () => {
    try {
      const profile = await userProfileService.getProfile();

      logger.ipc.debug('User profile retrieved', {
        wizardStatus: profile.wizard,
      });

      return {
        success: true,
        data: profile,
      };
    } catch (error) {
      logger.ipc.error('Failed to get user profile', {
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Update user profile
  ipcMain.removeHandler('levante/profile/update');
  ipcMain.handle('levante/profile/update', async (_, updates: Partial<UserProfile>) => {
    try {
      const profile = await userProfileService.updateProfile(updates);

      logger.ipc.info('User profile updated', {
        updates: Object.keys(updates),
      });

      return {
        success: true,
        data: profile,
      };
    } catch (error) {
      logger.ipc.error('Failed to update user profile', {
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Get profile file path
  ipcMain.removeHandler('levante/profile/get-path');
  ipcMain.handle('levante/profile/get-path', async () => {
    try {
      const path = await userProfileService.getProfilePath();

      logger.ipc.debug('Profile path retrieved', { path });

      return {
        success: true,
        data: path,
      };
    } catch (error) {
      logger.ipc.error('Failed to get profile path', {
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Open levante directory in file manager
  ipcMain.removeHandler('levante/profile/open-directory');
  ipcMain.handle('levante/profile/open-directory', async () => {
    try {
      const baseDir = directoryService.getBaseDir();

      // Ensure directory exists before opening
      await directoryService.ensureBaseDir();

      // Open in file manager (Finder on macOS, Explorer on Windows, file manager on Linux)
      await shell.openPath(baseDir);

      logger.ipc.info('Levante directory opened', { baseDir });

      return {
        success: true,
        data: baseDir,
      };
    } catch (error) {
      logger.ipc.error('Failed to open levante directory', {
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Get levante directory info
  ipcMain.removeHandler('levante/profile/get-directory-info');
  ipcMain.handle('levante/profile/get-directory-info', async () => {
    try {
      const info = await directoryService.getDirectoryInfo();

      logger.ipc.debug('Directory info retrieved', {
        baseDir: info.baseDir,
        totalFiles: info.totalFiles,
      });

      return {
        success: true,
        data: info,
      };
    } catch (error) {
      logger.ipc.error('Failed to get directory info', {
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  logger.ipc.info('Profile IPC handlers registered');
}
