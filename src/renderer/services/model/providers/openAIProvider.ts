import type { Model } from '../../../../types/models';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

/**
 * Fetch models from OpenAI API
 */
export async function fetchOpenAIModels(apiKey: string): Promise<Model[]> {
  try {
    const result = await window.levante.models.fetchOpenAI(apiKey);

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch OpenAI models');
    }

    const data = result.data || [];

    // Filter to only chat models (gpt-* models)
    return data
      .filter((model: any) => model.id.startsWith('gpt-'))
      .map((model: any): Model => ({
        id: model.id,
        name: model.id,
        provider: 'openai',
        contextLength: getContextLength(model.id),
        capabilities: getCapabilities(model.id),
        isAvailable: true,
        userDefined: false,
        pricing: undefined // OpenAI API doesn't provide pricing
      }));
  } catch (error) {
    logger.models.error('Failed to fetch OpenAI models', {
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
}

function getContextLength(modelId: string): number {
  if (modelId.includes('gpt-4')) return 128000;
  if (modelId.includes('gpt-3.5-turbo-16k')) return 16000;
  if (modelId.includes('gpt-3.5')) return 4000;
  return 4000;
}

function getCapabilities(modelId: string): string[] {
  const caps = ['text', 'tools'];
  if (modelId.includes('gpt-4') && !modelId.includes('0314') && !modelId.includes('0613')) {
    caps.push('vision');
  }
  return caps;
}
