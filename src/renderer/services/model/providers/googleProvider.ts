import type { Model } from '../../../../types/models';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

/**
 * Fetch models from Google AI API
 */
export async function fetchGoogleModels(apiKey: string): Promise<Model[]> {
  try {
    const result = await window.levante.models.fetchGoogle(apiKey);

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch Google models');
    }

    const data = result.data || [];

    // Filter to only generative models
    return data
      .filter((model: any) => model.name && model.name.includes('models/gemini'))
      .map((model: any): Model => {
        const modelId = model.name.replace('models/', '');
        return {
          id: modelId,
          name: modelId,
          provider: 'google',
          contextLength: getContextLength(modelId),
          capabilities: getCapabilities(model),
          isAvailable: true,
          userDefined: false,
          pricing: undefined // Google API doesn't provide pricing
        };
      });
  } catch (error) {
    logger.models.error('Failed to fetch Google models', {
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
}

function getContextLength(modelId: string): number {
  if (modelId.includes('gemini-2')) return 1000000;
  if (modelId.includes('gemini-1.5-pro')) return 2000000;
  if (modelId.includes('gemini-1.5')) return 1000000;
  return 32000;
}

function getCapabilities(model: any): string[] {
  const caps = ['text', 'tools'];
  if (model.supportedGenerationMethods?.includes('generateContent')) {
    caps.push('vision');
  }
  return caps;
}
