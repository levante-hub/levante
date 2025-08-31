import { Model } from '../../entities/Model';
import { ModelId } from '../../value-objects/ModelId';
import { ProviderId } from '../../value-objects/ProviderId';
import { ModelCapabilities } from '../../value-objects/ModelCapabilities';
import { ModelCapability } from '../../entities/Model';
import { PricingInfo } from '../../value-objects/PricingInfo';
import { BaseRepository, RepositoryResult, PaginatedResult, QueryOptions } from './BaseRepository';

export interface ModelSearchFilters {
  providerId?: string;
  isSelected?: boolean;
  isAvailable?: boolean;
  capabilities?: ModelCapability[];
  maxContextLength?: number;
  minContextLength?: number;
  isFree?: boolean;
  maxCostPerToken?: number;
  nameContains?: string;
}

export interface ModelCreateInput {
  name: string;
  providerId: ProviderId;
  capabilities: ModelCapabilities;
  contextLength: number;
  pricing: PricingInfo;
  displayName?: string;
  description?: string;
}

export interface ModelUpdateInput {
  displayName?: string;
  description?: string;
  capabilities?: ModelCapabilities;
  contextLength?: number;
  pricing?: PricingInfo;
  isSelected?: boolean;
  isAvailable?: boolean;
}

export interface ModelWithUsage extends Model {
  usageCount: number;
  lastUsedAt: Date | null;
  averageTokensPerUse: number;
  totalTokensUsed: number;
  estimatedCostToDate: number;
}

export interface ModelStatistics {
  totalModels: number;
  selectedModels: number;
  availableModels: number;
  modelsByProvider: Record<string, number>;
  modelsByCapability: Record<string, number>;
  freeModels: number;
  paidModels: number;
  averageContextLength: number;
  mostUsedModels: Array<{
    modelId: string;
    name: string;
    usageCount: number;
  }>;
  totalEstimatedCost: number;
}

export interface ModelPerformanceMetrics {
  modelId: string;
  averageResponseTime: number;
  successRate: number;
  errorRate: number;
  totalRequests: number;
  averageTokensGenerated: number;
  costEfficiency: number; // tokens per dollar
  userSatisfaction?: number; // if ratings available
}

export interface ModelSyncResult {
  modelsAdded: number;
  modelsUpdated: number;
  modelsRemoved: number;
  selectionPreserved: number;
  errors: string[];
}

export interface ModelRepository extends BaseRepository<Model, ModelId> {
  /**
   * Find all models
   */
  findAll(): Promise<RepositoryResult<Model[]>>;

  /**
   * Find models by multiple IDs
   */
  findByIds(ids: string[]): Promise<RepositoryResult<Model[]>>;

  /**
   * Save multiple models
   */
  saveMany(models: Model[]): Promise<RepositoryResult<Model[]>>;

  /**
   * Delete models by provider ID
   */
  deleteByProviderId(providerId: string): Promise<RepositoryResult<number>>;
  /**
   * Create a new model
   */
  create(input: ModelCreateInput): Promise<RepositoryResult<Model>>;

  /**
   * Update an existing model
   */
  update(id: ModelId, updates: ModelUpdateInput): Promise<RepositoryResult<Model>>;

