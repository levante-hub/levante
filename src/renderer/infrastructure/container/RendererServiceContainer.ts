import { ServiceContainer, ServiceContainerConfig } from '../../../application/container/ServiceContainer';

// IPC-based repository implementations
import { ElectronChatSessionAdapter } from '../adapters/ElectronChatSessionAdapter';
import { ElectronAIProviderAdapter } from '../adapters/ElectronAIProviderAdapter';
import { ElectronUserPreferencesAdapter } from '../adapters/ElectronUserPreferencesAdapter';

// Stub implementations for remaining adapters (to be implemented)
import { 
  MessageRepository,
  ProviderRepository,
  ModelRepository,
  SettingRepository,
  OpenRouterAdapter,
  VercelGatewayAdapter,
  LocalProviderAdapter,
  CloudProviderAdapter
} from '../../../domain/ports/secondary';

// Stub implementations that communicate via IPC
class IPCMessageRepository implements MessageRepository {
  async findById(id: any): Promise<any> {
    // Would communicate with Main Process via IPC
    throw new Error('IPCMessageRepository not implemented');
  }
  async findBySessionId(sessionId: string): Promise<any> {
    // Would communicate with Main Process via IPC  
    throw new Error('IPCMessageRepository not implemented');
  }
  async countBySessionId(sessionId: string): Promise<any> {
    throw new Error('IPCMessageRepository not implemented');
  }
  async deleteBySessionId(sessionId: string): Promise<any> {
    throw new Error('IPCMessageRepository not implemented');
  }
  async count(): Promise<any> {
    throw new Error('IPCMessageRepository not implemented');
  }
  async findAll(): Promise<any> {
    throw new Error('IPCMessageRepository not implemented');
  }
  async save(entity: any): Promise<any> {
    throw new Error('IPCMessageRepository not implemented');
  }
  async delete(id: any): Promise<any> {
    throw new Error('IPCMessageRepository not implemented');
  }
  async findBeforeMessage(sessionId: string, messageId: string, limit: number): Promise<any> {
    throw new Error('IPCMessageRepository not implemented');
  }
  async findAfterMessage(sessionId: string, messageId: string, limit: number): Promise<any> {
    throw new Error('IPCMessageRepository not implemented');
  }
  // ... other required methods
}

class IPCProviderRepository implements ProviderRepository {
  async findById(id: any): Promise<any> {
    throw new Error('IPCProviderRepository not implemented');
  }
  async findAll(): Promise<any> {
    throw new Error('IPCProviderRepository not implemented');
  }
  async save(entity: any): Promise<any> {
    throw new Error('IPCProviderRepository not implemented');
  }
  async delete(id: any): Promise<any> {
    throw new Error('IPCProviderRepository not implemented');
  }
}

class IPCModelRepository implements ModelRepository {
  async findById(id: any): Promise<any> {
    throw new Error('IPCModelRepository not implemented');
  }
  async findAll(): Promise<any> {
    throw new Error('IPCModelRepository not implemented');
  }
  async save(entity: any): Promise<any> {
    throw new Error('IPCModelRepository not implemented');
  }
  async delete(id: any): Promise<any> {
    throw new Error('IPCModelRepository not implemented');
  }
}

class IPCSettingRepository implements SettingRepository {
  async findById(id: any): Promise<any> {
    throw new Error('IPCSettingRepository not implemented');
  }
  async findAll(): Promise<any> {
    throw new Error('IPCSettingRepository not implemented');
  }
  async save(entity: any): Promise<any> {
    throw new Error('IPCSettingRepository not implemented');
  }
  async delete(id: any): Promise<any> {
    throw new Error('IPCSettingRepository not implemented');
  }
}

// AI Provider adapters that use the centralized ElectronAIProviderAdapter
class IPCOpenRouterAdapter implements OpenRouterAdapter {
  private aiProviderAdapter = new ElectronAIProviderAdapter();

  async discoverModels(request: any): Promise<any> {
    return this.aiProviderAdapter.discoverModels({ ...request, provider: 'openrouter' });
  }
  
