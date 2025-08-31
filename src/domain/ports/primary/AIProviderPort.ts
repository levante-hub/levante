import { Provider } from '../../entities/Provider';
import { Model } from '../../entities/Model';
import { ProviderType } from '../../value-objects/ProviderType';
import { ApiKey } from '../../value-objects/ApiKey';

// Input types for provider configuration
export interface ProviderConfiguration {
  type: ProviderType;
  name: string;
  apiKey?: ApiKey;
  baseUrl?: string;
  organizationId?: string;
  projectId?: string;
  customHeaders?: Record<string, string>;
  timeout?: number;
  retryAttempts?: number;
  rateLimitSettings?: RateLimitConfig;
  metadata?: Record<string, any>;
}

export interface RateLimitConfig {
  requestsPerMinute?: number;
  tokensPerMinute?: number;
  requestsPerDay?: number;
  tokensPerDay?: number;
  concurrentRequests?: number;
}

export interface ModelSyncOptions {
  forceRefresh?: boolean;
  includeDisabled?: boolean;
  filterByCapabilities?: string[];
  preserveUserSelections?: boolean;
  timeoutMs?: number;
}

export interface ModelSelectionOptions {
  selected: boolean;
  reason?: string;
  bulkOperation?: boolean;
}

export interface ProviderTestConfig {
  skipAuthentication?: boolean;
  testModel?: string;
  testMessage?: string;
  timeoutMs?: number;
}

// Output types for responses
export interface ConnectionResult {
  success: boolean;
  providerId: string;
  responseTime?: number;
  availableModels?: number;
  error?: string;
  warnings?: string[];
  metadata?: {
    region?: string;
    version?: string;
    rateLimits?: RateLimitInfo;
    features?: string[];
  };
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetTime?: Date;
  resetAfter?: number;
}

export interface ProviderStats {
  providerId: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  totalTokensUsed: number;
  totalCost: number;
  lastRequestAt?: Date;
  rateLimitHits: number;
  mostUsedModels: Array<{ modelId: string; count: number }>;
}

export interface ModelAvailability {
  modelId: string;
  available: boolean;
  reason?: string;
  estimatedAvailabilityTime?: Date;
  alternativeModels?: string[];
}

// Error types specific to provider operations
export abstract class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
    public readonly providerId?: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ProviderNotFoundError extends AIProviderError {
  constructor(providerId: string) {
    super(`Provider ${providerId} not found`, 'PROVIDER_NOT_FOUND', false, providerId);
  }
}

export class ProviderConfigurationError extends AIProviderError {
  constructor(providerId: string, reason: string) {
    super(`Provider configuration error for ${providerId}: ${reason}`, 'PROVIDER_CONFIG_ERROR', false, providerId);
  }
}

export class AuthenticationError extends AIProviderError {
  constructor(providerId: string, reason?: string) {
    super(`Authentication failed for provider ${providerId}${reason ? `: ${reason}` : ''}`, 'AUTH_ERROR', false, providerId);
  }
}

export class ModelSyncError extends AIProviderError {
  constructor(providerId: string, reason: string) {
    super(`Failed to sync models for provider ${providerId}: ${reason}`, 'MODEL_SYNC_ERROR', true, providerId);
  }
}

export class RateLimitError extends AIProviderError {
  constructor(providerId: string, resetTime?: Date) {
    super(`Rate limit exceeded for provider ${providerId}${resetTime ? `, resets at ${resetTime.toISOString()}` : ''}`, 'RATE_LIMIT_ERROR', true, providerId);
  }
}

export class ProviderUnavailableError extends AIProviderError {
  constructor(providerId: string, reason?: string) {
    super(`Provider ${providerId} is currently unavailable${reason ? `: ${reason}` : ''}`, 'PROVIDER_UNAVAILABLE', true, providerId);
  }
}

export class ModelNotAvailableError extends AIProviderError {
  constructor(modelId: string, providerId?: string) {
    super(`Model ${modelId} is not available${providerId ? ` on provider ${providerId}` : ''}`, 'MODEL_NOT_AVAILABLE', false, providerId);
  }
}

// Main port interface
export interface AIProviderPort {
  /**
   * Configure a new provider or update existing configuration
   */
  configureProvider(config: ProviderConfiguration): Promise<Provider>;

  /**
   * Remove a provider and all its configuration
   */
  removeProvider(providerId: string): Promise<boolean>;

  /**
   * Get all configured providers
   */
  getAllProviders(): Promise<Provider[]>;

  /**
   * Get a specific provider by ID
   */
  getProvider(providerId: string): Promise<Provider>;

  /**
   * Set the active provider for new conversations
   */
  setActiveProvider(providerId: string): Promise<void>;

