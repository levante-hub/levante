import { app, dialog, nativeImage } from 'electron';
import { join } from 'path';
import { getLogger } from './logging';

const logger = getLogger();

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

/**
 * Auto-update service for Levante
 *
 * Uses update-electron-app for automatic updates in production.
 * Provides manual update check functionality through GitHub Releases API.
 */
class UpdateService {
  private repo = 'levante-hub/levante';
  private updateCheckInProgress = false;
  private appIcon: Electron.NativeImage | undefined;

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
   */
  initialize(): void {
    if (process.env.NODE_ENV === 'production') {
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
        logger.core.info('Auto-update system initialized');
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
   * Uses GitHub Releases API to check for newer versions
   */
  async checkForUpdates(): Promise<void> {
    if (this.updateCheckInProgress) {
      logger.core.info('Update check already in progress');
      return;
    }

    this.updateCheckInProgress = true;
    logger.core.info('Manual update check initiated');

    try {
      const currentVersion = app.getVersion();
      const latestRelease = await this.fetchLatestRelease();

      if (!latestRelease) {
        await dialog.showMessageBox({
          type: 'info',
          title: 'Update Check',
          message: 'Unable to check for updates',
          detail: 'Could not connect to update server. Please try again later.',
          buttons: ['OK'],
          icon: this.getAppIcon()
        });
        return;
      }

      const latestVersion = latestRelease.version.replace(/^v/, '');
      logger.core.info('Version comparison', { currentVersion, latestVersion });

      if (this.isNewerVersion(currentVersion, latestVersion)) {
        const { response } = await dialog.showMessageBox({
          type: 'info',
          title: 'Update Available',
          message: `A new version of Levante is available!`,
          detail: `Current version: ${currentVersion}\nLatest version: ${latestVersion}\n\n${latestRelease.releaseNotes || 'View release notes on GitHub'}`,
          buttons: ['Download', 'Later'],
          defaultId: 0,
          cancelId: 1,
          icon: this.getAppIcon()
        });

        if (response === 0) {
          // Open releases page
          const { shell } = require('electron');
          await shell.openExternal(`https://github.com/${this.repo}/releases/latest`);
        }
      } else {
        await dialog.showMessageBox({
          type: 'info',
          title: 'No Updates Available',
          message: 'You are running the latest version',
          detail: `Current version: ${currentVersion}`,
          buttons: ['OK'],
          icon: this.getAppIcon()
        });
      }
    } catch (error) {
      logger.core.error('Error checking for updates', {
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
    } finally {
      this.updateCheckInProgress = false;
    }
  }

  /**
   * Fetch latest release information from GitHub
   */
  private async fetchLatestRelease(): Promise<UpdateInfo | null> {
    try {
      const response = await fetch(`https://api.github.com/repos/${this.repo}/releases/latest`);

      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`);
      }

      const data = await response.json();

      return {
        version: data.tag_name,
        releaseNotes: data.body,
        releaseDate: data.published_at
      };
    } catch (error) {
      logger.core.error('Failed to fetch latest release', {
        error: error instanceof Error ? error.message : error
      });
      return null;
    }
  }

  /**
   * Compare two semantic versions
   * Returns true if newVersion is greater than currentVersion
   */
  private isNewerVersion(current: string, latest: string): boolean {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const currentPart = currentParts[i] || 0;
      const latestPart = latestParts[i] || 0;

      if (latestPart > currentPart) return true;
      if (latestPart < currentPart) return false;
    }

    return false;
  }
}

export const updateService = new UpdateService();
