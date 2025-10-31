import { getLogger } from '../../logging';
import type { ValidationResult } from '../types';
import type { ModelsResponse } from '../types';

const logger = getLogger();

/**
 * Validate OpenRouter API key (optional)
 */
export async function validateOpenRouter(apiKey?: string): Promise<ValidationResult> {
  try {
    // If API key provided, validate it with auth/key endpoint
    if (apiKey) {
      const authResponse = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!authResponse.ok) {
        if (authResponse.status === 401 || authResponse.status === 403) {
          return {
            isValid: false,
            error: 'Invalid API key. Please check your OpenRouter API key.',
          };
        }

        return {
          isValid: false,
          error: `OpenRouter API error: ${authResponse.statusText}`,
        };
      }

      const authData = await authResponse.json();

      logger.core.info('OpenRouter API key validated', {
        hasApiKey: true,
        keyData: authData?.data || authData,
      });
    }

    // Fetch models to verify API access
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        isValid: false,
        error: `Failed to fetch models: ${response.statusText}`,
      };
    }

    const data = await response.json() as ModelsResponse;
    const modelsCount = data.data?.length || 0;

    logger.core.info('OpenRouter validation successful', {
      hasApiKey: !!apiKey,
      modelsCount,
    });

    return {
      isValid: true,
      modelsCount,
    };
  } catch (error) {
    logger.core.error('OpenRouter validation error', {
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
      error: error instanceof Error ? error.message : 'Failed to connect to OpenRouter',
    };
  }
}
