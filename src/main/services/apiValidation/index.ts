import { getLogger } from '../logging';
import type { ValidationResult, ProviderValidationConfig } from './types';
import { validateOpenRouter } from './providers/openrouter';
import { validateGateway } from './providers/gateway';
import { validateLocal } from './providers/local';
import { validateOpenAI } from './providers/openai';
import { validateAnthropic } from './providers/anthropic';
import { validateGoogle } from './providers/google';

// Re-export types for convenience
export type { ValidationResult, ProviderValidationConfig };

const logger = getLogger();

export class ApiValidationService {
  /**
   * Validate API key/endpoint for any provider
   */
  static async validateProvider(config: ProviderValidationConfig): Promise<ValidationResult> {
    try {
      logger.core.debug('Validating provider', { type: config.type });

      switch (config.type) {
        case 'openrouter':
          return await validateOpenRouter(config.apiKey);
        case 'gateway':
          return await validateGateway(config.apiKey!, config.endpoint);
        case 'local':
          return await validateLocal(config.endpoint!);
        case 'openai':
          return await validateOpenAI(config.apiKey!);
        case 'anthropic':
          return await validateAnthropic(config.apiKey!);
        case 'google':
          return await validateGoogle(config.apiKey!);
        default:
          return {
            isValid: false,
            error: 'Unknown provider type',
          };
      }
    } catch (error) {
      logger.core.error('Provider validation failed', {
        type: config.type,
        error: error instanceof Error ? error.message : error,
      });

      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }
}
