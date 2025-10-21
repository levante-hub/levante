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

      // Migrate old 'cloud' provider to new cloud providers
      const migrated = await this.migrateCloudProvider();
      if (migrated) {
        logger.models.info('Migrated old cloud provider to new cloud providers');
      }

      // Migrate cloud providers from user-defined to dynamic
      const dynamicMigrated = await this.migrateCloudProvidersToDynamic();
      if (dynamicMigrated) {
        logger.models.info('Migrated cloud providers to dynamic model source');
      }

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

  /**
   * Migrate old 'cloud' provider to new individual cloud providers
   */
  private async migrateCloudProvider(): Promise<boolean> {
    const oldCloudProvider = this.providers.find(p => p.type === 'cloud' as any);

    if (!oldCloudProvider) {
      return false; // Nothing to migrate
    }

    logger.models.info('Found old cloud provider, starting migration');

    // Remove old cloud provider
    this.providers = this.providers.filter(p => p.type !== 'cloud' as any);

    // Get default cloud providers
    const defaultProviders = await this.getDefaultCloudProviders();

    // If old cloud provider was active, set openai as active
    const wasActive = oldCloudProvider.isActive;
    if (wasActive && this.activeProviderId === 'cloud') {
      this.activeProviderId = 'openai';
    }

    // Add new cloud providers if they don't exist
    for (const newProvider of defaultProviders) {
      const exists = this.providers.find(p => p.id === newProvider.id);
      if (!exists) {
        newProvider.isActive = wasActive && newProvider.id === 'openai';
        this.providers.push(newProvider);
      }
    }

    // Save migrated providers
    await this.saveProviders();

    return true;
  }

  /**
   * Migrate cloud providers from user-defined to dynamic model source
   */
  private async migrateCloudProvidersToDynamic(): Promise<boolean> {
    const cloudProviderTypes: Array<'openai' | 'anthropic' | 'google' | 'groq' | 'xai'> =
      ['openai', 'anthropic', 'google', 'groq', 'xai'];

    let migrated = false;

    for (const provider of this.providers) {
      // Check if this is a cloud provider with user-defined model source
      if (cloudProviderTypes.includes(provider.type as any) && provider.modelSource === 'user-defined') {
        logger.models.info(`Migrating ${provider.id} to dynamic model source`);

        // Update to dynamic
        provider.modelSource = 'dynamic';

        // Clear old models (they will be synced from API)
        provider.models = [];
        provider.selectedModelIds = [];

        migrated = true;
      }
    }

    if (migrated) {
      await this.saveProviders();
    }

    return migrated;
  }

  private async getDefaultCloudProviders(): Promise<ProviderConfig[]> {
    return [
      {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        models: [],
        isActive: true,
        settings: {},
        modelSource: 'dynamic',
        baseUrl: 'https://api.openai.com/v1'
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
      // Cloud Providers (individual)
      {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        models: [
          {
            id: 'gpt-4o',
            name: 'GPT-4o',
            provider: 'openai',
            contextLength: 128000,
            pricing: { input: 2.5, output: 10 },
            capabilities: ['text', 'vision', 'tools'],
            isAvailable: true,
            userDefined: true,
            isSelected: true
          },
          {
            id: 'gpt-4o-mini',
            name: 'GPT-4o Mini',
            provider: 'openai',
            contextLength: 128000,
            pricing: { input: 0.15, output: 0.6 },
            capabilities: ['text', 'vision', 'tools'],
            isAvailable: true,
            userDefined: true,
            isSelected: true
          },
          {
            id: 'gpt-4-turbo',
            name: 'GPT-4 Turbo',
            provider: 'openai',
            contextLength: 128000,
            pricing: { input: 10, output: 30 },
            capabilities: ['text', 'vision', 'tools'],
            isAvailable: true,
            userDefined: true
          }
        ],
        isActive: true,
        settings: {},
        modelSource: 'user-defined'
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
        pricing: this.getModelPricing(model) // Gateway doesn't provide pricing in API
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
    // Return the model ID as-is from the API
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

  // Helper to get pricing from OpenRouter API response
  private getModelPricing(model: any): { input: number; output: number } | undefined {
    // Only OpenRouter provides pricing in their API response
    if (model.pricing) {
      const prompt = parseFloat(model.pricing.prompt);
      const completion = parseFloat(model.pricing.completion);

      // Convert from per-token to per-million tokens
      if (!isNaN(prompt) && !isNaN(completion)) {
        return {
          input: prompt * 1000000,
          output: completion * 1000000
        };
      }
    }
    return undefined;
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

  // OpenAI model fetching
  async fetchOpenAIModels(apiKey: string): Promise<Model[]> {
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
          name: this.formatOpenAIModelName(model.id),
          provider: 'openai',
          contextLength: this.getOpenAIContextLength(model.id),
          capabilities: this.getOpenAICapabilities(model.id),
          isAvailable: true,
          userDefined: false,
          pricing: this.getOpenAIPricing(model.id)
        }));
    } catch (error) {
      logger.models.error('Failed to fetch OpenAI models', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  // Google AI model fetching
  async fetchGoogleModels(apiKey: string): Promise<Model[]> {
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
            name: this.formatGoogleModelName(modelId),
            provider: 'google',
            contextLength: this.getGoogleContextLength(modelId),
            capabilities: this.getGoogleCapabilities(model),
            isAvailable: true,
            userDefined: false,
            pricing: this.getGooglePricing(modelId)
          };
        });
    } catch (error) {
      logger.models.error('Failed to fetch Google models', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  // Get user-defined models
  async getUserDefinedModels(providerId: string): Promise<Model[]> {
    const provider = this.providers.find(p => p.id === providerId);
    return provider?.models.filter(m => m.userDefined) || [];
  }

  // Helper methods for OpenAI
  private formatOpenAIModelName(modelId: string): string {
    // Return the model ID as-is from the API
    return modelId;
  }

  private getOpenAIContextLength(modelId: string): number {
    if (modelId.includes('gpt-4')) return 128000;
    if (modelId.includes('gpt-3.5-turbo-16k')) return 16000;
    if (modelId.includes('gpt-3.5')) return 4000;
    return 4000;
  }

  private getOpenAICapabilities(modelId: string): string[] {
    const caps = ['text', 'tools'];
    if (modelId.includes('gpt-4') && !modelId.includes('0314') && !modelId.includes('0613')) {
      caps.push('vision');
    }
    return caps;
  }

  private getOpenAIPricing(modelId: string): { input: number; output: number } | undefined {
    // OpenAI API doesn't provide pricing information in the models endpoint
    // Pricing should be checked on their website or through usage reports
    return undefined;
  }

  // Helper methods for Google
  private formatGoogleModelName(modelId: string): string {
    // Return the model ID as-is from the API
    return modelId;
  }

  private getGoogleContextLength(modelId: string): number {
    if (modelId.includes('gemini-2')) return 1000000;
    if (modelId.includes('gemini-1.5-pro')) return 2000000;
    if (modelId.includes('gemini-1.5')) return 1000000;
    return 32000;
  }

  private getGoogleCapabilities(model: any): string[] {
    const caps = ['text', 'tools'];
    if (model.supportedGenerationMethods?.includes('generateContent')) {
      caps.push('vision');
    }
    return caps;
  }

  private getGooglePricing(modelId: string): { input: number; output: number } | undefined {
    // Google API doesn't provide pricing information in the models endpoint
    // Pricing should be checked on their website
    return undefined;
  }

  // Anthropic model fetching
  async fetchAnthropicModels(apiKey: string): Promise<Model[]> {
    try {
      const result = await window.levante.models.fetchAnthropic(apiKey);

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch Anthropic models');
      }

      const data = result.data || [];

      return data.map((model: any): Model => ({
        id: model.id,
        name: model.display_name || model.id,
        provider: 'anthropic',
        contextLength: this.getAnthropicContextLength(model.id),
        capabilities: ['text', 'vision', 'tools'],
        isAvailable: true,
        userDefined: false,
        pricing: this.getAnthropicPricing(model.id)
      }));
    } catch (error) {
      logger.models.error('Failed to fetch Anthropic models', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  // Groq model fetching
  async fetchGroqModels(apiKey: string): Promise<Model[]> {
    try {
      const result = await window.levante.models.fetchGroq(apiKey);

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch Groq models');
      }

      const data = result.data || [];

      return data.map((model: any): Model => ({
        id: model.id,
        name: this.formatGroqModelName(model.id),
        provider: 'groq',
        contextLength: this.getGroqContextLength(model.id),
        capabilities: ['text', 'tools'],
        isAvailable: true,
        userDefined: false,
        pricing: this.getGroqPricing(model.id)
      }));
    } catch (error) {
      logger.models.error('Failed to fetch Groq models', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  // xAI model fetching
  async fetchXAIModels(apiKey: string): Promise<Model[]> {
    try {
      const result = await window.levante.models.fetchXAI(apiKey);

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch xAI models');
      }

      const data = result.data || [];

      return data.map((model: any): Model => ({
        id: model.id,
        name: this.formatXAIModelName(model.id),
        provider: 'xai',
        contextLength: this.getXAIContextLength(model.id),
        capabilities: this.getXAICapabilities(model.id),
        isAvailable: true,
        userDefined: false,
        pricing: this.getXAIPricing(model.id)
      }));
    } catch (error) {
      logger.models.error('Failed to fetch xAI models', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  // Helper methods for Anthropic
  private getAnthropicContextLength(modelId: string): number {
    if (modelId.includes('claude')) return 200000;
    return 200000;
  }

  private getAnthropicPricing(modelId: string): { input: number; output: number } | undefined {
    // Anthropic API doesn't provide pricing information in the models endpoint
    // Pricing should be checked on their website
    return undefined;
  }

  // Helper methods for Groq
  private formatGroqModelName(modelId: string): string {
    // Return the model ID as-is from the API
    return modelId;
  }

  private getGroqContextLength(modelId: string): number {
    if (modelId.includes('llama-3.3-70b')) return 128000;
    if (modelId.includes('llama-3.1')) return 128000;
    if (modelId.includes('mixtral-8x7b')) return 32768;
    return 8192;
  }

  private getGroqPricing(modelId: string): { input: number; output: number } | undefined {
    // Groq API doesn't provide pricing information in the models endpoint
    // Pricing should be checked on their website
    return undefined;
  }

  // Helper methods for xAI
  private formatXAIModelName(modelId: string): string {
    // Return the model ID as-is from the API
    return modelId;
  }

  private getXAIContextLength(modelId: string): number {
    if (modelId.includes('grok-beta')) return 131072;
    if (modelId.includes('grok-vision')) return 8192;
    return 131072;
  }

  private getXAICapabilities(modelId: string): string[] {
    const caps = ['text', 'tools'];
    if (modelId.includes('vision')) {
      caps.push('vision');
    }
    return caps;
  }

  private getXAIPricing(modelId: string): { input: number; output: number } | undefined {
    // xAI API doesn't provide pricing information in the models endpoint
    // Pricing should be checked on their website
    return undefined;
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
        case 'openai':
          if (provider.apiKey) {
            models = await this.fetchOpenAIModels(provider.apiKey);
          }
          break;
        case 'google':
          if (provider.apiKey) {
            models = await this.fetchGoogleModels(provider.apiKey);
          }
          break;
        case 'anthropic':
          if (provider.apiKey) {
            models = await this.fetchAnthropicModels(provider.apiKey);
          }
          break;
        case 'groq':
          if (provider.apiKey) {
            models = await this.fetchGroqModels(provider.apiKey);
          }
          break;
        case 'xai':
          if (provider.apiKey) {
            models = await this.fetchXAIModels(provider.apiKey);
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
      logger.models.error('Failed to sync models for provider', { providerId, providerType: provider.type, error: error instanceof Error ? error.message : error });
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
            selectedModelIds, // Save IDs
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