import type { Model } from '../../../../types/models';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

/**
 * Fetch models from xAI API
 */
export async function fetchXAIModels(apiKey: string): Promise<Model[]> {
  try {
    const result = await window.levante.models.fetchXAI(apiKey);

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch xAI models');
    }

    const data = result.data || [];

    return data.map((model: any): Model => ({
      id: model.id,
      name: model.id,
      provider: 'xai',
      contextLength: getContextLength(model.id),
      capabilities: getCapabilities(model.id),
      isAvailable: true,
      userDefined: false,
      pricing: undefined // xAI API doesn't provide pricing
    }));
  } catch (error) {
    logger.models.error('Failed to fetch xAI models', {
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
}

function getContextLength(modelId: string): number {
  if (modelId.includes('grok-beta')) return 131072;
  if (modelId.includes('grok-vision')) return 8192;
  return 131072;
}

function getCapabilities(modelId: string): string[] {
  const caps = ['text', 'tools'];
  if (modelId.includes('vision')) {
    caps.push('vision');
  }
  return caps;
}
