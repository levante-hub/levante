import * as fs from 'fs/promises';
import { directoryService } from './directoryService';
import { getLogger } from './logging';
import type { UserProfile, WizardCompletionData } from '../../types/userProfile';
import { DEFAULT_USER_PROFILE } from '../../types/userProfile';

export class UserProfileService {
  private logger = getLogger();
  private initialized = false;
  private profile: UserProfile | null = null;

  constructor() {}

  /**
   * Initialize the service and load user profile
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await directoryService.ensureBaseDir();
      this.profile = await this.loadProfile();
      this.initialized = true;

      this.logger.core.info('UserProfileService initialized', {
        wizardStatus: this.profile.wizard,
        profileExists: !!this.profile,
      });
    } catch (error) {
      this.logger.core.error('Failed to initialize UserProfileService', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Load user profile from ~/levante/user-profile.json
   */
  private async loadProfile(): Promise<UserProfile> {
    const profilePath = directoryService.getUserProfilePath();

    try {
      const exists = await directoryService.fileExists('user-profile.json');

      if (!exists) {
        this.logger.core.info('User profile does not exist, creating default', {
          profilePath,
        });

        // Create default profile with installation timestamp
        const defaultProfile: UserProfile = {
          ...DEFAULT_USER_PROFILE,
          installedAt: new Date().toISOString(),
        };

        await this.saveProfile(defaultProfile);
        return defaultProfile;
      }

      const content = await fs.readFile(profilePath, 'utf-8');
      const profile = JSON.parse(content) as UserProfile;

      this.logger.core.debug('User profile loaded', {
        profilePath,
        wizardStatus: profile.wizard,
      });

      return profile;
    } catch (error) {
      this.logger.core.error('Failed to load user profile', {
        profilePath,
        error: error instanceof Error ? error.message : error,
      });

      // Return default profile on error
      return { ...DEFAULT_USER_PROFILE };
    }
  }

  /**
   * Save user profile to ~/levante/user-profile.json
   */
  private async saveProfile(profile: UserProfile): Promise<void> {
    const profilePath = directoryService.getUserProfilePath();

    try {
      await fs.writeFile(
        profilePath,
        JSON.stringify(profile, null, 2),
        'utf-8'
      );

      this.profile = profile;

      this.logger.core.debug('User profile saved', {
        profilePath,
        wizardStatus: profile.wizard,
      });
    } catch (error) {
      this.logger.core.error('Failed to save user profile', {
        profilePath,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(): Promise<UserProfile> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.profile || { ...DEFAULT_USER_PROFILE };
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    if (!this.initialized) {
      await this.initialize();
    }

    const currentProfile = await this.getProfile();
    const updatedProfile: UserProfile = {
      ...currentProfile,
      ...updates,
    };

    await this.saveProfile(updatedProfile);

    this.logger.core.info('User profile updated', {
      updates,
      wizardStatus: updatedProfile.wizard,
    });

    return updatedProfile;
  }

  /**
   * Check if wizard is completed
   */
  async isWizardCompleted(): Promise<boolean> {
    const profile = await this.getProfile();
    const isCompleted = profile.wizard === 'completed';

    this.logger.core.debug('Wizard completion check', {
      wizardStatus: profile.wizard,
      isCompleted,
    });

    return isCompleted;
  }

  /**
   * Check wizard status
   */
  async getWizardStatus(): Promise<'not_started' | 'in_progress' | 'completed'> {
    const profile = await this.getProfile();
    return profile.wizard;
  }

  /**
   * Mark wizard as in progress
   */
  async markWizardInProgress(): Promise<void> {
    await this.updateProfile({
      wizard: 'in_progress',
    });

    this.logger.core.info('Wizard marked as in progress');
  }

  /**
   * Complete wizard with provider information
   */
  async completeWizard(data: WizardCompletionData): Promise<void> {
    await this.updateProfile({
      wizard: 'completed',
      completedAt: data.timestamp,
      initialProvider: data.provider,
      version: data.version,
    });

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
    await this.updateProfile({
      wizard: 'not_started',
      completedAt: undefined,
      initialProvider: undefined,
    });

    this.logger.core.warn('Wizard reset');
  }

  /**
   * Get user profile file path
   */
  getProfilePath(): string {
    return directoryService.getUserProfilePath();
  }
}

// Singleton instance
export const userProfileService = new UserProfileService();
