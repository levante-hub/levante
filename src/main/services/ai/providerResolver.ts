import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGateway } from "@ai-sdk/gateway";
import type { ProviderConfig } from "../../../types/models";
import { getLogger } from '../logging';

const logger = getLogger();

/**
 * Resolve and configure the AI model provider for a given model ID
 * Handles all provider types: OpenRouter, Vercel Gateway, Local, and Cloud providers
 */
export async function getModelProvider(modelId: string) {
  try {
    // Get providers configuration from preferences via IPC
    const { preferencesService } = await import("../preferencesService");

    let providers: ProviderConfig[];
    try {
      providers =
        (preferencesService.get("providers") as ProviderConfig[]) || [];

      // Debug: Log loaded providers
      logger.aiSdk.debug("Loaded providers from preferences", {
        providerCount: providers.length,
        providers: providers.map(p => ({
          id: p.id,
          type: p.type,
          hasApiKey: !!p.apiKey,
          apiKeyPrefix: p.apiKey?.substring(0, 10)
        }))
      });
    } catch (error) {
      logger.aiSdk.warn("No providers found in preferences, using empty array");
      providers = [];
    }

    // If no providers configured, throw error
    if (providers.length === 0) {
      logger.aiSdk.error("No providers configured");
      throw new Error(
        "No AI providers configured. Please configure at least one provider in the Models page."
      );
    }

    // Find which provider this model belongs to
    // For dynamic providers, check selectedModelIds (since models array is empty in storage)
    // For user-defined providers, check models array
    const providerWithModel = providers.find((provider) => {
      if (provider.modelSource === 'dynamic') {
        // Dynamic providers save only selectedModelIds
        return provider.selectedModelIds?.includes(modelId);
      } else {
        // User-defined providers have full model data
        return provider.models.some(
          (model) => model.id === modelId && model.isSelected !== false
        );
      }
    });

    if (!providerWithModel) {
      // Log all available providers and their models for debugging
      logger.aiSdk.error("Model not found in any configured provider", {
        modelId,
        totalProviders: providers.length,
        availableProviders: providers.map(p => ({
          id: p.id,
          name: p.name,
          type: p.type,
          modelSource: p.modelSource,
          modelCount: p.models.length,
          selectedModels: p.modelSource === 'dynamic'
            ? (p.selectedModelIds || [])
            : p.models.filter(m => m.isSelected !== false).map(m => m.id)
        }))
      });

      throw new Error(
        `Model "${modelId}" not found in any configured provider. Please select the model in the Models page and ensure it is enabled.`
      );
    }

    // Log the provider that will be used
    logger.aiSdk.info("Using configured provider for model", {
      modelId,
      providerType: providerWithModel.type,
      providerName: providerWithModel.name,
      providerId: providerWithModel.id,
      hasApiKey: !!providerWithModel.apiKey,
      hasBaseUrl: !!providerWithModel.baseUrl,
      apiKeyPrefix: providerWithModel.apiKey?.substring(0, 10) + '...'
    });

    // Configure provider based on type
    return configureProvider(providerWithModel, modelId);
  } catch (error) {
    logger.aiSdk.error("Error getting model provider configuration", {
      error: error instanceof Error ? error.message : error,
      modelId
    });
    // Re-throw the error instead of using fallback
    throw error;
  }
}

/**
 * Configure a specific provider based on its type
 */
function configureProvider(provider: ProviderConfig, modelId: string) {
  switch (provider.type) {
    case "vercel-gateway":
      return configureVercelGateway(provider, modelId);

    case "openrouter":
      return configureOpenRouter(provider, modelId);

    case "local":
      return configureLocalProvider(provider, modelId);

    case "openai":
      return configureOpenAI(provider, modelId);

    case "anthropic":
      return configureAnthropic(provider, modelId);

    case "google":
      return configureGoogle(provider, modelId);

    case "groq":
      return configureGroq(provider, modelId);

    case "xai":
      return configureXAI(provider, modelId);

    default:
      throw new Error(`Unknown provider type: ${provider.type}`);
  }
}

/**
 * Configure Vercel AI Gateway provider
 */
