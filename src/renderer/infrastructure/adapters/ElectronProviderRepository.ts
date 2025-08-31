import { ProviderRepository } from '../../../domain/ports/secondary/ProviderRepository';
import { Provider } from '../../../domain/entities/Provider';

export class ElectronProviderRepository implements ProviderRepository {
  
  async save(provider: Provider): Promise<Provider> {
    const result = await window.levante.hexagonal.providers.configure({
      id: provider.getId(),
      type: provider.getType().toString(),
      name: provider.getName(),
      apiKey: provider.getApiKey(),
      baseUrl: provider.getBaseUrl(),
      organizationId: provider.getOrganizationId(),
      projectId: provider.getProjectId(),
      customHeaders: provider.getCustomHeaders(),
      timeout: provider.getTimeout(),
      retryAttempts: provider.getRetryAttempts(),
      rateLimitSettings: provider.getRateLimitSettings(),
      metadata: provider.getMetadata()
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to save provider');
    }
    
    return this.mapToProvider(result.data);
  }

  async findById(id: string): Promise<Provider | null> {
    const result = await window.levante.hexagonal.providers.get(id);
    
    if (!result.success) {
      if (result.error?.includes('not found')) {
        return null;
      }
      throw new Error(result.error || 'Failed to find provider');
    }
    
    return result.data ? this.mapToProvider(result.data) : null;
  }

  async findAll(): Promise<Provider[]> {
    const result = await window.levante.hexagonal.providers.getAll();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to find all providers');
    }
    
    return (result.data || []).map(data => this.mapToProvider(data));
  }

  async delete(id: string): Promise<boolean> {
    const result = await window.levante.hexagonal.providers.remove(id);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to delete provider');
    }
    
    return result.data || false;
  }

  async findByType(type: string): Promise<Provider[]> {
    const allProviders = await this.findAll();
    return allProviders.filter(provider => provider.getType().toString() === type);
  }

  async findActive(): Promise<Provider | null> {
    const result = await window.levante.hexagonal.providers.getActive();
    
    if (!result.success) {
      return null;
    }
    
    return result.data ? this.mapToProvider(result.data) : null;
  }

  async setActive(providerId: string): Promise<void> {
    const result = await window.levante.hexagonal.providers.setActive(providerId);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to set active provider');
    }
  }

  private mapToProvider(data: any): Provider {
    return Provider.create({
      type: data.type,
      name: data.name,
      apiKey: data.apiKey,
      baseUrl: data.baseUrl,
      organizationId: data.organizationId,
      projectId: data.projectId,
      customHeaders: data.customHeaders,
      timeout: data.timeout,
      retryAttempts: data.retryAttempts,
      rateLimitSettings: data.rateLimitSettings,
      metadata: data.metadata
    });
  }
}