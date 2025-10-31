import { getLogger } from '../../logging';
import type { ValidationResult } from '../types';
import type { ModelsResponse } from '../types';

const logger = getLogger();

/**
 * Validate Google AI API key
 */
export async function validateGoogle(apiKey: string): Promise<ValidationResult> {
  try {
    if (!apiKey) {
      return {
        isValid: false,
        error: 'API key is required for Google AI',
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      if (response.status === 400 || response.status === 403) {
        return {
          isValid: false,
          error: 'Invalid Google AI API key.',
        };
      }

      return {
        isValid: false,
        error: `Google AI API error: ${response.statusText}`,
      };
    }

    const data = await response.json() as ModelsResponse;
    const modelsCount = data.models?.length || 0;

    logger.core.info('Google AI validation successful', { modelsCount });

    return {
      isValid: true,
      modelsCount,
    };
  } catch (error) {
    logger.core.error('Google AI validation error', {
      error: error instanceof Error ? error.message : error,
    });

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        isValid: false,
        error: 'Connection timeout. Please check your internet connection.',
      };
    }

    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Failed to connect to Google AI',
    };
  }
}