  /**
   * Get the currently active provider
   */
  getActiveProvider(): Promise<Provider | null>;

  /**
   * Sync models from provider's API
   */
  syncProviderModels(providerId: string, options?: ModelSyncOptions): Promise<Model[]>;

  /**
   * Sync models from all providers
   */
  syncAllProviderModels(options?: ModelSyncOptions): Promise<Map<string, Model[]>>;

  /**
   * Select/deselect specific models for use
   */
  selectModels(providerId: string, modelIds: string[], options: ModelSelectionOptions): Promise<void>;

  /**
   * Select all models for a provider
   */
  selectAllModels(providerId: string, selected: boolean): Promise<void>;

  /**
   * Get all available models across all providers
   */
  getAvailableModels(options?: { selectedOnly?: boolean; capabilities?: string[] }): Promise<Model[]>;

  /**
   * Get models for a specific provider
   */
  getProviderModels(providerId: string, options?: { selectedOnly?: boolean }): Promise<Model[]>;

  /**
   * Test connection to a provider
   */
  testProviderConnection(providerId: string, config?: ProviderTestConfig): Promise<ConnectionResult>;

  /**
   * Check model availability in real-time
   */
  checkModelAvailability(modelIds: string[]): Promise<ModelAvailability[]>;

  /**
   * Get provider statistics and usage info
   */
  getProviderStats(providerId?: string): Promise<ProviderStats | ProviderStats[]>;

  /**
   * Reset provider statistics
   */
  resetProviderStats(providerId?: string): Promise<void>;

  /**
   * Enable/disable a provider
   */
  toggleProvider(providerId: string, enabled: boolean): Promise<Provider>;

  /**
   * Update provider configuration
   */
  updateProviderConfig(providerId: string, updates: Partial<ProviderConfiguration>): Promise<Provider>;

  /**
   * Get provider health status
   */
  getProviderHealth(): Promise<ProviderHealthStatus[]>;

  /**
   * Refresh provider metadata and capabilities
   */
  refreshProviderMetadata(providerId: string): Promise<Provider>;

  /**
   * Export provider configuration
   */
  exportProviderConfig(providerId?: string): Promise<ProviderConfigExport>;

  /**
   * Import provider configuration
   */
  importProviderConfig(data: ProviderConfigImport): Promise<Provider[]>;
}

// Supporting types for provider operations
export interface ProviderHealthStatus {
  providerId: string;
  status: 'healthy' | 'degraded' | 'unavailable' | 'unknown';
  responseTime?: number;
  lastChecked: Date;
  issues?: HealthIssue[];
  uptime?: number;
}

export interface HealthIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  code: string;
  timestamp: Date;
  resolved?: boolean;
}

export interface ProviderConfigExport {
  version: string;
  exportedAt: Date;
  providers: ProviderConfiguration[];
  models: Array<{ providerId: string; modelId: string; selected: boolean }>;
}

export interface ProviderConfigImport {
  version?: string;
  providers: ProviderConfiguration[];
  models?: Array<{ providerId: string; modelId: string; selected: boolean }>;
  mergeStrategy?: 'replace' | 'merge' | 'skip_existing';
}

// Events emitted by provider operations
export interface ProviderEvent {
  type: ProviderEventType;
  providerId?: string;
  modelId?: string;
  timestamp: Date;
  data?: any;
}

export type ProviderEventType = 
  | 'provider_configured'
  | 'provider_removed'
  | 'provider_activated'
  | 'models_synced'
  | 'model_selected'
  | 'model_deselected'
  | 'connection_tested'
  | 'provider_health_checked'
  | 'rate_limit_hit'
  | 'provider_error'
  | 'config_exported'
  | 'config_imported';

// Configuration for provider management
export interface ProviderManagementConfig {
  maxProvidersPerUser: number;
  autoSyncInterval: number; // minutes
  connectionTimeoutMs: number;
  maxRetryAttempts: number;
  enableHealthChecks: boolean;
  healthCheckInterval: number; // minutes
  enableUsageTracking: boolean;
  usageRetentionDays: number;
  autoDisableUnhealthyProviders: boolean;
  rateLimitBufferPercentage: number; // % buffer below actual limits
}

// Validation rules for provider operations
export interface ProviderValidationRules {
  providerNameMinLength: number;
  providerNameMaxLength: number;
  allowedProviderTypes: ProviderType[];
  requireApiKeyFor: ProviderType[];
  maxCustomHeaders: number;
  allowedHeaderKeys: string[];
  maxTimeoutMs: number;
  minTimeoutMs: number;
  maxRetryAttempts: number;
}