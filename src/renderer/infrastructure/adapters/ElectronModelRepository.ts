import { ModelRepository } from '../../../domain/ports/secondary/ModelRepository';
import { Model, ModelCapability } from '../../../domain/entities/Model';
import { ModelId } from '../../../domain/value-objects/ModelId';

export class ElectronModelRepository implements ModelRepository {
  
  async save(model: Model): Promise<Model> {
    // This would require implementing model save in the IPC handlers
    // For now, we'll throw an error as models are typically synced from providers
    throw new Error('Individual model save not implemented - models are synced from providers');
  }

  async findById(id: ModelId): Promise<Model | null> {
    // This would require implementing model findById in the IPC handlers
    throw new Error('findById not implemented for models in current IPC API');
  }

  async findAll(): Promise<Model[]> {
    // This would require implementing model findAll in the IPC handlers
    throw new Error('findAll not implemented for models in current IPC API');
  }

  async delete(id: ModelId): Promise<boolean> {
    // This would require implementing model delete in the IPC handlers
    throw new Error('delete not implemented for models in current IPC API');
  }

  async findByProviderId(providerId: string): Promise<Model[]> {
    // This would be implemented by calling the provider sync models endpoint
    const result = await window.levante.hexagonal.providers.syncModels(providerId, { preserveUserSelections: true });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to find models by provider ID');
    }
    
    return (result.data || []).map(data => this.mapToModel(data));
  }

  async findByIds(ids: ModelId[]): Promise<Model[]> {
    // This would require a specialized IPC handler
    throw new Error('findByIds not implemented for models in current IPC API');
  }

  async findSelected(): Promise<Model[]> {
    // This would require implementing selected models query in IPC handlers
    throw new Error('findSelected not implemented for models in current IPC API');
  }

  async findByCapability(capability: ModelCapability): Promise<Model[]> {
    // This would require implementing capability-based query in IPC handlers
    throw new Error('findByCapability not implemented for models in current IPC API');
  }

  async saveMany(models: Model[]): Promise<Model[]> {
    // This would require implementing bulk model save in IPC handlers
    throw new Error('saveMany not implemented for models in current IPC API');
  }

  async deleteByProviderId(providerId: string): Promise<number> {
    // This would be handled internally when syncing provider models
    throw new Error('deleteByProviderId not implemented - handled internally during sync');
  }

  async countByProviderId(providerId: string): Promise<number> {
    const models = await this.findByProviderId(providerId);
    return models.length;
  }

  async updateSelection(modelId: ModelId, selected: boolean): Promise<boolean> {
    // Use the provider's select models API
    const model = await this.findById(modelId);
    if (!model) {
      return false;
    }
    
    const result = await window.levante.hexagonal.providers.selectModels(
      model.getProviderId(),
      [modelId.toString()],
      { selected }
    );
    
    return result.success;
  }

  async updateBulkSelection(modelIds: ModelId[], selected: boolean): Promise<number> {
    let updatedCount = 0;
    
    // Group by provider ID for efficient bulk updates
    const modelsByProvider = new Map<string, string[]>();
    
    for (const modelId of modelIds) {
      const model = await this.findById(modelId);
      if (model) {
        const providerId = model.getProviderId();
        if (!modelsByProvider.has(providerId)) {
          modelsByProvider.set(providerId, []);
        }
        modelsByProvider.get(providerId)!.push(modelId.toString());
      }
    }
    
    // Update each provider's models
    for (const [providerId, modelIdStrings] of Array.from(modelsByProvider.entries())) {
      const result = await window.levante.hexagonal.providers.selectModels(
        providerId,
        modelIdStrings,
        { selected }
      );
      
      if (result.success) {
        updatedCount += modelIdStrings.length;
      }
    }
    
    return updatedCount;
  }

  async searchByName(query: string, options?: {
    limit?: number;
    offset?: number;
  }): Promise<Model[]> {
    // This would require implementing model search in IPC handlers
    throw new Error('searchByName not implemented for models in current IPC API');
  }

  private mapToModel(data: any): Model {
    return Model.create({
      id: data.id,
      name: data.name,
      providerId: data.providerId,
      capabilities: data.capabilities as ModelCapability[],
      contextLength: data.contextLength,
      pricing: data.pricing,
      selected: data.selected,
      available: data.available,
      displayName: data.displayName,
      description: data.description
    });
  }
}