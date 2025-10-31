import type { Model, ProviderConfig } from '../../types/models';
import { getRendererLogger } from '@/services/logger';
import { migrateCloudProvider, migrateCloudProvidersToDynamic } from './model/migrations';
import { fetchOpenRouterModels } from './model/providers/openRouterProvider';
import { fetchGatewayModels } from './model/providers/gatewayProvider';
import { discoverLocalModels } from './model/providers/localProvider';
import { fetchOpenAIModels } from './model/providers/openAIProvider';
import { fetchGoogleModels } from './model/providers/googleProvider';
import { fetchAnthropicModels } from './model/providers/anthropicProvider';
import { fetchGroqModels } from './model/providers/groqProvider';
import { fetchXAIModels } from './model/providers/xAIProvider';

const logger = getRendererLogger();

class ModelServiceImpl {
  private providers: ProviderConfig[] = [];
  private activeProviderId: string | null = null;
  private isInitialized = false;

  // Initialize with default providers and load from storage
  async initialize(): Promise<void> {
    // Prevent double initialization from React StrictMode
    if (this.isInitialized) {
      return;
    }

    try {
      // Load providers from electron store
      const providersResult = await window.levante.preferences.get('providers');
      const activeProviderResult = await window.levante.preferences.get('activeProvider');

      this.providers = (providersResult.success && providersResult.data) ? providersResult.data : [];
      this.activeProviderId = (activeProviderResult.success && activeProviderResult.data) ? activeProviderResult.data : null;

      // Migrate old 'cloud' provider to new cloud providers
      const migrationResult = await migrateCloudProvider(this.providers);
      if (migrationResult.migrated) {
        this.providers = migrationResult.providers;
        if (migrationResult.activeProviderId) {
          this.activeProviderId = migrationResult.activeProviderId;
        }
        logger.models.info('Migrated old cloud provider to new cloud providers');
        await this.saveProviders();
      }

      // Migrate cloud providers from user-defined to dynamic
      const dynamicMigrationResult = await migrateCloudProvidersToDynamic(this.providers);
      if (dynamicMigrationResult.migrated) {
        this.providers = dynamicMigrationResult.providers;
        logger.models.info('Migrated cloud providers to dynamic model source');
        await this.saveProviders();
      }

      // Set default providers if none exist
      if (this.providers.length === 0) {
        await this.initializeDefaultProviders();
      }

      this.isInitialized = true;
    } catch (error) {
      logger.models.error('Failed to initialize ModelService', {
        error: error instanceof Error ? error.message : error
      });
      await this.initializeDefaultProviders();
      this.isInitialized = true;
    }
  }

  private async initializeDefaultProviders(): Promise<void> {
    const defaultProviders: ProviderConfig[] = [
      {
        id: 'openrouter',
        name: 'OpenRouter',
        type: 'openrouter',
        models: [],
        isActive: false,
        settings: {},
        modelSource: 'dynamic'
      },
      {
        id: 'vercel-gateway',
        name: 'Vercel AI Gateway',
        type: 'vercel-gateway',
        models: [],
        isActive: false,
        settings: {},
        modelSource: 'dynamic',
        baseUrl: 'https://ai-gateway.vercel.sh/v1'
      },
      {
        id: 'local',
        name: 'Local Provider',
        type: 'local',
        models: [],
        isActive: false,
        settings: {},
        modelSource: 'user-defined'
      },
      {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        models: [],
        isActive: false,
        settings: {},
        modelSource: 'dynamic'
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        type: 'anthropic',
        models: [],
        isActive: false,
        settings: {},
        modelSource: 'dynamic'
      },
      {
        id: 'google',
        name: 'Google AI',
        type: 'google',
        models: [],
        isActive: false,
        settings: {},
        modelSource: 'dynamic'
      },
      {
        id: 'groq',
        name: 'Groq',
        type: 'groq',
        models: [],
        isActive: false,
        settings: {},
        modelSource: 'dynamic',
        baseUrl: 'https://api.groq.com/openai/v1'
      },
      {
        id: 'xai',
        name: 'xAI',
        type: 'xai',
        models: [],
        isActive: false,
        settings: {},
        modelSource: 'dynamic',
        baseUrl: 'https://api.x.ai/v1'
      }
    ];

    this.providers = defaultProviders;
    this.activeProviderId = 'openai';
    await this.saveProviders();
  }

