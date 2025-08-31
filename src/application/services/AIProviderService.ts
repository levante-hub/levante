import { AIProviderPort, ProviderConfiguration, ConnectionResult, ModelSyncOptions, ModelSelectionOptions, ProviderStats, ModelAvailability, ProviderHealthStatus, ProviderConfigExport, ProviderConfigImport, ProviderNotFoundError, AuthenticationError, ModelSyncError } from '../../domain/ports/primary/AIProviderPort';
import { Provider } from '../../domain/entities/Provider';
import { Model, ModelCapability } from '../../domain/entities/Model';
import { ProviderId } from '../../domain/value-objects/ProviderId';
import { ProviderRepository } from '../../domain/ports/secondary/ProviderRepository';
import { ModelRepository } from '../../domain/ports/secondary/ModelRepository';
import { OpenRouterAdapter } from '../../domain/ports/secondary/OpenRouterAdapter';
import { VercelGatewayAdapter } from '../../domain/ports/secondary/VercelGatewayAdapter';
import { LocalProviderAdapter } from '../../domain/ports/secondary/LocalProviderAdapter';
import { CloudProviderAdapter } from '../../domain/ports/secondary/CloudProviderAdapter';

export class AIProviderService implements AIProviderPort {
  constructor(
    private readonly providerRepository: ProviderRepository,
    private readonly modelRepository: ModelRepository,
    private readonly openRouterAdapter: OpenRouterAdapter,
    private readonly vercelGatewayAdapter: VercelGatewayAdapter,
    private readonly localProviderAdapter: LocalProviderAdapter,
    private readonly cloudProviderAdapter: CloudProviderAdapter
  ) {}

  async configureProvider(config: ProviderConfiguration): Promise<Provider> {
    // Validate configuration
    this.validateProviderConfiguration(config);

    // Create provider entity
    const provider = Provider.create({
      type: config.type,
      name: config.name,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      organizationId: config.organizationId,
      projectId: config.projectId,
      customHeaders: config.customHeaders,
      timeout: config.timeout,
      retryAttempts: config.retryAttempts,
      rateLimitSettings: config.rateLimitSettings,
      metadata: config.metadata
    });

    // Test connection if API key provided
    if (config.apiKey) {
      const connectionResult = await this.testProviderConnection(provider.getId());
      if (!connectionResult.success) {
        throw new AuthenticationError(provider.getId(), connectionResult.error);
      }
    }

    // Save provider
    const saveResult = await this.providerRepository.save(provider);
    if (!saveResult.success) {
      throw new Error(`Failed to save provider: ${saveResult.error}`);
    }

    // Initialize with empty models (will be synced later)
    return saveResult.data!;
  }

  async removeProvider(providerId: string): Promise<boolean> {
    const providerResult = await this.providerRepository.findById(ProviderId.fromString(providerId));
    if (!providerResult.success || !providerResult.data) {
      throw new ProviderNotFoundError(providerId);
    }

    // Remove all models for this provider
    await this.modelRepository.deleteByProviderId(ProviderId.fromString(providerId));

    // Remove provider
    const deleteResult = await this.providerRepository.delete(ProviderId.fromString(providerId));
    return deleteResult.success;
  }

  async getAllProviders(): Promise<Provider[]> {
    const result = await this.providerRepository.findAll();
    return result.success ? (result.data || []) : [];
  }

  async getProvider(providerId: string): Promise<Provider> {
    const result = await this.providerRepository.findById(ProviderId.fromString(providerId));
    const provider = result.success ? result.data : null;
    if (!provider) {
      throw new ProviderNotFoundError(providerId);
    }
    return provider;
  }

