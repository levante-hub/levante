import type { Model } from '../../../../types/models';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

/**
 * Fetch models from Groq API
 */
export async function fetchGroqModels(apiKey: string): Promise<Model[]> {
  try {
    const result = await window.levante.models.fetchGroq(apiKey);

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch Groq models');
    }

    const data = result.data || [];

    return data.map((model: any): Model => ({
      id: model.id,
      name: model.id,
      provider: 'groq',
      contextLength: getContextLength(model.id),
      capabilities: ['text', 'tools'],
      isAvailable: true,
      userDefined: false,
      pricing: undefined // Groq API doesn't provide pricing
    }));
  } catch (error) {
    logger.models.error('Failed to fetch Groq models', {
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
}

function getContextLength(modelId: string): number {
  if (modelId.includes('llama-3.3-70b')) return 128000;
  if (modelId.includes('llama-3.1')) return 128000;
  if (modelId.includes('mixtral-8x7b')) return 32768;
  return 8192;
}
