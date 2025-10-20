import { ipcMain } from 'electron';
import { directoryService } from '../services/directoryService';
import { databaseService } from '../services/databaseService';
import { preferencesService } from '../services/preferencesService';
import { getLogger } from '../services/logging';

const logger = getLogger();

export function registerDebugHandlers() {
  // Get directory information for debugging
  ipcMain.handle('levante/debug/directory-info', async () => {
    try {
      const info = await directoryService.getDirectoryInfo();
      
      // Add file sizes for debugging
      const fileStats = await Promise.allSettled(
        info.files.map(async (fileName) => {
          const stats = await directoryService.getFileStats(fileName);
          return {
            name: fileName,
            size: stats?.size || 0,
            modified: stats?.mtime?.toISOString() || null
          };
        })
      );

      const filesWithStats = fileStats
        .filter(result => result.status === 'fulfilled')
        .map(result => result.status === 'fulfilled' ? result.value : null)
        .filter(Boolean);

      logger.core.info("Directory info requested via IPC", {
        requestedBy: "renderer",
        fileCount: filesWithStats.length
      });

      return {
        success: true,
        data: {
          ...info,
          filesWithStats,
          paths: {
            database: directoryService.getDatabasePath(),
            preferences: directoryService.getPreferencesPath(),
            mcpConfig: directoryService.getMcpConfigPath(),
            logs: directoryService.getLogsPath(),
            memory: directoryService.getMemoryPath(),
            userProfile: directoryService.getUserProfilePath()
          }
        }
      };
    } catch (error) {
      logger.core.error("Failed to get directory info", {
        error: error instanceof Error ? error.message : error
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get service health for debugging
  ipcMain.handle('levante/debug/service-health', async () => {
    try {
      const health = {
        database: {
          initialized: databaseService.getDatabaseInfo().isInitialized,
          path: databaseService.getDatabaseInfo().path,
          healthy: await databaseService.healthCheck()
        },
        preferences: {
          path: preferencesService.getStorePath(),
          size: preferencesService.getStoreSize()
        },
        directory: {
          baseDir: directoryService.getBaseDir(),
          exists: await directoryService.fileExists('')
        }
      };

      logger.core.info("Service health check requested via IPC", {
        requestedBy: "renderer",
        services: Object.keys(health)
      });

      return {
        success: true,
        data: health
      };
    } catch (error) {
      logger.core.error("Failed to get service health", {
        error: error instanceof Error ? error.message : error
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // List all files in Levante directory
  ipcMain.handle('levante/debug/list-files', async () => {
    try {
      const files = await directoryService.listFiles();
      
      logger.core.debug("File list requested via IPC", {
        requestedBy: "renderer",
        fileCount: files.length
      });

      return {
        success: true,
        data: files
      };
    } catch (error) {
      logger.core.error("Failed to list files", {
        error: error instanceof Error ? error.message : error
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  logger.core.info("Debug IPC handlers registered");
}