import type { Model, ProviderConfig } from '../../types/models';
import { getRendererLogger } from '@/services/logger';

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

      // Set default providers if none exist
      if (this.providers.length === 0) {
        await this.initializeDefaultProviders();
      }

      this.isInitialized = true;
    } catch (error) {
      logger.models.error('Failed to initialize ModelService', { error: error instanceof Error ? error.message : error });
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
        id: 'cloud',
        name: 'Cloud Providers',
        type: 'cloud',
        models: [
          // Default static models (will be replaced with user-defined)
          {
            id: 'openai/gpt-4o',
            name: 'GPT-4o',
            provider: 'cloud',
            contextLength: 128000,
            pricing: { input: 5, output: 15 },
            capabilities: ['text', 'vision'],
            isAvailable: true,
            userDefined: true,
            isSelected: true
          },
          {
            id: 'openai/gpt-4o-mini',
            name: 'GPT-4o Mini',
            provider: 'cloud',
            contextLength: 128000,
            pricing: { input: 0.15, output: 0.6 },
            capabilities: ['text', 'vision'],
            isAvailable: true,
            userDefined: true,
            isSelected: true
          },
          {
            id: 'anthropic/claude-3-5-sonnet-20241022',
            name: 'Claude 3.5 Sonnet',
            provider: 'cloud',
            contextLength: 200000,
            pricing: { input: 3, output: 15 },
            capabilities: ['text', 'vision'],
            isAvailable: true,
            userDefined: true,
            isSelected: true
          }
        ],
        isActive: true, // Default active provider
        settings: {},
        modelSource: 'user-defined'
      }
    ];

    this.providers = defaultProviders;
    this.activeProviderId = 'cloud';
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
        logger.models.error('Failed to sync models for getAvailableModels', { providerId: activeProvider.id, error: error instanceof Error ? error.message : error });
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
        logger.models.error('Failed to sync models for getAllProviderModels', { providerId: activeProvider.id, error: error instanceof Error ? error.message : error });
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

  // OpenRouter model fetching
  async fetchOpenRouterModels(apiKey?: string): Promise<Model[]> {
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
        capabilities: this.parseOpenRouterCapabilities(model),
        isAvailable: true,
        userDefined: false
      }));
    } catch (error) {
      logger.models.error('Failed to fetch OpenRouter models', { hasApiKey: !!apiKey, error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  // Vercel AI Gateway model fetching
  async fetchGatewayModels(apiKey: string, baseUrl: string = 'https://ai-gateway.vercel.sh/v1'): Promise<Model[]> {
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
        name: this.formatModelName(model.id),
        provider: 'vercel-gateway',
        contextLength: this.getModelContextLength(model.id),
        capabilities: ['text'], // Most gateway models support text
        isAvailable: true,
        userDefined: false,
        pricing: this.getModelPricing(model.id)
      }));
    } catch (error) {
      logger.models.error('Failed to fetch Gateway models', { baseUrl, error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  // Helper to parse OpenRouter model capabilities
  private parseOpenRouterCapabilities(model: any): string[] {
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

  // Helper to format model names from IDs
  private formatModelName(modelId: string): string {
    const parts = modelId.split('/');
    if (parts.length >= 2) {
      const provider = parts[0];
      const model = parts[1];
      return `${this.capitalizeFirst(provider)} ${model.toUpperCase().replace(/-/g, ' ')}`;
    }
    return modelId;
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Helper to get context length based on model ID patterns
  private getModelContextLength(modelId: string): number {
    if (modelId.includes('claude')) {
      if (modelId.includes('sonnet') || modelId.includes('opus')) return 200000;
      if (modelId.includes('haiku')) return 100000;
    }
    if (modelId.includes('gpt-4')) return 128000;
    if (modelId.includes('gpt-3.5')) return 16000;
    if (modelId.includes('gemini')) return 32000;
    return 4000; // Default fallback
  }

  // Helper to get pricing estimates based on model patterns
  private getModelPricing(modelId: string): { input: number; output: number } | undefined {
    if (modelId.includes('gpt-4o-mini')) return { input: 0.15, output: 0.6 };
    if (modelId.includes('gpt-4o')) return { input: 5, output: 15 };
    if (modelId.includes('claude-3-5-sonnet')) return { input: 3, output: 15 };
    if (modelId.includes('claude-3-haiku')) return { input: 0.25, output: 1.25 };
    return undefined; // No pricing info available
  }

  // Local model discovery
  async discoverLocalModels(endpoint: string): Promise<Model[]> {
    try {
      const result = await window.levante.models.fetchLocal(endpoint);
      
      if (!result.success) {
        logger.models.warn('Failed to discover local models', { endpoint, error: result.error });
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
      logger.models.error('Failed to discover local models', { endpoint, error: error instanceof Error ? error.message : error });
      return [];
    }
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
          // OpenRouter allows public access to model list, but API key improves rate limits
          models = await this.fetchOpenRouterModels(provider.apiKey);
          break;
        case 'vercel-gateway':
          if (provider.apiKey && provider.baseUrl) {
            models = await this.fetchGatewayModels(provider.apiKey, provider.baseUrl);
          }
          break;
        case 'local':
          if (provider.baseUrl) {
            models = await this.discoverLocalModels(provider.baseUrl);
          }
          break;
        case 'cloud':
          models = await this.getUserDefinedModels(providerId);
          break;
      }

      // Preserve existing selections when updating models
      const existingSelections: { [modelId: string]: boolean } = {};
      provider.models.forEach(m => {
        if (m.isSelected !== undefined) {
          existingSelections[m.id] = m.isSelected;
        }
      });

      // Apply selections to new models (default to true for new models)
      models.forEach(model => {
        model.isSelected = existingSelections[model.id] ?? true;
      });

      // Update provider models
      provider.models = models;
      provider.lastModelSync = Date.now();
      await this.saveProviders();

      return models;
    } catch (error) {
      logger.models.error('Failed to sync models for provider', { providerId, providerType: provider.type, error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  // Save providers to storage
  private async saveProviders(): Promise<void> {
    try {
      const providersResult = await window.levante.preferences.set('providers', this.providers);
      const activeProviderResult = await window.levante.preferences.set('activeProvider', this.activeProviderId);
      
      if (!providersResult.success) {
        throw new Error(providersResult.error || 'Failed to save providers');
      }
      if (!activeProviderResult.success) {
        throw new Error(activeProviderResult.error || 'Failed to save active provider');
      }
    } catch (error) {
      logger.models.error('Failed to save providers to preferences', { providersCount: this.providers.length, activeProviderId: this.activeProviderId, error: error instanceof Error ? error.message : error });
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