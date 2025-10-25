import { getLogger } from '../../logging';
import type { ValidationResult } from '../types';
import type { ModelsResponse } from '../types';

const logger = getLogger();

/**
 * Validate Vercel AI Gateway
 */
export async function validateGateway(
  apiKey: string,
  baseUrl?: string
): Promise<ValidationResult> {
  try {
    if (!apiKey) {
      return {
        isValid: false,
        error: 'API key is required for Vercel AI Gateway',
      };
    }

    // Use default Vercel AI Gateway URL if not provided
    const gatewayUrl = baseUrl || 'https://ai-gateway.vercel.sh/v1';

    // Normalize URL: remove /v1/ai suffix if present, ensure /v1 suffix
    let normalizedUrl = gatewayUrl.replace(/\/v1\/ai\/?$/, '');
    if (!normalizedUrl.endsWith('/v1')) {
      normalizedUrl = normalizedUrl.replace(/\/$/, '') + '/v1';
    }

    // Validate API key by making a minimal chat completion request
    // The /models endpoint doesn't require auth, so we need to use a protected endpoint
    const chatEndpoint = `${normalizedUrl}/chat/completions`;

    logger.core.debug('Validating Vercel AI Gateway', {
      originalUrl: baseUrl,
      normalizedUrl,
      chatEndpoint,
      apiKeyLength: apiKey.length,
      apiKeyPrefix: apiKey.substring(0, 8) + '...',
    });

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    // Make a minimal request to validate the API key
    // We expect this to fail with a specific error about model or messages,
    // but NOT with 401/403 if the key is valid
    const response = await fetch(chatEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });

    logger.core.debug('Gateway response received', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    // Parse response to get error details
    let responseData: any;
    try {
      responseData = await response.json();
    } catch {
      responseData = null;
    }

    // 401/403 means invalid API key
    if (response.status === 401 || response.status === 403) {
      const errorMsg = responseData?.error?.message || responseData?.message || 'Invalid API key';
      logger.core.warn('Gateway authentication failed', {
        status: response.status,
        error: errorMsg,
      });
      return {
        isValid: false,
        error: `Invalid API key. ${errorMsg}`,
      };
    }

    // 404 means wrong endpoint
    if (response.status === 404) {
      return {
        isValid: false,
        error: 'Gateway endpoint not found. Please verify your base URL is correct.',
      };
    }

    // Any other error (400, 500, etc.) likely means the API key is valid
    // but there's an issue with the request itself (which is expected for validation)
    // Common errors: "model not found", "invalid messages", etc. are OK - they mean auth worked

    if (responseData?.error) {
      const errorMsg = responseData.error.message || responseData.error;
      logger.core.debug('Gateway returned error (but auth likely OK)', {
        status: response.status,
        error: errorMsg,
      });

      // Check if error is about authentication vs request format
      const authErrors = ['unauthorized', 'forbidden', 'api key', 'authentication', 'api_key'];
      const isAuthError = authErrors.some(term =>
        errorMsg.toLowerCase().includes(term)
      );

      if (isAuthError) {
        return {
          isValid: false,
          error: `Authentication failed: ${errorMsg}`,
        };
      }
    }

    // If we got here, the API key is likely valid
    // Now fetch models to get count
    const modelsEndpoint = `${normalizedUrl}/models`;
    const modelsResponse = await fetch(modelsEndpoint, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    let modelsCount = 0;
    if (modelsResponse.ok) {
      const data = await modelsResponse.json() as ModelsResponse;
      modelsCount = data.data?.length || 0;
    }

    logger.core.info('Gateway validation successful', {
      normalizedUrl,
      modelsCount,
      validationMethod: 'chat endpoint test',
    });

    return {
      isValid: true,
      modelsCount,
    };
  } catch (error) {
    logger.core.error('Gateway validation error', {
      error: error instanceof Error ? error.message : error,
      baseUrl,
    });

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        isValid: false,
        error: 'Connection timeout. Please check your internet connection and gateway endpoint.',
      };
    }

    if (error instanceof Error && error.message.includes('fetch')) {
      return {
        isValid: false,
        error: 'Failed to connect to gateway. Please verify the base URL is correct.',
      };
    }

    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Failed to connect to Gateway',
    };
  }
}
