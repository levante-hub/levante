import { Provider } from '../../entities/Provider';
import { ProviderId } from '../../value-objects/ProviderId';
import { ProviderType } from '../../value-objects/ProviderType';
import { ApiKey } from '../../value-objects/ApiKey';
import { BaseRepository, RepositoryResult, PaginatedResult, QueryOptions } from './BaseRepository';

export interface ProviderSearchFilters {
  type?: 'openrouter' | 'vercel-gateway' | 'local' | 'cloud';
  isActive?: boolean;
  isEnabled?: boolean;
  hasApiKey?: boolean;
  hasModels?: boolean;
  lastSyncAfter?: Date;
  lastSyncBefore?: Date;
}

export interface ProviderCreateInput {
  name: string;
  type: ProviderType;
  baseUrl?: string;
  apiKey?: ApiKey;
  settings?: Record<string, any>;
}

export interface ProviderUpdateInput {
  name?: string;
  baseUrl?: string;
  apiKey?: ApiKey;
  settings?: Record<string, any>;
  isEnabled?: boolean;
  lastModelSync?: Date;
}

export interface ProviderWithStats extends Provider {
  totalModels: number;
  selectedModels: number;
  availableModels: number;
  lastSyncStatus: 'success' | 'failed' | 'pending' | 'never';
  syncError?: string;
}

export interface ProviderStatistics {
  totalProviders: number;
  activeProviders: number;
  enabledProviders: number;
  providersByType: Record<string, number>;
  providersWithApiKeys: number;
  providersWithModels: number;
  lastSyncAttempts: {
    successful: number;
    failed: number;
    pending: number;
  };
  averageModelsPerProvider: number;
}

export interface ProviderSyncStatus {
  providerId: string;
  isRunning: boolean;
  lastSync?: Date;
  lastError?: string;
  modelsFound?: number;
  syncDurationMs?: number;
}

export interface ProviderRepository extends BaseRepository<Provider, ProviderId> {
  /**
   * Create a new provider
   */
  create(input: ProviderCreateInput): Promise<RepositoryResult<Provider>>;

  /**
   * Update an existing provider
   */
  update(id: ProviderId, updates: ProviderUpdateInput): Promise<RepositoryResult<Provider>>;