  /**
   * Find models by provider
   */
  findByProviderId(providerId: ProviderId, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Model>>>;

  /**
   * Find all selected models across all providers
   */
  findSelected(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Model>>>;

  /**
   * Find all available models
   */
  findAvailable(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Model>>>;

  /**
   * Search models by name, description, or capabilities
   */
  search(query: string, filters?: ModelSearchFilters, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Model>>>;

  /**
   * Find models by capability
   */
  findByCapability(capability: ModelCapability, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Model>>>;

  /**
   * Find models within context length range
   */
  findByContextLength(minLength: number, maxLength: number, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Model>>>;

  /**
   * Find free models
   */
  findFree(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Model>>>;

  /**
   * Find models within price range
   */
  findByPriceRange(maxCostPerToken: number, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Model>>>;

  /**
   * Select/deselect a model
   */
  setSelected(id: ModelId, selected: boolean): Promise<RepositoryResult<Model>>;

  /**
   * Set availability status
   */
  setAvailable(id: ModelId, available: boolean): Promise<RepositoryResult<Model>>;

  /**
   * Bulk select/deselect models
   */
  bulkSetSelected(ids: ModelId[], selected: boolean): Promise<RepositoryResult<number>>;

  /**
   * Select all models for a provider
   */
  selectAllForProvider(providerId: ProviderId): Promise<RepositoryResult<number>>;

  /**
   * Deselect all models for a provider
   */
  deselectAllForProvider(providerId: ProviderId): Promise<RepositoryResult<number>>;

  /**
   * Get model with usage statistics
   */
  findByIdWithUsage(id: ModelId): Promise<RepositoryResult<ModelWithUsage | null>>;

  /**
   * Find models with usage statistics
   */
  findWithUsage(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ModelWithUsage>>>;

  /**
   * Get models statistics
   */
  getStatistics(): Promise<RepositoryResult<ModelStatistics>>;

  /**
   * Sync models for a provider (preserving selections)
   */
  syncForProvider(providerId: ProviderId, newModels: ModelCreateInput[]): Promise<RepositoryResult<ModelSyncResult>>;

  /**
   * Delete all models for a provider
   */
  deleteByProviderId(providerId: ProviderId): Promise<RepositoryResult<number>>;

  /**
   * Find most popular models
   */
  findMostPopular(limit?: number): Promise<RepositoryResult<ModelWithUsage[]>>;

  /**
   * Find recently used models
   */
  findRecentlyUsed(limit?: number): Promise<RepositoryResult<ModelWithUsage[]>>;

  /**
   * Record model usage
   */
  recordUsage(id: ModelId, tokensUsed: number, responseTime: number, cost?: number): Promise<RepositoryResult<void>>;

  /**
   * Get performance metrics for a model
   */
  getPerformanceMetrics(id: ModelId): Promise<RepositoryResult<ModelPerformanceMetrics>>;

  /**
   * Find similar models by capabilities and pricing
   */
  findSimilar(id: ModelId, limit?: number): Promise<RepositoryResult<Model[]>>;

  /**
   * Get recommended models based on usage patterns
   */
  getRecommended(limit?: number): Promise<RepositoryResult<Model[]>>;

  /**
   * Find models that support specific combinations of capabilities
   */
  findByCapabilityCombination(capabilities: ModelCapability[]): Promise<RepositoryResult<Model[]>>;

  /**
   * Export model configurations
   */
  exportByProvider(providerId: ProviderId): Promise<RepositoryResult<ModelExport>>;

  /**
   * Import model configurations
   */
  importForProvider(providerId: ProviderId, data: ModelImport): Promise<RepositoryResult<Model[]>>;

  /**
   * Find models with outdated information
   */
  findOutdated(olderThanDays: number): Promise<RepositoryResult<Model[]>>;

  /**
   * Update pricing information for multiple models
   */
  bulkUpdatePricing(updates: Array<{ modelId: ModelId; pricing: PricingInfo }>): Promise<RepositoryResult<number>>;

  /**
   * Find models with pricing anomalies
   */
  findPricingAnomalies(): Promise<RepositoryResult<Model[]>>;

  /**
   * Get cost analysis for selected models
   */
  getCostAnalysis(): Promise<RepositoryResult<ModelCostAnalysis>>;

  /**
   * Find models by provider type
   */
  findByProviderType(providerType: string, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Model>>>;

  /**
   * Archive old model versions
   */
  archiveOldVersions(keepLatest: number): Promise<RepositoryResult<number>>;

  /**
   * Find models requiring user attention (new, updated, deprecated)
   */
  findRequiringAttention(): Promise<RepositoryResult<ModelAttentionItem[]>>;

  /**
   * Update model selection preferences based on usage
   */
  optimizeSelections(): Promise<RepositoryResult<ModelSelectionOptimization>>;

  /**
   * Get model comparison data
   */
  compare(modelIds: ModelId[]): Promise<RepositoryResult<ModelComparison>>;

  /**
   * Find alternative models when one becomes unavailable
   */
  findAlternatives(id: ModelId): Promise<RepositoryResult<Model[]>>;
}

export interface ModelExport {
  providerId: string;
  models: Array<{
    id: string;
    name: string;
    displayName?: string;
    description?: string;
    capabilities: string[];
    contextLength: number;
    pricing: any;
    isSelected: boolean;
  }>;
  metadata: {
    exportedAt: string;
    totalModels: number;
    selectedModels: number;
  };
}

export interface ModelImport {
  models: Array<{
    name: string;
    displayName?: string;
    description?: string;
    capabilities: string[];
    contextLength: number;
    pricing: any;
    isSelected?: boolean;
  }>;
  options?: {
    preserveExistingSelections?: boolean;
    replaceExisting?: boolean;
  };
}

export interface ModelCostAnalysis {
  totalEstimatedMonthlyCost: number;
  costByModel: Record<string, number>;
  costByProvider: Record<string, number>;
  costByCapability: Record<string, number>;
  recommendations: Array<{
    type: 'switch_model' | 'adjust_usage' | 'optimize_selection';
    description: string;
    potentialSavings: number;
  }>;
}

export interface ModelAttentionItem {
  modelId: string;
  modelName: string;
  type: 'new' | 'updated' | 'deprecated' | 'pricing_changed' | 'capability_changed';
  description: string;
  actionRequired: boolean;
  priority: 'low' | 'medium' | 'high';
}

export interface ModelSelectionOptimization {
  recommendedSelections: ModelId[];
  recommendedDeselections: ModelId[];
  reasoning: Array<{
    modelId: string;
    action: 'select' | 'deselect';
    reason: string;
    confidence: number;
  }>;
  potentialBenefits: {
    costSavings?: number;
    performanceImprovement?: number;
    redundancyReduction?: number;
  };
}

export interface ModelComparison {
  models: Array<{
    id: string;
    name: string;
    capabilities: string[];
    contextLength: number;
    pricing: any;
    performance?: ModelPerformanceMetrics;
    pros: string[];
    cons: string[];
  }>;
  summary: {
    bestForCost: string;
    bestForPerformance: string;
    bestForCapabilities: string;
    recommendation: string;
  };
}