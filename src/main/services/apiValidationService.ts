import { getLogger } from './logging';
import type { ValidationResult, ProviderValidationConfig } from '../../types/wizard';

interface ModelsResponse {
  data?: any[];
  models?: any[];
}

const logger = getLogger();

// Re-export types for convenience
export type { ValidationResult, ProviderValidationConfig };

export class ApiValidationService {
  /**
   * Validate API key/endpoint for any provider
   */
  static async validateProvider(config: ProviderValidationConfig): Promise<ValidationResult> {
    try {
      logger.core.debug('Validating provider', { type: config.type });

      switch (config.type) {
        case 'openrouter':
          return await this.validateOpenRouter(config.apiKey);
        case 'gateway':
          return await this.validateGateway(config.apiKey!, config.endpoint);
        case 'local':
          return await this.validateLocal(config.endpoint!);
        case 'openai':
          return await this.validateOpenAI(config.apiKey!);
        case 'anthropic':
          return await this.validateAnthropic(config.apiKey!);
        case 'google':
          return await this.validateGoogle(config.apiKey!);
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

  /**
   * Validate OpenRouter API key (optional)
   */
  private static async validateOpenRouter(apiKey?: string): Promise<ValidationResult> {
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

  /**
   * Validate Vercel AI Gateway
   */
  private static async validateGateway(
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

  /**
   * Validate local endpoint (Ollama, LM Studio)
   */
  private static async validateLocal(endpoint: string): Promise<ValidationResult> {
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

  /**
   * Validate OpenAI API key
   */
  private static async validateOpenAI(apiKey: string): Promise<ValidationResult> {
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

  /**
   * Validate Anthropic API key
   */
  private static async validateAnthropic(apiKey: string): Promise<ValidationResult> {
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

  /**
   * Validate Google AI API key
   */
  private static async validateGoogle(apiKey: string): Promise<ValidationResult> {
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
}
