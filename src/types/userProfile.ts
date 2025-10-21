/**
 * User profile types for Levante
 * Stored in ~/levante/user-profile.json
 */

export interface UserProfile {
  /**
   * Wizard completion status
   * - "not_started": User hasn't started wizard
   * - "in_progress": User started but didn't complete
   * - "completed": User completed wizard successfully
   */
  wizard: 'not_started' | 'in_progress' | 'completed';

  /**
   * Timestamp when wizard was completed
   */
  completedAt?: string;

  /**
   * Initial provider configured during wizard
   */
  initialProvider?: string;

  /**
   * Wizard version (for future migrations)
   */
  version?: string;

  /**
   * User ID (optional, for future features)
   */
  userId?: string;

  /**
   * Installation timestamp
   */
  installedAt?: string;

  /**
   * Personalization settings
   */
  personalization?: PersonalizationSettings;
}

/**
 * Personalization settings for AI responses
 */
export interface PersonalizationSettings {
  /**
   * Enable or disable customization
   */
  enabled: boolean;

  /**
   * ChatGPT personality style
   * - "default": Cheerful and adaptive
   * - "cynic": Critical and sarcastic
   * - "robot": Efficient and blunt
   * - "listener": Thoughtful and supportive
   * - "nerd": Exploratory and enthusiastic
   */
  personality: 'default' | 'cynic' | 'robot' | 'listener' | 'nerd';

  /**
   * Custom instructions for additional behavior, style, and tone preferences
   */
  customInstructions?: string;

  /**
   * User nickname (what the AI should call the user)
   */
  nickname?: string;

  /**
   * User occupation (for context-aware responses)
   */
  occupation?: string;

  /**
   * Additional information about the user
   */
  aboutUser?: string;
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  wizard: 'not_started',
  version: '1.0.0',
};

export interface WizardCompletionData {
  provider: string;
  timestamp: string;
  version: string;
}
