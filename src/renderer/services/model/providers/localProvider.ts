import type { Model } from '../../../../types/models';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

/**
 * Discover models from local endpoint (Ollama, LM Studio, etc.)
 */
export async function discoverLocalModels(endpoint: string): Promise<Model[]> {
  try {
    const result = await window.levante.models.fetchLocal(endpoint);

    if (!result.success) {
      logger.models.warn('Failed to discover local models', {
        endpoint,
        error: result.error
      });
      return [];
    }

    const data = result.data || [];

    return data.map((model: any): Model => ({
      id: model.name,
      name: model.name,
      provider: 'local',
      contextLength: model.details?.context_length || 4000,
      capabilities: ['text'],
      isAvailable: true,
      userDefined: false
    }));
  } catch (error) {
    logger.models.error('Failed to discover local models', {
      endpoint,
      error: error instanceof Error ? error.message : error
    });
    return [];
  }
}
