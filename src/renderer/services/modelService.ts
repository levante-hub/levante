import type { Model, ProviderConfig, GroupedModelsByProvider, ProviderWithModels } from '../../types/models';
import type { ModelCategory, SessionType } from '../../types/modelCategories';
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
import { fetchHuggingFaceModels } from './model/providers/huggingfaceProvider';
import { classifyModel, getCompatibleCategories, type ModelClassification } from '../../utils/modelClassification';
import { resolveFirstSyncSelectedIds } from './model/topModels';

const logger = getRendererLogger();

class ModelServiceImpl {
  private providers: ProviderConfig[] = [];
  private activeProviderId: string | null = null;
  private isInitialized = false;

  // Classification cache for O(1) lookups
  private classificationCache = new Map<string, ModelClassification>();

  // Track which providers have been synced in this session
  // This prevents losing models from inactive providers when saving
  private syncedProvidersInSession = new Set<string>();

  private initializationPromise: Promise<void> | null = null;
  private syncPromises = new Map<string, Promise<Model[]>>();
  private saveProvidersQueue: Promise<void> = Promise.resolve();

  // Initialize with default providers and load from storage
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize()
      .finally(() => {
        this.initializationPromise = null;
      });

    return this.initializationPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      const providersResult = await window.levante.preferences.get('providers');
      const activeProviderResult = await window.levante.preferences.get('activeProvider');

      this.providers = (providersResult.success && providersResult.data) ? providersResult.data : [];
      this.activeProviderId = (activeProviderResult.success && activeProviderResult.data) ? activeProviderResult.data : null;

