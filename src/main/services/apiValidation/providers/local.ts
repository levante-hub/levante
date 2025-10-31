import { getLogger } from '../../logging';
import type { ValidationResult } from '../types';
import type { ModelsResponse } from '../types';

const logger = getLogger();

/**
 * Validate local endpoint (Ollama, LM Studio)
 */
export async function validateLocal(endpoint: string): Promise<ValidationResult> {
  try {
    if (!endpoint) {
      return {
        isValid: false,
        error: 'Endpoint is required for local models',
      };
    }

    // Try Ollama endpoint first
    const response = await fetch(`${endpoint}/api/tags`, {
      signal: AbortSignal.timeout(5000), // 5s timeout for local
    });

    if (!response.ok) {
      // Try OpenAI-compatible endpoint as fallback
      const fallbackResponse = await fetch(`${endpoint}/v1/models`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!fallbackResponse.ok) {
        return {
          isValid: false,
          error: `Cannot connect to local server. Make sure it's running at ${endpoint}`,
        };
      }

      const fallbackData = await fallbackResponse.json() as ModelsResponse;
      const modelsCount = fallbackData.data?.length || 0;

      logger.core.info('Local validation successful (OpenAI-compatible)', {
        endpoint,
        modelsCount,
      });

      return {
        isValid: true,
        modelsCount,
      };
    }

    const data = await response.json() as ModelsResponse;
    const modelsCount = data.models?.length || 0;

    logger.core.info('Local validation successful (Ollama)', {
      endpoint,
      modelsCount,
    });

    return {
      isValid: true,
      modelsCount,
    };
  } catch (error) {
    logger.core.error('Local validation error', {
      error: error instanceof Error ? error.message : error,
      endpoint,
    });

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        isValid: false,
        error: `Connection timeout. Is your local server running at ${endpoint}?`,
      };
    }

    return {
      isValid: false,
      error: `Cannot connect to local server. Make sure it's running at ${endpoint}`,
    };
  }
}