  // Get active provider
  async getActiveProvider(): Promise<ProviderConfig | null> {
    if (!this.activeProviderId) return null;
    return this.providers.find(p => p.id === this.activeProviderId) || null;
  }

  // Get available models from active provider (only selected ones)
  async getAvailableModels(): Promise<Model[]> {
    const activeProvider = await this.getActiveProvider();
    if (!activeProvider) return [];

    // For dynamic providers, sync models first
    if (activeProvider.modelSource === 'dynamic') {
      try {
        await this.syncProviderModels(activeProvider.id);
      } catch (error) {
        logger.models.error('Failed to sync models for getAvailableModels', {
          providerId: activeProvider.id,
          error: error instanceof Error ? error.message : error
        });
      }
    }

    return activeProvider.models.filter(m => m.isAvailable && m.isSelected !== false);
  }

  // Get all models from active provider (including unselected)
  async getAllProviderModels(): Promise<Model[]> {
    const activeProvider = await this.getActiveProvider();
    if (!activeProvider) return [];

    // For dynamic providers, sync models first
    if (activeProvider.modelSource === 'dynamic') {
      try {
        await this.syncProviderModels(activeProvider.id);
      } catch (error) {
        logger.models.error('Failed to sync models for getAllProviderModels', {
          providerId: activeProvider.id,
          error: error instanceof Error ? error.message : error
        });
      }
    }

    return activeProvider.models.filter(m => m.isAvailable);
  }

  // Toggle model selection
  async toggleModelSelection(providerId: string, modelId: string, selected: boolean): Promise<void> {
    const provider = this.providers.find(p => p.id === providerId);
    if (!provider) throw new Error('Provider not found');

    const model = provider.models.find(m => m.id === modelId);
    if (!model) throw new Error('Model not found');

    model.isSelected = selected;

    // Update selectedModelIds for dynamic providers
    if (provider.modelSource === 'dynamic') {
      provider.selectedModelIds = provider.models.filter(m => m.isSelected).map(m => m.id);
    }

    await this.saveProviders();
  }

  // Set multiple model selections
  async setModelSelections(providerId: string, selections: { [modelId: string]: boolean }): Promise<void> {
    const provider = this.providers.find(p => p.id === providerId);
    if (!provider) throw new Error('Provider not found');

    Object.entries(selections).forEach(([modelId, selected]) => {
      const model = provider.models.find(m => m.id === modelId);
      if (model) {
        model.isSelected = selected;
      }
    });

    // Update selectedModelIds for dynamic providers
    if (provider.modelSource === 'dynamic') {
      provider.selectedModelIds = provider.models.filter(m => m.isSelected).map(m => m.id);
    }

    await this.saveProviders();
  }

  // Set active provider
  async setActiveProvider(providerId: string): Promise<void> {
    const provider = this.providers.find(p => p.id === providerId);
    if (!provider) throw new Error('Provider not found');

    // Update active state
    this.providers.forEach(p => p.isActive = p.id === providerId);
    this.activeProviderId = providerId;

    await this.saveProviders();
  }

  // Get user-defined models
  async getUserDefinedModels(providerId: string): Promise<Model[]> {
    const provider = this.providers.find(p => p.id === providerId);
    return provider?.models.filter(m => m.userDefined) || [];
  }

