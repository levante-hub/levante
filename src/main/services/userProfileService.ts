import { directoryService } from './directoryService';
import { getLogger } from './logging';
import type { UserProfile, WizardCompletionData } from '../../types/userProfile';
import { DEFAULT_USER_PROFILE } from '../../types/userProfile';
import { safeStorage } from 'electron';
import * as crypto from 'crypto';

export class UserProfileService {
  private logger = getLogger();
  private initialized = false;
  private profile: UserProfile | null = null;
  private store: any;

  constructor() {}

  /**
   * Get or generate encryption key for user-profile store
   * Uses the same key as preferences for consistency
   */
  private getEncryptionKey(): string {
    const keyPath = directoryService.getFilePath('.encryption-key');

    try {
      const fs = require('fs');
      if (fs.existsSync(keyPath)) {
        const encryptedKey = fs.readFileSync(keyPath);

        if (safeStorage.isEncryptionAvailable()) {
          const decrypted = safeStorage.decryptString(encryptedKey);
          this.logger.core.debug('Loaded encryption key for user-profile');
          return decrypted;
        } else {
          this.logger.core.warn('safeStorage not available for user-profile');
          return crypto.randomBytes(32).toString('hex');
        }
      }

      // Generate new key
      const newKey = crypto.randomBytes(32).toString('hex');

      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(newKey);
        fs.writeFileSync(keyPath, encrypted);
        this.logger.core.info('Generated encryption key for user-profile');
      }

      return newKey;
    } catch (error) {
      this.logger.core.error('Failed to get encryption key for user-profile', {
        error: error instanceof Error ? error.message : error
      });
      return crypto.randomBytes(32).toString('hex');
    }
  }

  /**
   * Initialize the service and load user profile
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const Store = (await import('electron-store')).default;

      await directoryService.ensureBaseDir();

      // Get encryption key
      const encryptionKey = this.getEncryptionKey();

      // Initialize electron-store for user-profile
      this.store = new Store({
        name: 'user-profile',
        cwd: directoryService.getBaseDir(),
        encryptionKey,
        defaults: DEFAULT_USER_PROFILE,
        schema: {
          wizard: {
            type: 'string',
            enum: ['not_started', 'in_progress', 'completed'],
            default: 'not_started'
          },
          completedAt: {
            type: 'string'
          },
          initialProvider: {
            type: 'string'
          },
          version: {
            type: 'string',
            default: '1.0.0'
          },
          userId: {
            type: 'string'
          },
          installedAt: {
            type: 'string'
          },
          personalization: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', default: false },
              personality: {
                type: 'string',
                enum: ['default', 'cynic', 'robot', 'listener', 'nerd'],
                default: 'default'
              },
              customInstructions: { type: 'string', default: '' },
              nickname: { type: 'string' },
              occupation: { type: 'string' },
              aboutUser: { type: 'string' }
            }
          }
        }
      });

      this.profile = this.store.store;
      this.initialized = true;

      this.logger.core.info('UserProfileService initialized with electron-store', {
        wizardStatus: this.profile.wizard,
        storePath: this.store.path
      });
    } catch (error) {
      this.logger.core.error('Failed to initialize UserProfileService', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Ensure service is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.store) {
      throw new Error('UserProfileService not initialized. Call initialize() first.');
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(): Promise<UserProfile> {
    if (!this.initialized) {
      await this.initialize();
    }

    this.ensureInitialized();
    const profile = this.store.store as UserProfile;

    // Ensure installedAt is set for existing profiles
    if (!profile.installedAt) {
      this.store.set('installedAt', new Date().toISOString());
    }

    return profile;
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    if (!this.initialized) {
      await this.initialize();
    }

    this.ensureInitialized();

    // Update each field individually
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        this.store.set(key, value);
      }
    });

    const updatedProfile = this.store.store as UserProfile;

    this.logger.core.info('User profile updated', {
      updates: Object.keys(updates),
      wizardStatus: updatedProfile.wizard,
    });

    return updatedProfile;
  }

  /**
   * Check if wizard is completed
   */
  async isWizardCompleted(): Promise<boolean> {
    this.ensureInitialized();
    const wizardStatus = this.store.get('wizard');
    const isCompleted = wizardStatus === 'completed';

    this.logger.core.debug('Wizard completion check', {
      wizardStatus,
      isCompleted,
    });

    return isCompleted;
  }

  /**
   * Check wizard status
   */
  async getWizardStatus(): Promise<'not_started' | 'in_progress' | 'completed'> {
    this.ensureInitialized();
    return this.store.get('wizard');
  }

  /**
   * Mark wizard as in progress
   */
  async markWizardInProgress(): Promise<void> {
    this.ensureInitialized();
    this.store.set('wizard', 'in_progress');
    this.logger.core.info('Wizard marked as in progress');
  }

  /**
   * Complete wizard with provider information
   */
  async completeWizard(data: WizardCompletionData): Promise<void> {
    this.ensureInitialized();

    this.store.set('wizard', 'completed');
    this.store.set('completedAt', data.timestamp);
    this.store.set('initialProvider', data.provider);
    this.store.set('version', data.version);

    this.logger.core.info('Wizard completed', {
      provider: data.provider,
      timestamp: data.timestamp,
      version: data.version,
    });
  }

  /**
   * Reset wizard (for testing/debugging)
   */
  async resetWizard(): Promise<void> {
    this.ensureInitialized();

    this.store.set('wizard', 'not_started');
    this.store.delete('completedAt');
    this.store.delete('initialProvider');

    this.logger.core.warn('Wizard reset');
  }

  /**
   * Get user profile file path
   */
  getProfilePath(): string {
    this.ensureInitialized();
    return this.store.path;
  }
}

// Singleton instance
export const userProfileService = new UserProfileService();