      // Rehydrate isSelected from selectedModelIds as early as possible.
      // Important: an empty array is a valid persisted state.
      this.providers.forEach(provider => {
        if (provider.modelSource !== 'dynamic') {
          return;
        }

        if (!Array.isArray(provider.selectedModelIds)) {
          return;
        }

        const selectedIds = new Set(provider.selectedModelIds);

        provider.models.forEach(model => {
          if (model.isSelected === undefined) {
            model.isSelected = selectedIds.has(model.id);
          }
        });
      });

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
      } else {
        // Add any new providers that don't exist yet (for existing users)
        await this.addMissingProviders();
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
      },
      {
        id: 'huggingface',
        name: 'Hugging Face',
        type: 'huggingface',
        models: [],
        isActive: false,
        settings: {},
        modelSource: 'dynamic',
        baseUrl: 'https://router.huggingface.co/v1'
      }
    ];

    this.providers = defaultProviders;
    this.activeProviderId = 'openai';
    await this.saveProviders();
  }

  // Get default providers list (used for initialization and migration)
  private getDefaultProviders(): ProviderConfig[] {
    return [
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
      },
      {
        id: 'huggingface',
        name: 'Hugging Face',
        type: 'huggingface',
        models: [],
        isActive: false,
        settings: {},
        modelSource: 'dynamic',
        baseUrl: 'https://router.huggingface.co/v1'
      }
    ];
  }

  // Add any new providers that exist in defaults but not in user's saved providers
  private async addMissingProviders(): Promise<void> {
    const defaultProviders = this.getDefaultProviders();
    const existingIds = new Set(this.providers.map(p => p.id));

    const missingProviders = defaultProviders.filter(p => !existingIds.has(p.id));

    if (missingProviders.length > 0) {
      logger.models.info('Adding missing providers', {
        providers: missingProviders.map(p => p.id)
      });

      // Add missing providers after OpenRouter (position 1)
      const openrouterIndex = this.providers.findIndex(p => p.id === 'openrouter');
      const insertIndex = openrouterIndex >= 0 ? openrouterIndex + 1 : 0;

      this.providers.splice(insertIndex, 0, ...missingProviders);
      await this.saveProviders();
    }
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

  // Get all providers with their selected models (for multi-provider selector)
  async getAllProvidersWithSelectedModels(): Promise<GroupedModelsByProvider> {
    const groupedResult: GroupedModelsByProvider = {
      providers: [],
      totalModelCount: 0
    };

    // 1. Refresh dynamic providers if needed (smart sync)
    // We don't want to block UI, so we trust cache but trigger background sync if very old
    // Only sync providers that have API keys configured to avoid empty results
    const now = Date.now();
    this.providers.forEach(provider => {
      // Skip providers without API key (except openrouter which works without key, and anthropic OAuth)
      const hasCredentials =
        provider.type === 'openrouter' ||
        !!provider.apiKey ||
        ((provider.type === 'anthropic' || provider.type === 'openai') && provider.authMode === 'oauth');

      if (provider.modelSource === 'dynamic' &&
        hasCredentials &&
        (!provider.lastModelSync || (now - provider.lastModelSync > 1000 * 60 * 5))) {
        // Trigger sync but don't await it to keep UI snappy
        // If it's critical, the user can refresh or we can await
        this.syncProviderModels(provider.id).catch(err => {
          logger.models.warn(`Background sync failed for ${provider.name}`, err);
        });
      }
    });

    // 2. Iterate through all providers
    for (const provider of this.providers) {
      if (!provider.models) continue;

      let selectedModels: Model[] = [];

      // Filter available and selected models
      if (provider.modelSource === 'dynamic') {
        const selectedIds = new Set(provider.selectedModelIds || []);
        // Also check isSelected flag as fallback/redundancy
        selectedModels = provider.models.filter(m =>
          m.isAvailable &&
          (selectedIds.has(m.id) || m.isSelected)
        );
      } else {
        // User defined providers
        selectedModels = provider.models.filter(m =>
          m.isAvailable &&
          m.isSelected !== false // Default to true if undefined
        );
      }

      if (selectedModels.length > 0) {
        groupedResult.providers.push({
          provider,
          models: selectedModels,
          modelCount: selectedModels.length
        });
        groupedResult.totalModelCount += selectedModels.length;
      }
    }

    // 3. Sort providers: Active first, then alphabetically
    groupedResult.providers.sort((a, b) => {
      if (a.provider.id === this.activeProviderId) return -1;
      if (b.provider.id === this.activeProviderId) return 1;
      return a.provider.name.localeCompare(b.provider.name);
    });

    return groupedResult;
  }

  // Find which provider owns a model
  async getProviderForModel(modelId: string): Promise<string | null> {
    for (const provider of this.providers) {
      // Check if model exists in provider
      const model = provider.models.find(m => m.id === modelId);
      if (model) {
        return provider.id;
      }
    }
    return null;
  }

  // Toggle model selection
  async toggleModelSelection(providerId: string, modelId: string, selected: boolean): Promise<void> {
    const provider = this.providers.find(p => p.id === providerId);
    if (!provider) throw new Error('Provider not found');

    const model = provider.models.find(m => m.id === modelId);
    if (!model) throw new Error('Model not found');

    model.isSelected = selected;

    // Update selectedModelIds for dynamic providers
    // Use Set operations to preserve existing IDs not in current models list
    if (provider.modelSource === 'dynamic') {
      const currentModelIds = new Set(provider.models.map(m => m.id));
      const existingSelectedIds = (provider.selectedModelIds || []).filter(id => !currentModelIds.has(id));
      const newSelectedIds = provider.models.filter(m => m.isSelected).map(m => m.id);
      provider.selectedModelIds = [...existingSelectedIds, ...newSelectedIds];
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
    // Use Set operations to preserve existing IDs not in current models list
    if (provider.modelSource === 'dynamic') {
      const currentModelIds = new Set(provider.models.map(m => m.id));
      const existingSelectedIds = (provider.selectedModelIds || []).filter(id => !currentModelIds.has(id));
      const newSelectedIds = provider.models.filter(m => m.isSelected).map(m => m.id);
      provider.selectedModelIds = [...existingSelectedIds, ...newSelectedIds];
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

  // Add user-defined model
  async addUserModel(providerId: string, model: Omit<Model, 'isAvailable' | 'isSelected'>): Promise<void> {
    const provider = this.providers.find(p => p.id === providerId);
    if (!provider) throw new Error('Provider not found');

    const newModel: Model = {
      ...model,
      isAvailable: true,
      isSelected: true,
      userDefined: true,
    };

    provider.models.push(newModel);

    // Update selectedModelIds for dynamic providers
    // Use Set operations to preserve existing IDs not in current models list
    if (provider.modelSource === 'dynamic') {
      const currentModelIds = new Set(provider.models.map(m => m.id));
      const existingSelectedIds = (provider.selectedModelIds || []).filter(id => !currentModelIds.has(id));
      const newSelectedIds = provider.models.filter(m => m.isSelected).map(m => m.id);
      provider.selectedModelIds = [...existingSelectedIds, ...newSelectedIds];
    }

    await this.saveProviders();
  }

  // Remove user-defined model
  async removeUserModel(providerId: string, modelId: string): Promise<void> {
    const provider = this.providers.find(p => p.id === providerId);
    if (!provider) throw new Error('Provider not found');

    provider.models = provider.models.filter(m => m.id !== modelId || !m.userDefined);

    // Update selectedModelIds for dynamic providers
    // Also remove the model from selectedModelIds if it was there
    if (provider.modelSource === 'dynamic') {
      provider.selectedModelIds = (provider.selectedModelIds || []).filter(id => id !== modelId);
    }

    await this.saveProviders();
  }

  // Sync provider models
  async syncProviderModels(providerId: string): Promise<Model[]> {
    const existing = this.syncPromises.get(providerId);
    if (existing) {
      return existing;
    }

    const promise = this._doSyncProviderModels(providerId)
      .finally(() => {
        this.syncPromises.delete(providerId);
      });

    this.syncPromises.set(providerId, promise);
    return promise;
  }

  private async _doSyncProviderModels(providerId: string): Promise<Model[]> {
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
          if (provider.authMode === 'oauth') {
            models = await fetchOpenAIModels({
              authMode: 'oauth',
              organizationId: provider.organizationId,
            });
          } else if (provider.apiKey) {
            models = await fetchOpenAIModels({
              apiKey: provider.apiKey,
              authMode: 'api-key',
              organizationId: provider.organizationId,
            });
          }
          break;
        case 'google':
          if (provider.apiKey) {
            models = await fetchGoogleModels(provider.apiKey);
          }
          break;
        case 'anthropic':
          if (provider.authMode === 'oauth') {
            models = await fetchAnthropicModels({ authMode: 'oauth' });
          } else if (provider.apiKey) {
            models = await fetchAnthropicModels({ apiKey: provider.apiKey, authMode: 'api-key' });
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
        case 'huggingface':
          if (provider.apiKey) {
            models = await fetchHuggingFaceModels(provider.apiKey);
          }
          break;
      }

      // Classify and cache models (Phase 2: Model Classification)
      logger.models.debug('Classifying models', {
        providerId,
        modelCount: models.length
      });

      for (const model of models) {
        try {
          const classification = classifyModel(model);

          // Attach classification to model object
          model.category = classification.category;
          model.computedCapabilities = classification.capabilities;

          // Cache for O(1) lookup
          this.classificationCache.set(model.id, classification);

          // Debug classification results for local models
          if (provider.type === 'local') {
            logger.models.debug(`Local model classified: ${model.name}`, {
              category: model.category,
              capabilities: model.computedCapabilities
            });
          }

        } catch (error) {
          logger.models.warn('Failed to classify model, using defaults', {
            modelId: model.id,
            error: error instanceof Error ? error.message : error
          });
          // Fallback to 'chat' category if classification fails
          model.category = 'chat';
          model.computedCapabilities = {
            supportsTools: false,
            supportsVision: false,
            supportsStreaming: true,
            requiresAttachment: false,
            supportsAudioOut: false,
            supportsAudioIn: false,
            supportsSystemPrompt: true,
            supportsMultiTurn: true,
          };
        }
      }

      // Restore selections from saved IDs or existing models
      const hasPersistedSelectionState = Array.isArray(provider.selectedModelIds);
      const selectedIds = new Set(provider.selectedModelIds ?? []);

      if (hasPersistedSelectionState) {
        models.forEach(model => {
          model.isSelected = selectedIds.has(model.id);
        });
      } else {
        // No persisted selection state yet (first sync for this provider).
        // Preserve any existing in-memory selection state if it already exists.
        const existingSelections: Record<string, boolean> = {};
        provider.models.forEach(m => {
          if (m.isSelected !== undefined) {
            existingSelections[m.id] = m.isSelected;
          }
        });

        const hadExistingSelectionState = Object.keys(existingSelections).length > 0;
        const selectedIds = resolveFirstSyncSelectedIds(models, provider.type, existingSelections);

        models.forEach(model => {
          model.isSelected = selectedIds.has(model.id);
        });

        if (!hadExistingSelectionState && selectedIds.size > 0) {
          logger.models.info('Auto-selected top models for new provider', {
            providerId: provider.id,
            providerType: provider.type,
            count: selectedIds.size,
          });
        }
      }

      // Preserve user-defined models (inference models)
      const userDefinedModels = provider.models.filter(m => m.userDefined);

      // Classify user-defined models if they don't have classification yet
      for (const model of userDefinedModels) {
        if (!model.category || !model.computedCapabilities) {
          try {
            const classification = classifyModel(model);
            model.category = classification.category;
            model.computedCapabilities = classification.capabilities;
            this.classificationCache.set(model.id, classification);

            logger.models.debug('User-defined model classified', {
              modelId: model.id,
              category: classification.category
            });
          } catch (error) {
            logger.models.warn('Failed to classify user-defined model', {
              modelId: model.id,
              error: error instanceof Error ? error.message : error
            });
          }
        } else {
          // Already classified, just update cache
          this.classificationCache.set(model.id, {
            category: model.category,
            capabilities: model.computedCapabilities
          });
        }
      }

      // Update provider models: combine synced models with user-defined models
      provider.models = [...models, ...userDefinedModels];

      // Only update selectedModelIds if we actually got new models from sync
      // This prevents losing saved selections when sync fails or returns empty
      if (models.length > 0) {
        provider.selectedModelIds = provider.models.filter(m => m.isSelected).map(m => m.id);
        // Mark provider as synced in this session (only if we got actual models)
        this.syncedProvidersInSession.add(provider.id);
      }
      // If no new models but we have user-defined models, update to include their IDs
      else if (userDefinedModels.length > 0) {
        const userDefinedSelectedIds = userDefinedModels.filter(m => m.isSelected).map(m => m.id);
        // Preserve existing selectedModelIds and add user-defined
        provider.selectedModelIds = [
          ...(provider.selectedModelIds || []).filter(id => !userDefinedModels.some(m => m.id === id)),
          ...userDefinedSelectedIds
        ];
      }
      // If sync returned empty and no user-defined, preserve existing selectedModelIds
      // (don't clear them - they'll be restored when sync succeeds later)

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
    const saveTask = this.saveProvidersQueue.then(() => this._saveProviders());

    // Keep the queue alive even if one save fails.
    this.saveProvidersQueue = saveTask.catch(() => {});

    return saveTask;
  }

  private async _saveProviders(): Promise<void> {
    try {
      // For dynamic providers, save selected model IDs + minimal model data with classification
      // Only apply minimal save logic to providers that have been synced in this session
      const providersToSave = this.providers.map(provider => {
        if (provider.modelSource === 'dynamic') {
          // Only apply minimal save to providers synced in this session
          // This prevents losing models from inactive providers that haven't been synced
          if (this.syncedProvidersInSession.has(provider.id)) {
            // selectedModelIds is authoritative if the property exists, even if it is [].
            const selectedModelIds = Array.isArray(provider.selectedModelIds)
              ? provider.selectedModelIds
              : provider.models
                  .filter(m => m.isSelected === true)
                  .map(m => m.id);

            const selectedIdSet = new Set(selectedModelIds);

            // Save minimal model data for selected models (id + classification only)
            // This allows main process to access classification without full sync
            const selectedModelsMinimal = provider.models
              .filter(m => !m.userDefined && selectedIdSet.has(m.id))
              .map(m => ({
                id: m.id,
                name: m.name,
                provider: m.provider,
                category: m.category,
                computedCapabilities: m.computedCapabilities,
                taskType: m.taskType,
                userDefined: false,
                isAvailable: true,
                isSelected: true,
                contextLength: m.contextLength,
                capabilities: []
              }));

            // Also include user-defined models (full data)
            const userDefinedModels = provider.models.filter(m => m.userDefined);

            return {
              ...provider,
              selectedModelIds,
              models: [...selectedModelsMinimal, ...userDefinedModels],
            };
          }
          // For providers not synced in this session, preserve current state from storage
          // This prevents losing models from inactive providers
          return provider;
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
    const provider = this.providers.find(p => p.id === providerId);
    if (!provider) throw new Error('Provider not found');

    Object.assign(provider, updates);
    await this.saveProviders();
  }

  // ==========================================
  // Model Classification Methods (Phase 2)
  // ==========================================

  /**
   * Get classification for a model (O(1) cache lookup)
   * @param modelId - Model ID to lookup
   * @returns Classification or undefined if not found
   */
  getModelClassification(modelId: string): ModelClassification | undefined {
    return this.classificationCache.get(modelId);
  }

  /**
   * Get all models of a specific category from active provider
   * @param category - Model category to filter by
   * @returns Array of models matching the category
   */
  getModelsByCategory(category: ModelCategory): Model[] {
    const activeProvider = this.providers.find(p => p.id === this.activeProviderId);
    if (!activeProvider) return [];

    return activeProvider.models.filter(m =>
      m.isAvailable &&
      m.isSelected !== false &&
      m.category === category
    );
  }

  /**
   * Get all models compatible with a session type
   * @param sessionType - 'chat' or 'inference'
   * @returns Array of compatible models
   */
  getCompatibleModels(sessionType: SessionType): Model[] {
    const activeProvider = this.providers.find(p => p.id === this.activeProviderId);
    if (!activeProvider) return [];

    const compatibleCategories = getCompatibleCategories(sessionType);

    return activeProvider.models.filter(m =>
      m.isAvailable &&
      m.isSelected !== false &&
      m.category &&
      compatibleCategories.includes(m.category)
    );
  }

  /**
   * Get all models grouped by category
   * @returns Map of category to models array
   */
  getModelsGroupedByCategory(): Map<ModelCategory, Model[]> {
    const activeProvider = this.providers.find(p => p.id === this.activeProviderId);
    if (!activeProvider) return new Map();

    const grouped = new Map<ModelCategory, Model[]>();

    for (const model of activeProvider.models) {
      if (!model.isAvailable || model.isSelected === false) continue;

      const category = model.category || 'chat' as ModelCategory; // Default to 'chat' if not classified
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(model);
    }

    return grouped;
  }

  /**
   * Get category display name for UI
   * @param category - Model category
   * @returns Human-readable category name
   */
  getCategoryDisplayName(category: ModelCategory): string {
    const displayNames: Record<ModelCategory, string> = {
      'chat': 'Chat',
      'multimodal': 'Multimodal',
      'image': 'Image Generation',
      'audio': 'Audio',
      'specialized': 'Specialized'
    };
    return displayNames[category] || category;
  }
}

export const modelService = new ModelServiceImpl();