  async testConnection(config: any): Promise<any> {
    return this.aiProviderAdapter.testConnection('openrouter', config);
  }
  
  async validateConfiguration(config: any): Promise<any> {
    return this.aiProviderAdapter.validateConfiguration('openrouter', config);
  }
  
  async getCapabilities(): Promise<any> {
    return this.aiProviderAdapter.getProviderCapabilities('openrouter');
  }
  
  async sendChat(request: any, config: any): Promise<any> {
    return this.aiProviderAdapter.sendChat({ ...request, provider: 'openrouter', config });
  }
  
  async *streamChat(request: any, config: any): AsyncGenerator<any> {
    yield* this.aiProviderAdapter.streamChat({ ...request, provider: 'openrouter', config });
  }
  
  async getHealthStatus(): Promise<any> {
    return this.aiProviderAdapter.getProviderHealthStatus('openrouter');
  }
  
  async getMetrics(): Promise<any> {
    return this.aiProviderAdapter.getProviderMetrics('openrouter');
  }

  // OpenRouter-specific methods - would delegate to Main Process via IPC
  async fetchModels(config?: any): Promise<any> {
    const result = await window.electron.invoke('levante/models/openrouter', config?.apiKey);
    return result.data || [];
  }

  async getModelDetails(modelId: string, config?: any): Promise<any> {
    throw new Error('Method not implemented');
  }

  async searchModels(query: string, filters?: any, config?: any): Promise<any> {
    throw new Error('Method not implemented');
  }

  async getModelPricing(modelId: string): Promise<any> {
    throw new Error('Method not implemented');
  }

  // ... other OpenRouter-specific methods as stubs
  async getProviderStats(modelId: string): Promise<any> { throw new Error('Method not implemented'); }
  async getRateLimitStatus(config: any): Promise<any> { throw new Error('Method not implemented'); }
  async getAccountInfo(config: any): Promise<any> { throw new Error('Method not implemented'); }
  async *streamChatSSE(request: any, config: any): AsyncGenerator<any> { throw new Error('Method not implemented'); }
  async getGenerationInfo(requestId: string, config: any): Promise<any> { throw new Error('Method not implemented'); }
  async cancelGeneration(requestId: string, config: any): Promise<void> { throw new Error('Method not implemented'); }
  async getModelCapabilities(modelId: string): Promise<any> { throw new Error('Method not implemented'); }
  async benchmarkModel(modelId: string, config: any): Promise<any> { throw new Error('Method not implemented'); }
  async getModelRankings(category?: string): Promise<any> { throw new Error('Method not implemented'); }
  async getTrendingModels(timeframe?: any): Promise<any> { throw new Error('Method not implemented'); }
  async getUsageStats(config: any, period?: any): Promise<any> { throw new Error('Method not implemented'); }
  async setModelPreferences(preferences: any, config: any): Promise<void> { throw new Error('Method not implemented'); }
  handleOpenRouterError(error: any): Error { throw new Error('Method not implemented'); }
  validateOpenRouterConfig(config: any): any { throw new Error('Method not implemented'); }
  async getModerationInfo(modelId: string): Promise<any> { throw new Error('Method not implemented'); }
  async supportsFeature(modelId: string, feature: any): Promise<boolean> { throw new Error('Method not implemented'); }
}

class IPCVercelGatewayAdapter implements VercelGatewayAdapter {
  private aiProviderAdapter = new ElectronAIProviderAdapter();

  async discoverModels(request: any): Promise<any> {
    return this.aiProviderAdapter.discoverModels({ ...request, provider: 'vercel-gateway' });
  }
  
  async testConnection(config: any): Promise<any> {
    return this.aiProviderAdapter.testConnection('vercel-gateway', config);
  }
  
  async validateConfiguration(config: any): Promise<any> {
    return this.aiProviderAdapter.validateConfiguration('vercel-gateway', config);
  }
  
  async getCapabilities(): Promise<any> {
    return this.aiProviderAdapter.getProviderCapabilities('vercel-gateway');
  }
  
  async sendChat(request: any, config: any): Promise<any> {
    return this.aiProviderAdapter.sendChat({ ...request, provider: 'vercel-gateway', config });
  }
  