  /**
   * Find providers by type
   */
  findByType(type: ProviderType, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Provider>>>;

  /**
   * Get the currently active provider
   */
  findActive(): Promise<RepositoryResult<Provider | null>>;

  /**
   * Set a provider as active (deactivates others)
   */
  setActive(id: ProviderId): Promise<RepositoryResult<Provider>>;

  /**
   * Find all enabled providers
   */
  findEnabled(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Provider>>>;

  /**
   * Enable or disable a provider
   */
  setEnabled(id: ProviderId, enabled: boolean): Promise<RepositoryResult<Provider>>;

  /**
   * Find providers with statistics
   */
  findWithStats(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ProviderWithStats>>>;

  /**
   * Get provider with statistics by ID
   */
  findByIdWithStats(id: ProviderId): Promise<RepositoryResult<ProviderWithStats | null>>;

  /**
   * Search providers by name or configuration
   */
  search(query: string, filters?: ProviderSearchFilters, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Provider>>>;

  /**
   * Find providers that need model synchronization
   */
  findNeedingSync(): Promise<RepositoryResult<Provider[]>>;

  /**
   * Update provider's last sync timestamp
   */
  updateSyncStatus(id: ProviderId, status: Partial<ProviderSyncStatus>): Promise<RepositoryResult<void>>;

  /**
   * Get providers statistics
   */
  getStatistics(): Promise<RepositoryResult<ProviderStatistics>>;

  /**
   * Validate provider configuration
   */
  validateConfiguration(id: ProviderId): Promise<RepositoryResult<ProviderValidationResult>>;

  /**
   * Test provider connection
   */
  testConnection(id: ProviderId): Promise<RepositoryResult<ProviderConnectionTest>>;

  /**
   * Find providers with API key issues
   */
  findWithApiKeyIssues(): Promise<RepositoryResult<Provider[]>>;

  /**
   * Update provider API key securely
   */
  updateApiKey(id: ProviderId, apiKey: ApiKey): Promise<RepositoryResult<void>>;

  /**
   * Remove API key from provider
   */
  removeApiKey(id: ProviderId): Promise<RepositoryResult<void>>;

  /**
   * Get provider settings by key
   */
  getSettings(id: ProviderId, key: string): Promise<RepositoryResult<any>>;

  /**
   * Update provider settings
   */
  updateSettings(id: ProviderId, settings: Record<string, any>): Promise<RepositoryResult<Provider>>;

  /**
   * Find providers by base URL pattern
   */
  findByBaseUrlPattern(pattern: string): Promise<RepositoryResult<Provider[]>>;

  /**
   * Export provider configuration (excluding sensitive data)
   */
  export(id: ProviderId): Promise<RepositoryResult<ProviderExport>>;

  /**
   * Import provider configuration
   */
  import(data: ProviderImport): Promise<RepositoryResult<Provider>>;

  /**
   * Clone provider configuration
   */
  clone(id: ProviderId, newName: string): Promise<RepositoryResult<Provider>>;

  /**
   * Find providers with models
   */
  findWithModels(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Provider>>>;

  /**
   * Find providers without models
   */
  findWithoutModels(): Promise<RepositoryResult<Provider[]>>;

  /**
   * Get sync history for a provider
   */
  getSyncHistory(id: ProviderId, limit?: number): Promise<RepositoryResult<ProviderSyncHistory[]>>;

  /**
   * Record sync attempt
   */
  recordSyncAttempt(id: ProviderId, result: ProviderSyncResult): Promise<RepositoryResult<void>>;

  /**
   * Find providers that haven't been synced recently
   */
  findStale(olderThanHours: number): Promise<RepositoryResult<Provider[]>>;

  /**
   * Bulk enable/disable providers
   */
  bulkSetEnabled(ids: ProviderId[], enabled: boolean): Promise<RepositoryResult<number>>;

  /**
   * Get provider health status
   */
  getHealthStatus(id: ProviderId): Promise<RepositoryResult<ProviderHealthStatus>>;

  /**
   * Find providers by configuration similarity
   */
  findSimilar(id: ProviderId): Promise<RepositoryResult<Provider[]>>;
}

export interface ProviderValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  canActivate: boolean;
  apiKeyStatus: 'valid' | 'invalid' | 'missing' | 'expired';
  endpointStatus: 'reachable' | 'unreachable' | 'not_applicable';
}

export interface ProviderConnectionTest {
  success: boolean;
  responseTime: number;
  statusCode?: number;
  error?: string;
  capabilities?: string[];
  testedAt: Date;
}

export interface ProviderSyncHistory {
  id: string;
  providerId: string;
  startedAt: Date;
  completedAt: Date;
  status: 'success' | 'failed' | 'cancelled';
  modelsFound: number;
  modelsAdded: number;
  modelsUpdated: number;
  modelsRemoved: number;
  error?: string;
  durationMs: number;
}

export interface ProviderSyncResult {
  status: 'success' | 'failed' | 'cancelled';
  modelsFound: number;
  modelsAdded: number;
  modelsUpdated: number;
  modelsRemoved: number;
  error?: string;
  durationMs: number;
}

export interface ProviderHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  checks: {
    configuration: boolean;
    connectivity: boolean;
    authentication: boolean;
    models: boolean;
  };
  issues: string[];
  recommendations: string[];
}

export interface ProviderExport {
  provider: {
    name: string;
    type: string;
    baseUrl?: string;
    settings: Record<string, any>;
  };
  metadata: {
    exportedAt: string;
    exportVersion: string;
    modelCount: number;
    hasApiKey: boolean;
  };
}

export interface ProviderImport {
  provider: {
    name: string;
    type: string;
    baseUrl?: string;
    settings?: Record<string, any>;
    apiKey?: string; // Will be converted to ApiKey internally
  };
  options?: {
    replaceExisting?: boolean;
    preserveModels?: boolean;
    generateNewId?: boolean;
  };
}