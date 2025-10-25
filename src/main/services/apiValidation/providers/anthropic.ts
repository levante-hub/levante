import { getLogger } from '../../logging';
import type { ValidationResult } from '../types';

const logger = getLogger();

/**
 * Validate Anthropic API key
 */
export async function validateAnthropic(apiKey: string): Promise<ValidationResult> {
  try {
    if (!apiKey) {
      return {
        isValid: false,
        error: 'API key is required for Anthropic',
      };
    }

    // Anthropic doesn't have a public /models endpoint
    // We'll do a minimal API call to validate the key
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    // We expect either 200 (success) or potentially other valid responses
    // 401 means invalid key
    if (response.status === 401 || response.status === 403) {
      return {
        isValid: false,
        error: 'Invalid Anthropic API key.',
      };
    }

    // Any other status likely means the key is valid
    logger.core.info('Anthropic validation successful');

    return {
      isValid: true,
    };
  } catch (error) {
    logger.core.error('Anthropic validation error', {
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
      error: error instanceof Error ? error.message : 'Failed to connect to Anthropic',
    };
  }
}
