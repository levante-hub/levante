import { getLogger } from "./logging";
import {
  validateLocalEndpoint,
  validatePublicUrl,
  logBlockedUrl,
  safeFetch,
  normalizeEndpoint,
} from "../utils/urlValidator";
import { getOAuthService } from "./oauth";
import { envConfig } from "./envConfig";
import { getProviderConfig } from "./subscription-oauth/providers";

interface ModelResponse {
  object: string;
  data: Array<Record<string, any>>;
  has_more?: boolean;
  next_offset?: string | null;
}

const logger = getLogger();

export class ModelFetchService {
  // Fetch OpenRouter models
  static async fetchOpenRouterModels(apiKey?: string): Promise<any[]> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add authorization header only if API key is provided
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers,
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      logger.models.error("Failed to fetch OpenRouter models", {
        error: error instanceof Error ? error.message : error,
        hasApiKey: !!apiKey,
      });
      throw error;
    }
  }

  // Fetch Vercel AI Gateway models
  static async fetchGatewayModels(
    apiKey: string,
    baseUrl: string = "https://ai-gateway.vercel.sh/v1"
  ): Promise<any[]> {
    let normalizedBaseUrl = baseUrl;
    try {
      // Normalize endpoint (add http:// if missing)
      normalizedBaseUrl = normalizeEndpoint(baseUrl);

      // Validate baseUrl format and protocol
      const validation = validateLocalEndpoint(normalizedBaseUrl);
      if (!validation.valid) {
        logBlockedUrl(
          normalizedBaseUrl,
          validation.error || "Invalid URL",
          "fetchGatewayModels"
        );
        throw new Error(validation.error || "Invalid gateway URL");
      }

      // For model listing, always use /v1 endpoint (not /v1/ai)
      const modelsEndpoint = normalizedBaseUrl.includes("/v1/ai")
        ? normalizedBaseUrl.replace("/v1/ai", "/v1")
        : normalizedBaseUrl;

      const response = await safeFetch(`${modelsEndpoint}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Gateway API error: ${response.statusText}`);
      }

      const data: ModelResponse = await response.json();
      return data.data || [];
    } catch (error) {
      logger.models.error("Failed to fetch Gateway models", {
        error: error instanceof Error ? error.message : error,
        baseUrl: normalizedBaseUrl,
        modelsEndpoint: normalizedBaseUrl.includes("/v1/ai")
          ? normalizedBaseUrl.replace("/v1/ai", "/v1")
          : normalizedBaseUrl,
      });
      throw error;
    }
  }

  // Fetch local models (Ollama or OpenAI-compatible)
  static async fetchLocalModels(endpoint: string, apiKey?: string): Promise<any[]> {
    try {
      // Normalize endpoint (add http:// if missing)
      const normalizedEndpoint = normalizeEndpoint(endpoint);

      // Security: Validate endpoint URL to prevent SSRF attacks
      const validation = validateLocalEndpoint(normalizedEndpoint);
      if (!validation.valid) {
        logBlockedUrl(
          normalizedEndpoint,
          validation.error || "Invalid URL",
          "fetchLocalModels"
        );
        throw new Error(validation.error || "Invalid endpoint URL");
      }

      // Strip trailing /v1 (and any trailing slash) so discovery paths don't double it.
      // Users may save the OpenAI-style base URL (e.g. http://host/v1) used for inference.
      const rootEndpoint = normalizedEndpoint
        .replace(/\/+$/, '')
        .replace(/\/v1$/, '');

      const authHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        authHeaders.Authorization = `Bearer ${apiKey}`;
      }

      // 1. Try Ollama endpoint (/api/tags)
      try {
        const ollamaUrl = `${rootEndpoint}/api/tags`;
        logger.models.debug(`Trying Ollama endpoint: ${ollamaUrl}`);
        // Use shorter timeout for first attempt
        const response = await safeFetch(
          ollamaUrl,
          { headers: authHeaders },
          2000
        );

        logger.models.debug(
          `Ollama endpoint response: ${response.status} ${response.statusText}`
        );

        if (response.ok) {
          const data = await response.json();
          logger.models.debug(
            `Ollama models found: ${data.models?.length || 0}`
          );

          // Only return if we actually found models, otherwise try OpenAI endpoint
          // LM Studio might return 200 OK for /api/tags but with empty/different structure
          if (data.models && data.models.length > 0) {
            return data.models;
          }
          logger.models.debug(
            `Ollama endpoint returned valid response but 0 models, falling back to OpenAI endpoint`
          );
        }
      } catch (e) {
        // Prepare to try next method
        logger.models.debug(
          `Ollama endpoint failed for ${normalizedEndpoint}, trying OpenAI-compatible endpoint`,
          { error: e }
        );
      }

      // 2. Try OpenAI-compatible endpoint (/v1/models)
      // This is used by LM Studio, LocalAI, etc.
      const url = `${rootEndpoint}/v1/models`;
      logger.models.debug(`Trying OpenAI endpoint: ${url}`);

      const response = await safeFetch(url, {
        headers: authHeaders,
      });

      logger.models.debug(
        `OpenAI endpoint response: ${response.status} ${response.statusText}`
      );

      if (!response.ok) {
        throw new Error(`Local API error: ${response.statusText}`);
      }

      const data = await response.json();
      logger.models.debug(`Raw OpenAI data received:`, { data });

      const models = data.data || [];
      logger.models.debug(`OpenAI models found: ${models.length}`);

      // Normalize OpenAI models to match Ollama format (expecting 'name')
      const normalized = models.map((m: any) => ({
        ...m,
        name: m.name || m.id, // Ensure name exists
        details: m.details || { family: "unknown" },
      }));

      logger.models.debug(`Normalized models:`, { normalized });
      return normalized;
    } catch (error) {
      logger.models.error("Failed to fetch local models", {
        error: error instanceof Error ? error.message : error,
        endpoint: normalizeEndpoint(endpoint),
      });
      throw error;
    }
  }

  // Fetch OpenAI models
  static async fetchOpenAIModels(
    params:
      | string
      | { apiKey?: string; authMode?: 'api-key' | 'oauth'; organizationId?: string }
  ): Promise<any[]> {
    const normalized =
      typeof params === 'string'
        ? { apiKey: params, authMode: 'api-key' as const }
        : params;

    if (normalized.authMode === 'oauth') {
      try {
        return await ModelFetchService.fetchSubscriptionOAuthModels('openai', {
          organizationId: normalized.organizationId,
        });
      } catch (error) {
        logger.models.warn('OpenAI OAuth model fetch failed, using fallback list', {
          error: error instanceof Error ? error.message : error,
        });
        return ModelFetchService.getSubscriptionOAuthFallbackModels('openai');
      }
    }

    if (!normalized.apiKey) {
      throw new Error('OpenAI API key required for api-key mode.');
    }

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${normalized.apiKey}`,
        'Content-Type': 'application/json',
      };

      if (normalized.organizationId?.trim()) {
        headers['OpenAI-Organization'] = normalized.organizationId.trim();
      }

      const response = await fetch('https://api.openai.com/v1/models', { headers });

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`OpenAI API error (${response.status}): ${text}`);
      }

      const data: ModelResponse = await response.json();
      return data.data || [];
    } catch (error) {
      logger.models.error('Failed to fetch OpenAI models', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  // Fetch Google AI models
  static async fetchGoogleModels(apiKey: string): Promise<any[]> {
    try {
      // Security: API key in Authorization header instead of URL query string
      // This prevents API key exposure in logs, browser history, and network monitoring
      const response = await safeFetch(
        "https://generativelanguage.googleapis.com/v1beta/models",
        {
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Google AI API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.models || [];
    } catch (error) {
      logger.models.error("Failed to fetch Google models", {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  // Fetch Anthropic models
  static async fetchAnthropicModels(params: { apiKey?: string; authMode?: 'api-key' | 'oauth' }): Promise<any[]> {
    const authMode = params.authMode === 'oauth' ? 'oauth' : 'api-key';

    if (authMode === 'oauth') {
      try {
        return await ModelFetchService.fetchSubscriptionOAuthModels('anthropic');
      } catch (error) {
        logger.models.warn('Anthropic OAuth model fetch failed, using fallback list', {
          error: error instanceof Error ? error.message : error,
        });
        return ModelFetchService.getSubscriptionOAuthFallbackModels('anthropic');
      }
    }

    if (!params.apiKey) {
      throw new Error('Anthropic API key required for api-key mode.');
    }

    try {
      const response = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": params.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      logger.models.error("Failed to fetch Anthropic models", {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  private static async fetchSubscriptionOAuthModels(
    providerId: 'anthropic' | 'openai',
    options?: { organizationId?: string }
  ): Promise<any[]> {
    const config = getProviderConfig(providerId);

    // OpenAI Codex subscription tokens don't have access to /v1/models,
    // so return the known Codex models directly.
    if (providerId === 'openai') {
      return config.fallbackModels;
    }

    const { getSubscriptionOAuthService } = await import(
      './subscription-oauth/SubscriptionOAuthService'
    );

    const oauth = getSubscriptionOAuthService(providerId);
    const accessToken = await oauth.getValidAccessToken();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(config.oauthModelFetchHeaders || {}),
    };

    if (options?.organizationId?.trim()) {
      headers['OpenAI-Organization'] = options.organizationId.trim();
    }

    const response = await fetch(config.modelsEndpoint, { headers });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`${config.displayName} OAuth models error (${response.status}): ${text}`);
    }

    const data = await response.json();
    const models = data.data || data.models || [];
    if (models.length > 0) {
      return models;
    }

    logger.models.warn(`${config.displayName} OAuth models endpoint returned empty list, using fallback list`);
    return config.fallbackModels;
  }

  private static getSubscriptionOAuthFallbackModels(
    providerId: 'anthropic' | 'openai'
  ): any[] {
    return getProviderConfig(providerId).fallbackModels;
  }

  // Fetch Groq models
  static async fetchGroqModels(apiKey: string): Promise<any[]> {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.statusText}`);
      }

      const data: ModelResponse = await response.json();
      return data.data || [];
    } catch (error) {
      logger.models.error("Failed to fetch Groq models", {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  // Fetch xAI models
  static async fetchXAIModels(apiKey: string): Promise<any[]> {
    try {
      const response = await fetch("https://api.x.ai/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`xAI API error: ${response.statusText}`);
      }

      const data: ModelResponse = await response.json();
      return data.data || [];
    } catch (error) {
      logger.models.error("Failed to fetch xAI models", {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  // Fetch Hugging Face models
  static async fetchHuggingFaceModels(apiKey: string): Promise<any[]> {
    try {
      const allModels: any[] = [];
      let nextOffset: string | null | undefined = undefined;
      let page = 0;

      do {
        const url = new URL("https://router.huggingface.co/v1/models");
        if (nextOffset) {
          url.searchParams.set("after", nextOffset);
        }

        const response = await safeFetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Hugging Face API error: ${response.statusText}`);
        }

        const data: ModelResponse = await response.json();
        const models = data.data || [];
        allModels.push(...models);

        logger.models.debug("Fetched Hugging Face models page", {
          page,
          fetched: models.length,
          total: allModels.length,
          hasMore: data.has_more,
          nextOffset: data.next_offset,
        });

        if (data.has_more && data.next_offset) {
          nextOffset = data.next_offset;
          page += 1;
        } else {
          nextOffset = null;
        }
      } while (nextOffset);

      return allModels;
    } catch (error) {
      logger.models.error("Failed to fetch Hugging Face models", {
        error: error instanceof Error ? error.message : error,
        hasApiKey: !!apiKey,
      });
      throw error;
    }
  }

  // Fetch Levante Platform models
  // Uses OAuth tokens instead of API keys
  static async fetchLevantePlatformModels(baseUrl?: string): Promise<any[]> {
    const LEVANTE_PLATFORM_SERVER_ID = "levante-platform";
    const effectiveBaseUrl = baseUrl || envConfig.platformUrl;

    try {
      // Get OAuth service and check for valid tokens
      const oauthService = getOAuthService();
      const tokens = await oauthService.getExistingToken(LEVANTE_PLATFORM_SERVER_ID);

      if (!tokens) {
        logger.models.warn("No OAuth tokens for Levante Platform. Please authorize first.");
        return [];
      }

      // Fetch models using OAuth token
      const response = await safeFetch(`${effectiveBaseUrl}/api/v1/models`, {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Levante Platform API error: ${response.statusText}`);
      }

      const data: ModelResponse = await response.json();
      return data.data || [];
    } catch (error) {
      logger.models.error("Failed to fetch Levante Platform models", {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }
}
