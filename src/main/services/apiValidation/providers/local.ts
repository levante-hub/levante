import { getLogger } from '../../logging';
import type { ValidationResult, ModelsResponse } from '../types';

const logger = getLogger();

/**
 * Validate local endpoint (Ollama, LM Studio, private OpenAI-compatible).
 */
export async function validateLocal(
  endpoint: string,
  apiKey?: string
): Promise<ValidationResult> {
  try {
    if (!endpoint) {
      return {
        isValid: false,
        error: 'Endpoint is required for local models',
      };
    }

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    // Strip trailing /v1 so discovery paths don't double it when the user
    // saved the OpenAI-style base URL (http://host/v1).
    const rootEndpoint = endpoint.replace(/\/+$/, '').replace(/\/v1$/, '');

    // Try Ollama endpoint first
    const response = await fetch(`${rootEndpoint}/api/tags`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // Try OpenAI-compatible endpoint as fallback
      const fallbackResponse = await fetch(`${rootEndpoint}/v1/models`, {
        headers,
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
        hasApiKey: Boolean(apiKey),
      });

      return { isValid: true, modelsCount };
    }

    const data = await response.json() as ModelsResponse;
    const modelsCount = data.models?.length || 0;

    logger.core.info('Local validation successful (Ollama)', {
      endpoint,
      modelsCount,
      hasApiKey: Boolean(apiKey),
    });

    return { isValid: true, modelsCount };
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
