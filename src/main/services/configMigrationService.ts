import { getLogger } from './logging';
import { directoryService } from './directoryService';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = getLogger();

/**
 * Migration definition
 */
export interface ConfigMigration {
  version: string;
  name: string;
  description: string;
  migrate: () => Promise<void>;
}

/**
 * Configuration Migration Service
 * Handles migrations for JSON configuration files (ui-preferences.json and user-profile.json)
 */
export class ConfigMigrationService {
  private migrations: ConfigMigration[] = [];
  private versionFilePath: string;

  constructor() {
    this.versionFilePath = directoryService.getFilePath('.config-version');
    this.registerMigrations();
  }

  /**
   * Register all available migrations
   */
  private registerMigrations(): void {
    // Migration 1.0 → 1.1: Move theme/language from user-profile to ui-preferences
    this.migrations.push({
      version: '1.1.0',
      name: 'move-theme-language',
      description: 'Move theme and language from user-profile.json to ui-preferences.json',
      migrate: async () => {
        await this.migrateThemeAndLanguage();
      }
    });

    // Migration 1.1 → 1.2: Detect and remove old encrypted files
    this.migrations.push({
      version: '1.2.0',
      name: 'remove-old-encrypted-files',
      description: 'Detect old fully-encrypted config files and mark for regeneration',
      migrate: async () => {
        await this.removeOldEncryptedFiles();
      }
    });

    // Future migrations can be added here
    // this.migrations.push({ ... });
  }

  /**
   * Get current configuration version
   */
  private async getCurrentVersion(): Promise<string> {
    try {
      const exists = await directoryService.fileExists('.config-version');
      if (!exists) {
        return '1.0.0'; // Default version for existing installations
      }

      const content = await fs.readFile(this.versionFilePath, 'utf-8');
      return content.trim();
    } catch (error) {
      logger.core.warn('Failed to read config version, defaulting to 1.0.0', {
        error: error instanceof Error ? error.message : error
      });
      return '1.0.0';
    }
  }

  /**
   * Save current configuration version
   */
  private async saveVersion(version: string): Promise<void> {
    try {
      await fs.writeFile(this.versionFilePath, version, 'utf-8');
      logger.core.info('Saved config version', { version });
    } catch (error) {
      logger.core.error('Failed to save config version', {
        version,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  /**
   * Compare semantic versions
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const a = parts1[i] || 0;
      const b = parts2[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<void> {
    try {
      const currentVersion = await this.getCurrentVersion();
      logger.core.info('Checking config migrations', { currentVersion });

      let latestVersion = currentVersion;

      for (const migration of this.migrations) {
        // Skip if migration version is not newer than current
        if (this.compareVersions(migration.version, currentVersion) <= 0) {
          logger.core.debug('Skipping migration (already applied)', {
            migrationVersion: migration.version,
            currentVersion
          });
          continue;
        }

        logger.core.info('Running config migration', {
          version: migration.version,
          name: migration.name,
          description: migration.description
        });

        try {
          await migration.migrate();
          latestVersion = migration.version;

          logger.core.info('Config migration completed', {
            version: migration.version,
            name: migration.name
          });
        } catch (error) {
          logger.core.error('Config migration failed', {
            version: migration.version,
            name: migration.name,
            error: error instanceof Error ? error.message : error
          });
          // Don't throw - continue with other migrations
          // But don't update version if migration failed
        }
      }

      // Save latest applied version
      if (latestVersion !== currentVersion) {
        await this.saveVersion(latestVersion);
      }
    } catch (error) {
      logger.core.error('Failed to run config migrations', {
        error: error instanceof Error ? error.message : error
      });
    }
  }

  /**
   * Migration 1.1 → 1.2: Remove old encrypted files
   * Detects files encrypted with old full-file encryption and backs them up
   */
  private async removeOldEncryptedFiles(): Promise<void> {
    const filesToCheck = ['ui-preferences.json', 'user-profile.json'];

    for (const fileName of filesToCheck) {
      try {
        const filePath = path.join(directoryService.getBaseDir(), fileName);
        const exists = await directoryService.fileExists(fileName);

        if (!exists) continue;

        // Try to read as JSON
        const content = await fs.readFile(filePath, 'utf-8');

        // Check if it's valid JSON
        try {
          JSON.parse(content);
          logger.core.info(`File ${fileName} is valid JSON, no migration needed`);
        } catch (jsonError) {
          // File is not valid JSON - likely old encrypted format
          logger.core.info(`Detected old encrypted format in ${fileName}, backing up and marking for regeneration`);

          // Backup old file
          const backupPath = `${filePath}.old-encrypted`;
          await fs.rename(filePath, backupPath);

          logger.core.info(`Backed up old encrypted file`, {
            original: fileName,
            backup: `${fileName}.old-encrypted`
          });
        }
      } catch (error) {
        logger.core.error(`Failed to check/migrate ${fileName}`, {
          error: error instanceof Error ? error.message : error
        });
      }
    }
  }

  /**
   * Migration 1.0 → 1.1: Move theme/language from user-profile to ui-preferences
   */
  private async migrateThemeAndLanguage(): Promise<void> {
    const userProfilePath = path.join(directoryService.getBaseDir(), 'user-profile.json');
    const uiPreferencesPath = path.join(directoryService.getBaseDir(), 'ui-preferences.json');

    try {
      // Read old user-profile.json (non-encrypted)
      const userProfileExists = await directoryService.fileExists('user-profile.json');
      if (!userProfileExists) {
        logger.core.info('No user-profile.json found, skipping migration');
        return;
      }

      const userProfileContent = await fs.readFile(userProfilePath, 'utf-8');
      const userProfile = JSON.parse(userProfileContent);

      // Extract theme and language
      const { theme, language, user, metadata, conversations, ...cleanProfile } = userProfile;

      // Read ui-preferences.json
      let uiPreferences: any = {};
      const uiPreferencesExists = await directoryService.fileExists('ui-preferences.json');
      if (uiPreferencesExists) {
        const uiPreferencesContent = await fs.readFile(uiPreferencesPath, 'utf-8');
        uiPreferences = JSON.parse(uiPreferencesContent);
      }

      // Move theme and language to ui-preferences if they exist
      if (theme && !uiPreferences.theme) {
        uiPreferences.theme = theme;
        logger.core.info('Migrated theme from user-profile to ui-preferences', { theme });
      }

      if (language && !uiPreferences.language) {
        uiPreferences.language = language;
        logger.core.info('Migrated language from user-profile to ui-preferences', { language });
      }

      // Save updated ui-preferences.json
      await fs.writeFile(uiPreferencesPath, JSON.stringify(uiPreferences, null, 2), 'utf-8');

      // Clean user-profile.json (remove theme, language, user, metadata, conversations)
      await fs.writeFile(userProfilePath, JSON.stringify(cleanProfile, null, 2), 'utf-8');

      logger.core.info('Migration 1.0 → 1.1 completed: cleaned user-profile.json', {
        removed: ['theme', 'language', 'user', 'metadata', 'conversations'].filter(key => key in userProfile)
      });
    } catch (error) {
      logger.core.error('Failed to migrate theme/language', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }
}

// Singleton instance
export const configMigrationService = new ConfigMigrationService();