function configureVercelGateway(provider: ProviderConfig, modelId: string) {
  if (!provider.apiKey || !provider.baseUrl) {
    throw new Error(
      `Vercel AI Gateway configuration incomplete for provider ${provider.name}`
    );
  }

  // For AI calls, use /v1/ai endpoint (different from models listing endpoint)
  const gatewayApiUrl = provider.baseUrl.includes("/v1/ai")
    ? provider.baseUrl
    : provider.baseUrl.replace("/v1", "/v1/ai");

  logger.aiSdk.debug("Creating Vercel Gateway provider", {
    modelId,
    gatewayApiUrl
  });

  const gateway = createGateway({
    apiKey: provider.apiKey,
    baseURL: gatewayApiUrl,
  });

  return gateway(modelId);
}

/**
 * Configure OpenRouter provider
 */
function configureOpenRouter(provider: ProviderConfig, modelId: string) {
  if (!provider.apiKey) {
    throw new Error(
      `OpenRouter API key is required. Get your free API key at https://openrouter.ai/keys`
    );
  }

  logger.aiSdk.debug("Creating OpenRouter provider", {
    modelId,
    baseURL: "https://openrouter.ai/api/v1"
  });

  const openrouter = createOpenAICompatible({
    name: "openrouter",
    apiKey: provider.apiKey,
    baseURL: "https://openrouter.ai/api/v1",
  });

  return openrouter(modelId);
}

/**
 * Configure Local provider (Ollama, LM Studio, etc.)
 */
function configureLocalProvider(provider: ProviderConfig, modelId: string) {
  if (!provider.baseUrl) {
    throw new Error(
      `Local provider endpoint missing for provider ${provider.name}`
    );
  }

  // Ensure the baseURL has the /v1 suffix for OpenAI compatibility
  // Ollama, LM Studio, and other local providers use /v1/chat/completions
  let localBaseUrl = provider.baseUrl;
  if (!localBaseUrl.endsWith('/v1')) {
    localBaseUrl = localBaseUrl.replace(/\/$/, '') + '/v1';
  }

  logger.aiSdk.debug("Creating Local provider", {
    modelId,
    baseURL: localBaseUrl
  });

  const localProvider = createOpenAICompatible({
    name: "local",
    baseURL: localBaseUrl,
  });

  return localProvider(modelId);
}

/**
 * Configure OpenAI provider
 */
function configureOpenAI(provider: ProviderConfig, modelId: string) {
  if (!provider.apiKey) {
    throw new Error(
      `OpenAI API key missing for provider ${provider.name}`
    );
  }

  logger.aiSdk.debug("Creating OpenAI provider", { modelId });

  const openaiProvider = createOpenAI({
    apiKey: provider.apiKey,
    organization: provider.organizationId,
  });

  return openaiProvider(modelId);
}

/**
 * Configure Anthropic provider
 */
function configureAnthropic(provider: ProviderConfig, modelId: string) {
  if (!provider.apiKey) {
    throw new Error(
      `Anthropic API key missing for provider ${provider.name}`
    );
  }

  logger.aiSdk.debug("Creating Anthropic provider", { modelId });

  const anthropicProvider = createAnthropic({
    apiKey: provider.apiKey,
  });

  return anthropicProvider(modelId);
}

/**
 * Configure Google AI provider
 */
function configureGoogle(provider: ProviderConfig, modelId: string) {
  if (!provider.apiKey) {
    throw new Error(
      `Google AI API key missing for provider ${provider.name}`
    );
  }

  logger.aiSdk.debug("Creating Google provider", { modelId });

  const googleProvider = createGoogleGenerativeAI({
    apiKey: provider.apiKey,
  });

  return googleProvider(modelId);
}

/**
 * Configure Groq provider
 */
function configureGroq(provider: ProviderConfig, modelId: string) {
  if (!provider.apiKey) {
    throw new Error(
      `Groq API key missing for provider ${provider.name}`
    );
  }

  logger.aiSdk.debug("Creating Groq provider", {
    modelId,
    baseURL: provider.baseUrl || "https://api.groq.com/openai/v1"
  });

  const groq = createOpenAICompatible({
    name: "groq",
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl || "https://api.groq.com/openai/v1",
  });

  return groq(modelId);
}

/**
 * Configure xAI provider
 */
function configureXAI(provider: ProviderConfig, modelId: string) {
  if (!provider.apiKey) {
    throw new Error(
      `xAI API key missing for provider ${provider.name}`
    );
  }

  logger.aiSdk.debug("Creating xAI provider", {
    modelId,
    baseURL: provider.baseUrl || "https://api.x.ai/v1"
  });

  const xai = createOpenAICompatible({
    name: "xai",
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl || "https://api.x.ai/v1",
  });

  return xai(modelId);
}
