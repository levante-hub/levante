import { ipcMain } from 'electron';
import { ModelFetchService } from '../services/modelFetchService';
import { getLogger } from '../services/logging';

const logger = getLogger();

export function setupModelHandlers() {
  // Fetch OpenRouter models
  ipcMain.removeHandler('levante/models/openrouter');
  ipcMain.handle('levante/models/openrouter', async (_, apiKey?: string) => {
    try {
      const models = await ModelFetchService.fetchOpenRouterModels(apiKey);
      return {
        success: true,
        data: models
      };
    } catch (error) {
      logger.ipc.error('Failed to fetch OpenRouter models', { error: error instanceof Error ? error.message : error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Fetch Gateway models
  ipcMain.removeHandler('levante/models/gateway');
  ipcMain.handle('levante/models/gateway', async (_, apiKey: string, baseUrl?: string) => {
    try {
      const models = await ModelFetchService.fetchGatewayModels(apiKey, baseUrl);
      return {
        success: true,
        data: models
      };
    } catch (error) {
      logger.ipc.error('Failed to fetch Gateway models', { error: error instanceof Error ? error.message : error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Fetch local models
  ipcMain.removeHandler('levante/models/local');
  ipcMain.handle('levante/models/local', async (_, endpoint: string, apiKey?: string) => {
    try {
      const models = await ModelFetchService.fetchLocalModels(endpoint, apiKey);
      return {
        success: true,
        data: models
      };
    } catch (error) {
      logger.ipc.error('Failed to fetch local models', { endpoint, error: error instanceof Error ? error.message : error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Fetch OpenAI models
  ipcMain.removeHandler('levante/models/openai');
  ipcMain.handle(
    'levante/models/openai',
    async (
      _,
      params:
        | string
        | { apiKey?: string; authMode?: 'api-key' | 'oauth'; organizationId?: string }
    ) => {
      try {
        const models = await ModelFetchService.fetchOpenAIModels(params);
        return {
          success: true,
          data: models
        };
      } catch (error) {
        logger.ipc.error('Failed to fetch OpenAI models', {
          error: error instanceof Error ? error.message : error
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  // Fetch Google AI models
  ipcMain.removeHandler('levante/models/google');
  ipcMain.handle('levante/models/google', async (_, apiKey: string) => {
    try {
      const models = await ModelFetchService.fetchGoogleModels(apiKey);
      return {
        success: true,
        data: models
      };
    } catch (error) {
      logger.ipc.error('Failed to fetch Google models', { error: error instanceof Error ? error.message : error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Fetch Anthropic models
  ipcMain.removeHandler('levante/models/anthropic');
  ipcMain.handle('levante/models/anthropic', async (_, params: { apiKey?: string; authMode?: 'api-key' | 'oauth' }) => {
    try {
      const models = await ModelFetchService.fetchAnthropicModels(params || {});
      return {
        success: true,
        data: models
      };
    } catch (error) {
      logger.ipc.error('Failed to fetch Anthropic models', { error: error instanceof Error ? error.message : error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Fetch Groq models
  ipcMain.removeHandler('levante/models/groq');
  ipcMain.handle('levante/models/groq', async (_, apiKey: string) => {
    try {
      const models = await ModelFetchService.fetchGroqModels(apiKey);
      return {
        success: true,
        data: models
      };
    } catch (error) {
      logger.ipc.error('Failed to fetch Groq models', { error: error instanceof Error ? error.message : error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Fetch xAI models
  ipcMain.removeHandler('levante/models/xai');
  ipcMain.handle('levante/models/xai', async (_, apiKey: string) => {
    try {
      const models = await ModelFetchService.fetchXAIModels(apiKey);
      return {
        success: true,
        data: models
      };
    } catch (error) {
      logger.ipc.error('Failed to fetch xAI models', { error: error instanceof Error ? error.message : error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Fetch Hugging Face models
  ipcMain.removeHandler('levante/models/huggingface');
  ipcMain.handle('levante/models/huggingface', async (_, apiKey: string) => {
    try {
      const models = await ModelFetchService.fetchHuggingFaceModels(apiKey);
      return {
        success: true,
        data: models
      };
    } catch (error) {
      logger.ipc.error('Failed to fetch Hugging Face models', { error: error instanceof Error ? error.message : error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Fetch Levante Platform models (uses OAuth tokens)
  ipcMain.removeHandler('levante/models/levante-platform');
  ipcMain.handle('levante/models/levante-platform', async (_, baseUrl?: string) => {
    try {
      const models = await ModelFetchService.fetchLevantePlatformModels(baseUrl);
      return {
        success: true,
        data: models
      };
    } catch (error) {
      logger.ipc.error('Failed to fetch Levante Platform models', { error: error instanceof Error ? error.message : error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Validate Hugging Face model (fetch model info from HF API)
  ipcMain.removeHandler('levante/models/huggingface/validate');
  ipcMain.handle('levante/models/huggingface/validate', async (_, modelId: string, inferenceProvider?: string) => {
    try {
      const providerSlug = inferenceProvider?.trim();

      if (!providerSlug) {
        return {
          success: false,
          error: 'Inference provider is required'
        };
      }

      const apiUrl = `https://huggingface.co/api/models/${modelId}`;

      const response = await fetch(apiUrl);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: 'Model not found on Hugging Face Hub'
          };
        }
        return {
          success: false,
          error: `Failed to fetch model info (HTTP ${response.status})`
        };
      }

      const data = await response.json();
      const pipelineTag: string | undefined = data.pipeline_tag;

      // Validate that model has inference capability
      // The "inference" field must be "warm" for the model to be usable for inference
      if (data.inference !== 'warm') {
        logger.ipc.warn('Model validation failed: inference not warm', {
          modelId,
          inference: data.inference
        });
        return {
          success: false,
          error: 'Este modelo no es válido para inferencia'
        };
      }

      if (!pipelineTag) {
        logger.ipc.warn('Model validation failed: missing pipeline tag', { modelId });
        return {
          success: false,
          error: 'No se pudo determinar la tarea del modelo'
        };
      }

      const modelNameFragment = modelId.includes('/') ? modelId.split('/').pop() || modelId : modelId;
      const searchUrl = new URL('https://huggingface.co/api/models');
      searchUrl.searchParams.set('inference_provider', providerSlug);
      searchUrl.searchParams.set('pipeline_tag', pipelineTag);
      searchUrl.searchParams.set('search', modelNameFragment);
      searchUrl.searchParams.set('limit', '20');

      const searchResponse = await fetch(searchUrl.toString());

      if (!searchResponse.ok) {
        logger.ipc.warn('Hugging Face provider search failed', {
          modelId,
          providerSlug,
          pipelineTag,
          status: searchResponse.status
        });
        return {
          success: false,
          error: `No se pudo verificar el provider (HTTP ${searchResponse.status})`
        };
      }

      const searchPayload = await searchResponse.json();
      const searchResults: Array<{ id?: string }> = Array.isArray(searchPayload) ? searchPayload : [];
      const isListedForProvider = searchResults.some(model => model?.id === modelId);

      if (!isListedForProvider) {
        logger.ipc.warn('Model not listed for inference provider', {
          modelId,
          providerSlug,
          pipelineTag
        });
        return {
          success: false,
          error: 'Este modelo no está disponible en el router de Hugging Face con ese provider'
        };
      }

      return {
        success: true,
        data: {
          id: data.id,
          pipeline_tag: pipelineTag,
          modelId: data.modelId,
          author: data.author,
          downloads: data.downloads,
          likes: data.likes,
          inference: data.inference
        }
      };
    } catch (error) {
      logger.ipc.error('Failed to validate Hugging Face model', {
        modelId,
        error: error instanceof Error ? error.message : error
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to validate model'
      };
    }
  });

  logger.ipc.info('Model IPC handlers registered');
}
