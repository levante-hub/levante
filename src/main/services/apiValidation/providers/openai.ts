import { getLogger } from '../../logging';
import type { ValidationResult } from '../types';
import type { ModelsResponse } from '../types';

const logger = getLogger();

/**
 * Validate OpenAI API key
 */
export async function validateOpenAI(apiKey: string): Promise<ValidationResult> {
  try {
    if (!apiKey) {
      return {
        isValid: false,
        error: 'API key is required for OpenAI',
      };
    }

    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return {
          isValid: false,
          error: 'Invalid OpenAI API key.',
        };
      }

      return {
        isValid: false,
        error: `OpenAI API error: ${response.statusText}`,
      };
    }

    const data = await response.json() as ModelsResponse;
    const modelsCount = data.data?.length || 0;

    logger.core.info('OpenAI validation successful', { modelsCount });

    return {
      isValid: true,
      modelsCount,
    };
  } catch (error) {
    logger.core.error('OpenAI validation error', {
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
      error: error instanceof Error ? error.message : 'Failed to connect to OpenAI',
    };
  }
}
