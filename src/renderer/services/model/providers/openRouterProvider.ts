import type { Model } from '../../../../types/models';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

/**
 * Fetch models from OpenRouter API
 */
export async function fetchOpenRouterModels(apiKey?: string): Promise<Model[]> {
  try {
    const result = await window.levante.models.fetchOpenRouter(apiKey);

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch OpenRouter models');
    }

    const data = result.data || [];

    return data.map((model: any): Model => ({
      id: model.id,
      name: model.name || model.id,
      provider: 'openrouter',
      contextLength: model.context_length || 4000,
      pricing: model.pricing ? {
        input: parseFloat(model.pricing.prompt) * 1000000, // Convert to per million tokens
        output: parseFloat(model.pricing.completion) * 1000000
      } : undefined,
      capabilities: parseOpenRouterCapabilities(model),
      isAvailable: true,
      userDefined: false
    }));
  } catch (error) {
    logger.models.error('Failed to fetch OpenRouter models', {
      hasApiKey: !!apiKey,
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
}

/**
 * Parse OpenRouter model capabilities
 */
function parseOpenRouterCapabilities(model: any): string[] {
  const capabilities: string[] = ['text'];

  // Check for vision/multimodal capabilities
  if (model.architecture?.modality?.includes('vision') ||
    model.architecture?.modality?.includes('image') ||
    model.id.toLowerCase().includes('vision') ||
    model.name?.toLowerCase().includes('vision')) {
    capabilities.push('vision');
  }

  // Check for function/tool calling
  if (model.supported_parameters?.includes('tools') ||
    model.supported_parameters?.includes('functions') ||
    model.architecture?.instruct_type === 'function') {
    capabilities.push('tools');
  }

  // Check for reasoning modes
  if (model.id.includes('reasoning') ||
    model.name?.toLowerCase().includes('reasoning') ||
    model.architecture?.instruct_type === 'reasoning') {
    capabilities.push('reasoning');
  }

  return capabilities;
}