  async setActiveProvider(providerId: string): Promise<void> {
    const provider = await this.getProvider(providerId);
    
    // Deactivate all providers
    const allProviders = await this.getAllProviders();
    for (const p of allProviders) {
      if (p.isActive() && p.getId() !== providerId) {
        p.setActive(false);
        const saveResult = await this.providerRepository.save(p);
        if (!saveResult.success) {
          console.warn('Failed to deactivate provider:', saveResult.error);
        }
      }
    }

    // Activate target provider
    provider.setActive(true);
    const saveResult = await this.providerRepository.save(provider);
    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Failed to activate provider');
    }
  }

  async getActiveProvider(): Promise<Provider | null> {
    const providers = await this.getAllProviders();
    return providers.find(p => p.isActive()) || null;
  }

  async syncProviderModels(providerId: string, options?: ModelSyncOptions): Promise<Model[]> {
    const provider = await this.getProvider(providerId);
    const adapter = this.getAdapterForProvider(provider);

    try {
      // Fetch models from provider
      const fetchedModels = await adapter.fetchModels(provider, {
        includeDisabled: options?.includeDisabled,
        filterByCapabilities: options?.filterByCapabilities,
        timeoutMs: options?.timeoutMs
      });

      // Get existing models for selection preservation
      const modelsResult = await this.modelRepository.findByProviderId(ProviderId.fromString(providerId));
      const existingModels = modelsResult.success && modelsResult.data ? modelsResult.data.items : [];
      const existingSelections = new Map(
        existingModels.map(m => [m.getId(), m.isSelected()])
      );

      // Create model entities with preserved selections
      const models = fetchedModels.map((modelData: any) => {
        const model = Model.create({
          ...modelData,
          providerId,
          selected: options?.preserveUserSelections !== false ? 
            existingSelections.get(modelData.id) ?? true : 
            modelData.selected ?? true
        });
        return model;
      });

      // Save models (replace existing ones)
      const deleteResult = await this.modelRepository.deleteByProviderId(providerId);
      if (!deleteResult.success) {
        console.warn('Failed to delete existing models:', deleteResult.error);
      }
      
      const savedModelsResult = await this.modelRepository.saveMany(models);
      const savedModels = savedModelsResult.success ? savedModelsResult.data || [] : [];

      // Update provider sync timestamp
      provider.updateLastSync();
      const providerSaveResult = await this.providerRepository.save(provider);
      if (!providerSaveResult.success) {
        console.warn('Failed to update provider sync timestamp:', providerSaveResult.error);
      }

      return savedModels;

    } catch (error) {
      throw new ModelSyncError(providerId, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async syncAllProviderModels(options?: ModelSyncOptions): Promise<Map<string, Model[]>> {
    const providers = await this.getAllProviders();
    const results = new Map<string, Model[]>();

    for (const provider of providers) {
      try {
        const models = await this.syncProviderModels(provider.getId(), options);
        results.set(provider.getId(), models);
      } catch (error) {
        console.error(`Failed to sync models for provider ${provider.getId()}:`, error);
        results.set(provider.getId(), []);
      }
    }

    return results;
  }

  async selectModels(providerId: string, modelIds: string[], options: ModelSelectionOptions): Promise<void> {
    const provider = await this.getProvider(providerId);
    const modelsResult = await this.modelRepository.findByIds(modelIds);
    const models = modelsResult.success && modelsResult.data ? modelsResult.data : [];

    for (const model of models) {
      if (model.getProviderId() !== providerId) {
        continue; // Skip models not belonging to this provider
      }
      
      model.setSelected(options.selected);
      await this.modelRepository.save(model);
    }
  }

  async selectAllModels(providerId: string, selected: boolean): Promise<void> {
    const provider = await this.getProvider(providerId);
    const modelsResult = await this.modelRepository.findByProviderId(ProviderId.fromString(providerId));
    const models = modelsResult.success && modelsResult.data ? modelsResult.data.items : [];

    for (const model of models) {
      model.setSelected(selected);
      await this.modelRepository.save(model);
    }
  }

  async getAvailableModels(options?: { selectedOnly?: boolean; capabilities?: string[] }): Promise<Model[]> {
    const modelsResult = await this.modelRepository.findAll();
    let models = modelsResult.success ? modelsResult.data || [] : [];

    // Filter by selection
    if (options?.selectedOnly) {
      models = models.filter(m => m.isSelected());
    }

    // Filter by capabilities
    if (options?.capabilities?.length) {
      models = models.filter(m => 
        options.capabilities!.every(cap => m.getCapabilities().hasCapability(cap as ModelCapability))
      );
    }

    return models;
  }

  async getProviderModels(providerId: string, options?: { selectedOnly?: boolean }): Promise<Model[]> {
    const provider = await this.getProvider(providerId);
    const modelsResult = await this.modelRepository.findByProviderId(ProviderId.fromString(providerId));
    let models = modelsResult.success && modelsResult.data ? modelsResult.data.items : [];

    if (options?.selectedOnly) {
      models = models.filter(m => m.isSelected());
    }

    return models;
  }

  async testProviderConnection(providerId: string, config?: any): Promise<ConnectionResult> {
    const provider = await this.getProvider(providerId);
    const adapter = this.getAdapterForProvider(provider);

    const startTime = Date.now();
    
    try {
      const result = await adapter.testConnection(provider, {
        skipAuthentication: config?.skipAuthentication,
        testModel: config?.testModel,
        testMessage: config?.testMessage || 'Hello, this is a test message.',
        timeoutMs: config?.timeoutMs
      });

      return {
        success: true,
        providerId,
        responseTime: Date.now() - startTime,
        availableModels: result.availableModels,
        metadata: result.metadata
      };

    } catch (error) {
      return {
        success: false,
        providerId,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async checkModelAvailability(modelIds: string[]): Promise<ModelAvailability[]> {
    const modelsResult = await this.modelRepository.findByIds(modelIds);
    const models = modelsResult.success ? modelsResult.data || [] : [];
    const results: ModelAvailability[] = [];

    for (const modelId of modelIds) {
      const model = models.find(m => m.getId() === modelId);
      
      if (!model) {
        results.push({
          modelId,
          available: false,
          reason: 'Model not found'
        });
        continue;
      }

      const providerResult = await this.providerRepository.findById(ProviderId.fromString(model.getProviderId()));
      const provider = providerResult.success ? providerResult.data : null;
      if (!provider) {
        results.push({
          modelId,
          available: false,
          reason: 'Provider not available or inactive'
        });
        continue;
      }

      // For real-time availability, we could ping the provider's API
      // For now, assume available if provider is active
      results.push({
        modelId,
        available: true
      });
    }

    return results;
  }

  async getProviderStats(providerId?: string): Promise<ProviderStats | ProviderStats[]> {
    if (providerId) {
      const provider = await this.getProvider(providerId);
      return this.calculateProviderStats(provider);
    } else {
      const providers = await this.getAllProviders();
      return Promise.all(providers.map(p => this.calculateProviderStats(p)));
    }
  }

  async resetProviderStats(providerId?: string): Promise<void> {
    if (providerId) {
      const provider = await this.getProvider(providerId);
      provider.resetStats();
      await this.providerRepository.save(provider);
    } else {
      const providers = await this.getAllProviders();
      for (const provider of providers) {
        provider.resetStats();
        await this.providerRepository.save(provider);
      }
    }
  }

  async toggleProvider(providerId: string, enabled: boolean): Promise<Provider> {
    const provider = await this.getProvider(providerId);
    provider.setActive(enabled);
    const saveResult = await this.providerRepository.save(provider);
    return saveResult.success && saveResult.data ? saveResult.data : provider;
  }

  async updateProviderConfig(providerId: string, updates: Partial<ProviderConfiguration>): Promise<Provider> {
    const provider = await this.getProvider(providerId);
    
    // Update provider with new configuration
    if (updates.name) provider.setName(updates.name);
    if (updates.apiKey) provider.setApiKey(updates.apiKey.toString());
    if (updates.baseUrl) provider.setBaseUrl(updates.baseUrl);
    if (updates.organizationId) provider.setOrganizationId(updates.organizationId);
    if (updates.projectId) provider.setProjectId(updates.projectId);
    if (updates.customHeaders) provider.setCustomHeaders(updates.customHeaders);
    if (updates.timeout) provider.setTimeout(updates.timeout);
    if (updates.retryAttempts) provider.setRetryAttempts(updates.retryAttempts);
    if (updates.rateLimitSettings) provider.setRateLimitSettings(updates.rateLimitSettings);
    if (updates.metadata) provider.setMetadata(updates.metadata);

    const saveResult = await this.providerRepository.save(provider);
    return saveResult.success && saveResult.data ? saveResult.data : provider;
  }

  async getProviderHealth(): Promise<ProviderHealthStatus[]> {
    const providers = await this.getAllProviders();
    const healthStatuses: ProviderHealthStatus[] = [];

    for (const provider of providers) {
      try {
        const connectionResult = await this.testProviderConnection(provider.getId());
        healthStatuses.push({
          providerId: provider.getId(),
          status: connectionResult.success ? 'healthy' : 'unavailable',
          responseTime: connectionResult.responseTime,
          lastChecked: new Date(),
          issues: connectionResult.success ? [] : [{
            severity: 'high',
            message: connectionResult.error || 'Connection failed',
            code: 'CONNECTION_ERROR',
            timestamp: new Date()
          }]
        });
      } catch (error) {
        healthStatuses.push({
          providerId: provider.getId(),
          status: 'unknown',
          lastChecked: new Date(),
          issues: [{
            severity: 'critical',
            message: error instanceof Error ? error.message : 'Unknown error',
            code: 'HEALTH_CHECK_ERROR',
            timestamp: new Date()
          }]
        });
      }
    }

    return healthStatuses;
  }

  async refreshProviderMetadata(providerId: string): Promise<Provider> {
    const provider = await this.getProvider(providerId);
    const adapter = this.getAdapterForProvider(provider);

    try {
      const metadata = await adapter.getProviderMetadata(provider);
      provider.setMetadata({ ...provider.getMetadata(), ...metadata });
      const saveResult = await this.providerRepository.save(provider);
      return saveResult.success && saveResult.data ? saveResult.data : provider;
    } catch (error) {
      console.error(`Failed to refresh metadata for provider ${providerId}:`, error);
      return provider;
    }
  }

  async exportProviderConfig(providerId?: string): Promise<ProviderConfigExport> {
    const providers = providerId ? 
      [await this.getProvider(providerId)] : 
      await this.getAllProviders();

    const exportData: ProviderConfigExport = {
      version: '1.0',
      exportedAt: new Date(),
      providers: providers.map(p => ({
        type: p.getType(),
        name: p.getName(),
        baseUrl: p.getBaseUrl(),
        organizationId: p.getOrganizationId(),
        projectId: p.getProjectId(),
        customHeaders: p.getCustomHeaders(),
        timeout: p.getTimeout(),
        retryAttempts: p.getRetryAttempts(),
        rateLimitSettings: p.getRateLimitSettings(),
        metadata: p.getMetadata()
        // Note: API keys are not exported for security
      })),
      models: []
    };

    // Add model selections
    for (const provider of providers) {
      const modelsResult = await this.modelRepository.findByProviderId(ProviderId.fromString(provider.getId()));
      const models = modelsResult.success && modelsResult.data ? modelsResult.data.items : [];
      exportData.models.push(
        ...models.map((m: Model) => ({
          providerId: provider.getId(),
          modelId: m.getId(),
          selected: m.isSelected()
        }))
      );
    }

    return exportData;
  }

  async importProviderConfig(data: ProviderConfigImport): Promise<Provider[]> {
    const importedProviders: Provider[] = [];

    for (const providerConfig of data.providers) {
      try {
        // Check if provider already exists
        const existingProviders = await this.getAllProviders();
        const existing = existingProviders.find(p => 
          p.getType().toString() === providerConfig.type.toString() && p.getName() === providerConfig.name
        );

        if (existing && data.mergeStrategy === 'skip_existing') {
          continue;
        }

        const provider = existing && data.mergeStrategy === 'merge' ?
          existing : 
          await this.configureProvider(providerConfig);

        importedProviders.push(provider);
      } catch (error) {
        console.error(`Failed to import provider ${providerConfig.name}:`, error);
      }
    }

    // Apply model selections if provided
    if (data.models) {
      for (const modelSelection of data.models) {
        try {
          await this.selectModels(
            modelSelection.providerId, 
            [modelSelection.modelId], 
            { selected: modelSelection.selected }
          );
        } catch (error) {
          console.error(`Failed to apply model selection:`, error);
        }
      }
    }

    return importedProviders;
  }

  private validateProviderConfiguration(config: ProviderConfiguration): void {
    if (!config.name?.trim()) {
      throw new Error('Provider name is required');
    }
    if (!config.type) {
      throw new Error('Provider type is required');
    }
  }

  private getAdapterForProvider(provider: Provider): any {
    switch (provider.getType().toString()) {
      case 'openrouter':
        return this.openRouterAdapter;
      case 'vercel-gateway':
        return this.vercelGatewayAdapter;
      case 'local':
        return this.localProviderAdapter;
      case 'cloud':
        return this.cloudProviderAdapter;
      default:
        throw new Error(`No adapter found for provider type: ${provider.getType().toString()}`);
    }
  }

  private async calculateProviderStats(provider: Provider): Promise<ProviderStats> {
    // This would typically get stats from the provider's usage tracking
    // For now, return default values
    return {
      providerId: provider.getId(),
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      totalTokensUsed: 0,
      totalCost: 0,
      rateLimitHits: 0,
      mostUsedModels: []
    };
  }
}