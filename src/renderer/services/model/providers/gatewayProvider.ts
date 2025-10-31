import type { Model } from '../../../../types/models';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

/**
 * Fetch models from Vercel AI Gateway
 */
export async function fetchGatewayModels(
  apiKey: string,
  baseUrl: string = 'https://ai-gateway.vercel.sh/v1'
): Promise<Model[]> {
  try {
    // For model listing, always use /v1 endpoint (not /v1/ai)
    const modelsEndpoint = baseUrl.includes('/v1/ai')
      ? baseUrl.replace('/v1/ai', '/v1')
      : baseUrl;

    const result = await window.levante.models.fetchGateway(apiKey, modelsEndpoint);

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch Gateway models');
    }

    const data = result.data || [];

    return data.map((model: any): Model => ({
      id: model.id,
      name: model.id,
      provider: 'vercel-gateway',
      contextLength: getModelContextLength(model.id),
      capabilities: ['text'],
      isAvailable: true,
      userDefined: false,
      pricing: getModelPricing(model)
    }));
  } catch (error) {
    logger.models.error('Failed to fetch Gateway models', {
      baseUrl,
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
}

/**
 * Get context length based on model ID patterns
 */
function getModelContextLength(modelId: string): number {
  if (modelId.includes('claude')) {
    if (modelId.includes('sonnet') || modelId.includes('opus')) return 200000;
    if (modelId.includes('haiku')) return 100000;
  }
  if (modelId.includes('gpt-4')) return 128000;
  if (modelId.includes('gpt-3.5')) return 16000;
  if (modelId.includes('gemini')) return 32000;
  return 4000; // Default fallback
}

/**
 * Get pricing from model response (Gateway doesn't provide pricing)
 */
function getModelPricing(model: any): { input: number; output: number } | undefined {
  // Gateway doesn't provide pricing in their API response
  return undefined;
}
