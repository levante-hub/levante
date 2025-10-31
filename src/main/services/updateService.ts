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
   * Check if the current version is a pre-release (beta, alpha, rc)
   */
  private isBetaVersion(): boolean {
    const version = app.getVersion();
    return version.includes('-beta') || version.includes('-alpha') || version.includes('-rc');
  }

  /**
   * Compare two semver versions
   * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   */
  private compareVersions(v1: string, v2: string): number {
    // Remove 'v' prefix if present
    const cleanV1 = v1.replace(/^v/, '');
    const cleanV2 = v2.replace(/^v/, '');

    // Split into parts: [major, minor, patch, prerelease]
    const parseVersion = (v: string) => {
      const match = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
      if (!match) return null;

      return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10),
        prerelease: match[4] || null
      };
    };

    const parsed1 = parseVersion(cleanV1);
    const parsed2 = parseVersion(cleanV2);

    if (!parsed1 || !parsed2) {
      logger.core.warn('Failed to parse versions for comparison', { v1, v2 });
      return 0;
    }

    // Compare major.minor.patch
    if (parsed1.major !== parsed2.major) return parsed1.major > parsed2.major ? 1 : -1;
    if (parsed1.minor !== parsed2.minor) return parsed1.minor > parsed2.minor ? 1 : -1;
    if (parsed1.patch !== parsed2.patch) return parsed1.patch > parsed2.patch ? 1 : -1;

    // If versions are equal in major.minor.patch, compare prerelease
    if (!parsed1.prerelease && !parsed2.prerelease) return 0; // Both stable, equal
    if (!parsed1.prerelease) return 1;  // v1 is stable, v2 is prerelease -> v1 is newer
    if (!parsed2.prerelease) return -1; // v2 is stable, v1 is prerelease -> v2 is newer

    // Both have prerelease, compare strings (beta.4 vs beta.5)
    return parsed1.prerelease.localeCompare(parsed2.prerelease);
  }

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
   * Sets up background update checks using update-electron-app or autoUpdater
   */
  initialize(): void {
    if (process.env.NODE_ENV === 'production' || app.isPackaged) {
      try {
        const isBeta = this.isBetaVersion();

        if (isBeta) {
          // For beta versions, use autoUpdater directly with pre-release support
          this.initializeBetaUpdates();
        } else {
          // For stable versions, use update-electron-app (simpler, battle-tested)
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
        }

        this.autoUpdateInitialized = true;
        logger.core.info('Auto-update system initialized', {
          repo: this.repo,
          version: app.getVersion(),
          isBeta,
          includesPrereleases: isBeta
        });
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
   * Initialize beta version updates using autoUpdater directly
   * This allows us to include pre-releases in the update feed
   */
  private initializeBetaUpdates(): void {
    const { platform } = process;
    const version = app.getVersion();

    // Construct feed URL with pre-release support
    // Format: https://update.electronjs.org/:owner/:repo/:platform-:arch/:version
    const feedUrl = `https://update.electronjs.org/levante-hub/levante/${platform}-${process.arch}/${version}`;

    logger.core.info('Configuring beta auto-update', {
      version,
      platform: `${platform}-${process.arch}`,
      feedUrl
    });

    try {
      // Set feed URL for beta updates
      autoUpdater.setFeedURL({
        url: feedUrl,
        serverType: 'default'
      });

      // Setup event handlers
      autoUpdater.on('update-available', () => {
        logger.core.info('Beta update available, downloading...');
      });

      autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
        logger.core.info('Beta update downloaded', { releaseName });

        // Show notification to user
        dialog.showMessageBox({
          type: 'info',
          title: 'Update Ready',
          message: 'A new beta version has been downloaded',
          detail: `Version ${releaseName} is ready to install. The application will restart to apply the update.`,
          buttons: ['Restart Now', 'Later'],
          icon: this.getAppIcon()
        }).then((result) => {
          if (result.response === 0) {
            autoUpdater.quitAndInstall();
          }
        });
      });

      autoUpdater.on('error', (error) => {
        logger.core.error('Beta auto-update error', {
          error: error instanceof Error ? error.message : String(error)
        });
      });

      // Check for updates every hour
      const checkInterval = 60 * 60 * 1000; // 1 hour
      setInterval(() => {
        autoUpdater.checkForUpdates();
      }, checkInterval);

      // Initial check
      autoUpdater.checkForUpdates();

    } catch (error) {
      logger.core.error('Failed to initialize beta auto-update', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get latest release version from GitHub
   * Includes pre-releases if current version is beta
   */
  private async getLatestRemoteVersion(): Promise<string | null> {
    try {
      const isBeta = this.isBetaVersion();
      const url = `https://api.github.com/repos/${this.repo}/releases`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Levante-App'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const releases = await response.json();

      // Filter releases based on version type
      const validReleases = releases.filter((release: any) => {
        if (isBeta) {
          // For beta versions, include all releases (stable and pre-release)
          return true;
        } else {
          // For stable versions, only include stable releases
          return !release.prerelease;
        }
      });

      if (validReleases.length > 0) {
        return validReleases[0].tag_name;
      }

      return null;
    } catch (error) {
      logger.core.error('Failed to fetch latest version from GitHub', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
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
      const updateNotAvailableHandler = async () => {
        // Fetch latest remote version to show in dialog
        const latestVersion = await this.getLatestRemoteVersion();
        const currentVersion = app.getVersion();
        const isBeta = this.isBetaVersion();

        // Compare versions to determine if update is truly not available
        let isUpToDate = true;
        let message = 'You are running the latest version';
        let title = 'No Updates Available';

        if (latestVersion) {
          const comparison = this.compareVersions(currentVersion, latestVersion);

          if (comparison < 0) {
            // Current version is older than latest version
            isUpToDate = false;
            message = 'A newer version is available but could not be installed';
            title = 'Update Available';

            logger.core.warn('Update available but autoUpdater reported not available', {
              currentVersion,
              latestVersion,
              comparison
            });
          }
        }

        let detail = `Current version: ${currentVersion}`;
        if (latestVersion) {
          detail += `\nLatest version checked: ${latestVersion}`;
          if (isBeta) {
            detail += '\n\n(Beta channel: checking for pre-releases)';
          }

          if (!isUpToDate) {
            detail += '\n\nThe update system detected a newer version but could not download it automatically. ';
            detail += 'Please download the latest version manually from:\nhttps://github.com/levante-hub/levante/releases';
          }
        }

        dialog.showMessageBox({
          type: isUpToDate ? 'info' : 'warning',
          title,
          message,
          detail,
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