  // Sync provider models
  async syncProviderModels(providerId: string): Promise<Model[]> {
    const provider = this.providers.find(p => p.id === providerId);
    if (!provider) throw new Error('Provider not found');

    let models: Model[] = [];

    try {
      switch (provider.type) {
        case 'openrouter':
          models = await fetchOpenRouterModels(provider.apiKey);
          break;
        case 'vercel-gateway':
          if (provider.apiKey && provider.baseUrl) {
            models = await fetchGatewayModels(provider.apiKey, provider.baseUrl);
          }
          break;
        case 'local':
          if (provider.baseUrl) {
            models = await discoverLocalModels(provider.baseUrl);
          }
          break;
        case 'openai':
          if (provider.apiKey) {
            models = await fetchOpenAIModels(provider.apiKey);
          }
          break;
        case 'google':
          if (provider.apiKey) {
            models = await fetchGoogleModels(provider.apiKey);
          }
          break;
        case 'anthropic':
          if (provider.apiKey) {
            models = await fetchAnthropicModels(provider.apiKey);
          }
          break;
        case 'groq':
          if (provider.apiKey) {
            models = await fetchGroqModels(provider.apiKey);
          }
          break;
        case 'xai':
          if (provider.apiKey) {
            models = await fetchXAIModels(provider.apiKey);
          }
          break;
      }

      // Restore selections from saved IDs or existing models
      const selectedIds = new Set(provider.selectedModelIds || []);

      // If we have saved selections, use those
      if (provider.selectedModelIds && provider.selectedModelIds.length > 0) {
        models.forEach(model => {
          model.isSelected = selectedIds.has(model.id);
        });
      } else {
        // No saved selections - preserve existing in-memory selections or default to false
        const existingSelections: { [modelId: string]: boolean } = {};
        provider.models.forEach(m => {
          if (m.isSelected !== undefined) {
            existingSelections[m.id] = m.isSelected;
          }
        });

        models.forEach(model => {
          // Default to false for new models to avoid selecting hundreds automatically
          model.isSelected = existingSelections[model.id] ?? false;
        });
      }

      // Update provider models and sync selected IDs
      provider.models = models;
      provider.selectedModelIds = models.filter(m => m.isSelected).map(m => m.id);
      provider.lastModelSync = Date.now();
      await this.saveProviders();

      return models;
    } catch (error) {
      logger.models.error('Failed to sync models for provider', {
        providerId,
        providerType: provider.type,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  // Save providers to storage
  private async saveProviders(): Promise<void> {
    try {
      // For dynamic providers, only save selected model IDs instead of full model data
      const providersToSave = this.providers.map(provider => {
        if (provider.modelSource === 'dynamic') {
          // Extract selected model IDs
          const selectedModelIds = provider.models
            .filter(m => m.isSelected === true)
            .map(m => m.id);

          return {
            ...provider,
            selectedModelIds,
            models: [], // Don't save full model list for dynamic providers
          };
        }
        // For user-defined providers (cloud), save full model data
        return provider;
      });

      const providersResult = await window.levante.preferences.set('providers', providersToSave);
      const activeProviderResult = await window.levante.preferences.set('activeProvider', this.activeProviderId);

      if (!providersResult.success) {
        throw new Error(providersResult.error || 'Failed to save providers');
      }
      if (!activeProviderResult.success) {
        throw new Error(activeProviderResult.error || 'Failed to save active provider');
      }

      logger.models.debug('Providers saved', {
        dynamicProviders: providersToSave.filter(p => p.modelSource === 'dynamic').map(p => ({
          id: p.id,
          selectedCount: p.selectedModelIds?.length || 0,
        })),
      });
    } catch (error) {
      logger.models.error('Failed to save providers to preferences', {
        providersCount: this.providers.length,
        activeProviderId: this.activeProviderId,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  // Get all providers
  getProviders(): ProviderConfig[] {
    return this.providers;
  }

  // Update provider configuration
  async updateProvider(providerId: string, updates: Partial<ProviderConfig>): Promise<void> {
    const providerIndex = this.providers.findIndex(p => p.id === providerId);
    if (providerIndex === -1) throw new Error('Provider not found');

    this.providers[providerIndex] = { ...this.providers[providerIndex], ...updates };
    await this.saveProviders();
  }
}

export const modelService = new ModelServiceImpl();