  async *streamChat(request: any, config: any): AsyncGenerator<any> {
    yield* this.aiProviderAdapter.streamChat({ ...request, provider: 'vercel-gateway', config });
  }
  
  async getHealthStatus(): Promise<any> {
    return this.aiProviderAdapter.getProviderHealthStatus('vercel-gateway');
  }
  
  async getMetrics(): Promise<any> {
    return this.aiProviderAdapter.getProviderMetrics('vercel-gateway');
  }

  // Vercel Gateway-specific methods - would delegate to Main Process via IPC
  async fetchGatewayModels(config: any): Promise<any> {
    const result = await window.electron.invoke('levante/models/gateway', config.apiKey, config.baseUrl);
    return result.data || [];
  }

  async getGatewayModelInfo(modelId: string, config: any): Promise<any> {
    throw new Error('Method not implemented');
  }

  async testGatewayConnection(config: any): Promise<any> {
    throw new Error('Method not implemented');
  }

  // ... other Gateway-specific methods as stubs
  async getGatewayConfig(config: any): Promise<any> { throw new Error('Method not implemented'); }
  async *streamGatewayChat(request: any, config: any): AsyncGenerator<any> { throw new Error('Method not implemented'); }
  async getGatewayAnalytics(config: any, period?: string): Promise<any> { throw new Error('Method not implemented'); }
  async setModelRouting(rules: any[], config: any): Promise<void> { throw new Error('Method not implemented'); }
  async getModelRouting(config: any): Promise<any> { throw new Error('Method not implemented'); }
  async setRateLimiting(rules: any[], config: any): Promise<void> { throw new Error('Method not implemented'); }
  async getRateLimitStatus(config: any): Promise<any> { throw new Error('Method not implemented'); }
  async setCaching(config: any, rules: any[]): Promise<void> { throw new Error('Method not implemented'); }
  async clearCache(config: any, pattern?: string): Promise<void> { throw new Error('Method not implemented'); }
  async setRequestFiltering(filters: any[], config: any): Promise<void> { throw new Error('Method not implemented'); }
  async getRequestLogs(config: any, options?: any): Promise<any> { throw new Error('Method not implemented'); }
  async setWebhooks(webhooks: any[], config: any): Promise<void> { throw new Error('Method not implemented'); }
  async testWebhook(url: string, config: any): Promise<any> { throw new Error('Method not implemented'); }
  async getGatewayHealth(config: any): Promise<any> { throw new Error('Method not implemented'); }
  async updateGatewaySettings(settings: any, config: any): Promise<void> { throw new Error('Method not implemented'); }
  async getProviderStatus(config: any): Promise<any> { throw new Error('Method not implemented'); }
  async setModelFallbacks(fallbacks: any[], config: any): Promise<void> { throw new Error('Method not implemented'); }
  async getCustomModels(config: any): Promise<any> { throw new Error('Method not implemented'); }
  async registerCustomModel(model: any, config: any): Promise<void> { throw new Error('Method not implemented'); }
  async validateGatewayAuth(config: any): Promise<any> { throw new Error('Method not implemented'); }
}

class IPCLocalProviderAdapter implements LocalProviderAdapter {
  async discoverModels(request: any): Promise<any> {
    throw new Error('IPCLocalProviderAdapter not implemented');
  }
  async testConnection(config: any): Promise<any> {
    throw new Error('IPCLocalProviderAdapter not implemented');
  }
  async validateConfiguration(config: any): Promise<any> {
    throw new Error('IPCLocalProviderAdapter not implemented');
  }
  async getCapabilities(): Promise<any> {
    throw new Error('IPCLocalProviderAdapter not implemented');
  }
  async sendChat(request: any, config: any): Promise<any> {
    throw new Error('IPCLocalProviderAdapter not implemented');
  }
  async *streamChat(request: any, config: any): AsyncGenerator<any> {
    throw new Error('IPCLocalProviderAdapter not implemented');
  }
  async getHealthStatus(): Promise<any> {
    throw new Error('IPCLocalProviderAdapter not implemented');
  }
  async getMetrics(): Promise<any> {
    throw new Error('IPCLocalProviderAdapter not implemented');
  }
}

