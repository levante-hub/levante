import { app, dialog, nativeImage, autoUpdater } from 'electron';
import { join } from 'path';
import { getLogger } from './logging';

const logger = getLogger();

/**
 * Auto-update service for Levante
 *
 * Uses update-electron-app for automatic background updates.
 * Manual checks use Electron's autoUpdater directly.
 */
class UpdateService {
  private repo = 'levante-hub/levante';
  private updateCheckInProgress = false;
  private appIcon: Electron.NativeImage | undefined;
  private autoUpdateInitialized = false;

  /**
   * Get the app icon for dialogs
   */
  private getAppIcon(): Electron.NativeImage | undefined {
    if (!this.appIcon) {
      try {
        // In production (packaged app), icon is in resources
        // In development, icon is in project root
        const iconPath = app.isPackaged
          ? join(process.resourcesPath, 'icons', 'icon.png')
          : join(__dirname, '../../../resources/icons/icon.png');

        this.appIcon = nativeImage.createFromPath(iconPath);
        logger.core.debug('App icon loaded', { iconPath, isEmpty: this.appIcon.isEmpty() });
      } catch (error) {
        logger.core.warn('Failed to load app icon for dialogs', {
          error: error instanceof Error ? error.message : error
        });
      }
    }
    return this.appIcon;
  }

  /**
   * Initialize automatic updates (production only)
   * Sets up background update checks using update-electron-app
   */
  initialize(): void {
    if (process.env.NODE_ENV === 'production' || app.isPackaged) {
      try {
        const { updateElectronApp } = require('update-electron-app');
        updateElectronApp({
          repo: this.repo,
          updateInterval: '1 hour',
          notifyUser: true,
          logger: {
            log: (...args: any[]) => logger.core.info('Auto-update:', ...args),
            error: (...args: any[]) => logger.core.error('Auto-update error:', ...args)
          }
        });
        this.autoUpdateInitialized = true;
        logger.core.info('Auto-update system initialized', { repo: this.repo });
      } catch (error) {
        logger.core.error('Failed to initialize auto-update', {
          error: error instanceof Error ? error.message : error
        });
      }
    } else {
      logger.core.info('Auto-update disabled in development mode');
    }
  }

  /**
   * Manually check for updates
   * Triggers the same auto-update mechanism as background checks
   * Downloads and installs updates automatically, then prompts to restart
   */
  async checkForUpdates(): Promise<void> {
    if (this.updateCheckInProgress) {
      logger.core.info('Update check already in progress');
      return;
    }

    // In development mode, show message
    if (process.env.NODE_ENV !== 'production' && !app.isPackaged) {
      await dialog.showMessageBox({
        type: 'info',
        title: 'Updates Not Available',
        message: 'Auto-updates are only available in production builds',
        detail: 'You are running a development build. To test updates, create a production build using:\npnpm package',
        buttons: ['OK'],
        icon: this.getAppIcon()
      });
      return;
    }

    this.updateCheckInProgress = true;
    logger.core.info('Manual update check initiated');

    try {
      // Ensure auto-update is initialized
      if (!this.autoUpdateInitialized) {
        logger.core.warn('Update system not initialized, attempting to initialize');
        this.initialize();
      }

      // Use Electron's autoUpdater to trigger a check
      // update-electron-app already set up the feed URL and event handlers
      logger.core.info('Triggering manual update check via autoUpdater');

      // Set up one-time event listeners for this manual check
      const updateNotAvailableHandler = () => {
        dialog.showMessageBox({
          type: 'info',
          title: 'No Updates Available',
          message: 'You are running the latest version',
          detail: `Current version: ${app.getVersion()}`,
          buttons: ['OK'],
          icon: this.getAppIcon()
        }).finally(() => {
          this.updateCheckInProgress = false;
          cleanup();
        });
      };

      const errorHandler = (error: Error) => {
        logger.core.error('Error checking for updates', { error: error.message });
        dialog.showMessageBox({
          type: 'error',
          title: 'Update Check Failed',
          message: 'An error occurred while checking for updates',
          detail: error.message,
          buttons: ['OK'],
          icon: this.getAppIcon()
        }).finally(() => {
          this.updateCheckInProgress = false;
          cleanup();
        });
      };

      const updateDownloadedHandler = () => {
        // update-electron-app handles the download notification
        // Just clean up our check state
        this.updateCheckInProgress = false;
        cleanup();
      };

      const cleanup = () => {
        autoUpdater.removeListener('update-not-available', updateNotAvailableHandler);
        autoUpdater.removeListener('error', errorHandler);
        autoUpdater.removeListener('update-downloaded', updateDownloadedHandler);
      };

      // Register temporary listeners
      autoUpdater.once('update-not-available', updateNotAvailableHandler);
      autoUpdater.once('error', errorHandler);
      autoUpdater.once('update-downloaded', updateDownloadedHandler);

      // Trigger the check
      autoUpdater.checkForUpdates();

    } catch (error) {
      logger.core.error('Error initiating update check', {
        error: error instanceof Error ? error.message : error
      });

      await dialog.showMessageBox({
        type: 'error',
        title: 'Update Check Failed',
        message: 'An error occurred while checking for updates',
        detail: error instanceof Error ? error.message : 'Unknown error',
        buttons: ['OK'],
        icon: this.getAppIcon()
      });

      this.updateCheckInProgress = false;
    }
  }

}

export const updateService = new UpdateService();