class IPCCloudProviderAdapter implements CloudProviderAdapter {
  async discoverModels(request: any): Promise<any> {
    throw new Error('IPCCloudProviderAdapter not implemented');
  }
  async testConnection(config: any): Promise<any> {
    throw new Error('IPCCloudProviderAdapter not implemented');
  }
  async validateConfiguration(config: any): Promise<any> {
    throw new Error('IPCCloudProviderAdapter not implemented');
  }
  async getCapabilities(): Promise<any> {
    throw new Error('IPCCloudProviderAdapter not implemented');
  }
  async sendChat(request: any, config: any): Promise<any> {
    throw new Error('IPCCloudProviderAdapter not implemented');
  }
  async *streamChat(request: any, config: any): AsyncGenerator<any> {
    throw new Error('IPCCloudProviderAdapter not implemented');
  }
  async getHealthStatus(): Promise<any> {
    throw new Error('IPCCloudProviderAdapter not implemented');
  }
  async getMetrics(): Promise<any> {
    throw new Error('IPCCloudProviderAdapter not implemented');
  }
}

/**
 * Creates a ServiceContainer configured with Renderer Process IPC adapters
 * 
 * This container wires together:
 * - IPC-based repositories that communicate with Main Process
 * - IPC-based AI provider adapters that delegate to Main Process
 * - All dependencies needed for the hexagonal architecture in the renderer
 */
export function createRendererServiceContainer(): ServiceContainer {
  // Create IPC adapter instances
  const chatSessionRepository = new ElectronChatSessionAdapter();
  const messageRepository = new IPCMessageRepository();
  const providerRepository = new IPCProviderRepository();
  const modelRepository = new IPCModelRepository();
  const settingRepository = new IPCSettingRepository();

  // Create AI adapter instances (these use IPC to communicate with Main Process)
  const openRouterAdapter = new IPCOpenRouterAdapter();
  const vercelGatewayAdapter = new IPCVercelGatewayAdapter();
  const localProviderAdapter = new IPCLocalProviderAdapter();
  const cloudProviderAdapter = new IPCCloudProviderAdapter();

  // Configure the service container
  const config: ServiceContainerConfig = {
    // Repository implementations (via IPC)
    chatSessionRepository,
    messageRepository,
    providerRepository,
    modelRepository,
    settingRepository,
    
    // AI Provider adapters (via IPC)
    openRouterAdapter,
    vercelGatewayAdapter,
    localProviderAdapter,
    cloudProviderAdapter
  };

  // Create and return the service container
  return new ServiceContainer(config);
}

/**
 * Singleton instance for Renderer Process
 */
let rendererProcessContainer: ServiceContainer | null = null;

/**
 * Initialize the global Renderer Process service container
 */
export function initializeRendererProcessContainer(): ServiceContainer {
  if (rendererProcessContainer) {
    rendererProcessContainer.dispose();
  }
  
  rendererProcessContainer = createRendererServiceContainer();
  return rendererProcessContainer;
}

/**
 * Get the Renderer Process service container
 */
export function getRendererProcessContainer(): ServiceContainer {
  if (!rendererProcessContainer) {
    throw new Error('Renderer Process ServiceContainer not initialized. Call initializeRendererProcessContainer first.');
  }
  
  return rendererProcessContainer;
}

/**
 * Dispose of the Renderer Process service container
 */
export function disposeRendererProcessContainer(): void {
  if (rendererProcessContainer) {
    rendererProcessContainer.dispose();
    rendererProcessContainer = null;
  }
}

/**
 * Health check for the Renderer Process container
 */
export async function checkRendererProcessHealth(): Promise<{
  healthy: boolean;
  services: Array<{ name: string; status: 'healthy' | 'unhealthy'; error?: string }>;
}> {
  if (!rendererProcessContainer) {
    return {
      healthy: false,
      services: [{ name: 'Container', status: 'unhealthy', error: 'Container not initialized' }]
    };
  }

  return await rendererProcessContainer.healthCheck();
}