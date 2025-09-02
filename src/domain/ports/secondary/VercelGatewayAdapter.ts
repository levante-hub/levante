import {
  ModelProviderAdapter,
  AIProviderAdapter,
  ModelDiscoveryRequest,
  ModelDiscoveryResult,
  ConnectionTestResult,
  ProviderConnectionConfig,
  ConfigurationValidationResult,
  ProviderCapabilities,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ModelInfo,
  AIMessage,
  HealthCheckResult,
  AdapterMetrics
} from './BaseAIAdapter';
import { ApiKey } from '../../value-objects/ApiKey';

export interface VercelGatewayModel {
  id: string;
  name: string;
  provider: string;
  description?: string;
  maxTokens: number;
  capabilities: string[];
  pricing?: {
    input: number;
    output: number;
  };
  metadata: {
    version?: string;
    family?: string;
    tags?: string[];
    deprecated?: boolean;
  };
}

export interface VercelGatewayConfig extends ProviderConnectionConfig {
  apiKey: ApiKey; // Required for Vercel AI Gateway
  baseUrl: string; // Custom gateway URL
  organizationId?: string; // For multi-tenant setups
  projectId?: string; // Vercel project ID
  environment?: 'development' | 'preview' | 'production';
  customHeaders?: Record<string, string>;
}

export interface VercelGatewayResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    requestId: string;
    timestamp: string;
    model?: string;
    provider?: string;
  };
}

export interface VercelGatewayChatRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    name?: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  tools?: VercelGatewayTool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface VercelGatewayTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>; // JSON Schema
  };
}

export interface VercelGatewayChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  provider: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface VercelGatewayStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  provider: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      tool_calls?: Array<{
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }>;
}

export interface VercelGatewayAdapter extends ModelProviderAdapter, AIProviderAdapter {
  /**
   * Fetch models from Vercel AI Gateway
   */
  fetchGatewayModels(config: VercelGatewayConfig): Promise<VercelGatewayModel[]>;

  /**
   * Get specific model information from gateway
   */
  getGatewayModelInfo(modelId: string, config: VercelGatewayConfig): Promise<VercelGatewayModel>;

  /**
   * Test gateway endpoint connectivity
   */
  testGatewayConnection(config: VercelGatewayConfig): Promise<VercelGatewayConnectionResult>;

  /**
   * Get gateway configuration and limits
   */
  getGatewayConfig(config: VercelGatewayConfig): Promise<VercelGatewayInfo>;

  /**
   * Stream chat through gateway
   */
  streamGatewayChat(request: ChatRequest, config: VercelGatewayConfig): AsyncGenerator<ChatStreamChunk>;

  /**
   * Get gateway analytics and usage
   */
  getGatewayAnalytics(config: VercelGatewayConfig, period?: string): Promise<VercelGatewayAnalytics>;

  /**
   * Configure model routing rules
   */
  setModelRouting(rules: VercelGatewayRoutingRule[], config: VercelGatewayConfig): Promise<void>;

  /**
   * Get current routing configuration
   */
  getModelRouting(config: VercelGatewayConfig): Promise<VercelGatewayRoutingRule[]>;

  /**
   * Set rate limiting rules
   */
  setRateLimiting(rules: VercelGatewayRateLimit[], config: VercelGatewayConfig): Promise<void>;

  /**
   * Get rate limiting status
   */
  getRateLimitStatus(config: VercelGatewayConfig): Promise<VercelGatewayRateLimitStatus>;

  /**
   * Configure response caching
   */
  setCaching(config: VercelGatewayConfig, rules: VercelGatewayCacheRule[]): Promise<void>;

  /**
   * Clear gateway cache
   */
  clearCache(config: VercelGatewayConfig, pattern?: string): Promise<void>;

  /**
   * Set up request filtering
   */
  setRequestFiltering(filters: VercelGatewayFilter[], config: VercelGatewayConfig): Promise<void>;

  /**
   * Get request logs
   */
  getRequestLogs(config: VercelGatewayConfig, options?: VercelGatewayLogOptions): Promise<VercelGatewayLog[]>;

  /**
   * Configure webhook notifications
   */
  setWebhooks(webhooks: VercelGatewayWebhook[], config: VercelGatewayConfig): Promise<void>;

  /**
   * Test webhook endpoint
   */
  testWebhook(url: string, config: VercelGatewayConfig): Promise<VercelGatewayWebhookTest>;

  /**
   * Get gateway health status
   */
  getGatewayHealth(config: VercelGatewayConfig): Promise<VercelGatewayHealth>;

  /**
   * Update gateway settings
   */
  updateGatewaySettings(settings: VercelGatewaySettings, config: VercelGatewayConfig): Promise<void>;

  /**
   * Get provider status through gateway
   */
  getProviderStatus(config: VercelGatewayConfig): Promise<VercelGatewayProviderStatus[]>;

  /**
   * Configure model fallbacks
   */
  setModelFallbacks(fallbacks: VercelGatewayFallback[], config: VercelGatewayConfig): Promise<void>;

  /**
   * Get custom model configurations
   */
  getCustomModels(config: VercelGatewayConfig): Promise<VercelGatewayCustomModel[]>;

  /**
   * Register custom model
   */
  registerCustomModel(model: VercelGatewayCustomModel, config: VercelGatewayConfig): Promise<void>;

  /**
   * Validate gateway API key and permissions
   */
  validateGatewayAuth(config: VercelGatewayConfig): Promise<VercelGatewayAuthValidation>;
}

export interface VercelGatewayConnectionResult extends ConnectionTestResult {
  gatewayVersion: string;
  supportedProviders: string[];
  customFeatures: string[];
  rateLimits: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

export interface VercelGatewayInfo {
  version: string;
  organizationId: string;
  projectId: string;
  environment: string;
  features: {
    caching: boolean;
    routing: boolean;
    rateLimiting: boolean;
    filtering: boolean;
    analytics: boolean;
    webhooks: boolean;
  };
  limits: {
    maxRequestSize: number;
    maxResponseSize: number;
    maxConcurrentRequests: number;
    rateLimits: {
      requests: number;
      tokens: number;
      period: string;
    };
  };
}

export interface VercelGatewayAnalytics {
  period: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCost: number;
  averageResponseTime: number;
  modelUsage: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
    errors: number;
  }>;
  providerUsage: Record<string, {
    requests: number;
    uptime: number;
    averageResponseTime: number;
  }>;
  cacheStats: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  errors: Array<{
    code: string;
    count: number;
    examples: string[];
  }>;
}

export interface VercelGatewayRoutingRule {
  id: string;
  name: string;
  condition: {
    modelPattern?: string;
    userPattern?: string;
    requestSizeMin?: number;
    requestSizeMax?: number;
    timeOfDay?: string;
  };
  action: {
    targetProvider?: string;
    targetModel?: string;
    modifyRequest?: Record<string, any>;
    addHeaders?: Record<string, string>;
  };
  priority: number;
  enabled: boolean;
}

export interface VercelGatewayRateLimit {
  id: string;
  name: string;
  scope: 'global' | 'user' | 'model' | 'provider';
  limits: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    requestsPerHour?: number;
    tokensPerHour?: number;
  };
  actions: {
    onLimit: 'reject' | 'queue' | 'throttle';
    queueSize?: number;
    throttleRate?: number;
  };
  enabled: boolean;
}

export interface VercelGatewayRateLimitStatus {
  global: {
    requestsRemaining: number;
    tokensRemaining: number;
    resetTime: Date;
  };
  byScope: Record<string, {
    requestsRemaining: number;
    tokensRemaining: number;
    resetTime: Date;
  }>;
}

export interface VercelGatewayCacheRule {
  id: string;
  name: string;
  condition: {
    modelPattern?: string;
    requestPattern?: string;
    maxTokens?: number;
  };
  settings: {
    ttl: number; // Time to live in seconds
    varyBy: string[]; // Cache key variations
    excludeHeaders: string[];
  };
  enabled: boolean;
}

export interface VercelGatewayFilter {
  id: string;
  name: string;
  type: 'content' | 'size' | 'rate' | 'auth' | 'custom';
  condition: {
    pattern?: string;
    minSize?: number;
    maxSize?: number;
    contentType?: string;
  };
  action: 'allow' | 'deny' | 'modify' | 'log';
  parameters?: Record<string, any>;
  enabled: boolean;
}

export interface VercelGatewayLogOptions {
  startDate?: Date;
  endDate?: Date;
  level?: 'debug' | 'info' | 'warn' | 'error';
  model?: string;
  provider?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export interface VercelGatewayLog {
  id: string;
  timestamp: Date;
  level: string;
  message: string;
  model?: string;
  provider?: string;
  userId?: string;
  requestId?: string;
  responseTime?: number;
  tokens?: number;
  cost?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface VercelGatewayWebhook {
  id: string;
  name: string;
  url: string;
  events: string[]; // request.completed, request.failed, rate.limit.exceeded, etc.
  headers?: Record<string, string>;
  secret?: string; // For signature verification
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    maxBackoffMs: number;
  };
  enabled: boolean;
}

export interface VercelGatewayWebhookTest {
  success: boolean;
  statusCode: number;
  responseTime: number;
  response?: string;
  error?: string;
}

export interface VercelGatewayHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: {
    database: boolean;
    cache: boolean;
    providers: Record<string, boolean>;
    webhooks: boolean;
  };
  metrics: {
    requestsPerSecond: number;
    averageResponseTime: number;
    errorRate: number;
    cacheHitRate: number;
  };
  issues: string[];
}

export interface VercelGatewaySettings {
  defaultTimeout: number;
  maxRetries: number;
  retryBackoffMs: number;
  enableAnalytics: boolean;
  enableCaching: boolean;
  defaultCacheTtl: number;
  enableWebhooks: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  customHeaders: Record<string, string>;
}

export interface VercelGatewayProviderStatus {
  name: string;
  status: 'online' | 'offline' | 'degraded';
  uptime: number;
  averageResponseTime: number;
  successRate: number;
  lastCheck: Date;
  supportedModels: string[];
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    remaining: number;
  };
}

export interface VercelGatewayFallback {
  id: string;
  name: string;
  primaryModel: string;
  fallbackModels: string[];
  triggerConditions: {
    onError?: string[];
    onTimeout?: number;
    onRateLimit?: boolean;
    onUnavailable?: boolean;
  };
  fallbackDelay: number;
  maxFallbacks: number;
  enabled: boolean;
}

export interface VercelGatewayCustomModel {
  id: string;
  name: string;
  provider: string;
  endpoint: string;
  authentication: {
    type: 'bearer' | 'api_key' | 'oauth';
    credentials: Record<string, string>;
  };
  requestTransform?: string; // JavaScript code for request transformation
  responseTransform?: string; // JavaScript code for response transformation
  capabilities: string[];
  limits: {
    maxTokens: number;
    requestsPerMinute: number;
  };
  enabled: boolean;
}

export interface VercelGatewayAuthValidation {
  isValid: boolean;
  organizationId?: string;
  projectId?: string;
  permissions: string[];
  limits: {
    requestsPerMonth: number;
    tokensPerMonth: number;
    customModels: number;
  };
  features: string[];
  expiresAt?: Date;
}

// Events specific to Vercel Gateway
export interface VercelGatewayEvent {
  type: 'request' | 'error' | 'cache' | 'webhook' | 'fallback' | 'rate_limit';
  timestamp: Date;
  gatewayId: string;
  data: Record<string, any>;
}

// Configuration for Vercel Gateway-specific features
export interface VercelGatewayFeatureConfig {
  routing: {
    enabled: boolean;
    rules: VercelGatewayRoutingRule[];
  };
  caching: {
    enabled: boolean;
    defaultTtl: number;
    rules: VercelGatewayCacheRule[];
  };
  rateLimit: {
    enabled: boolean;
    rules: VercelGatewayRateLimit[];
  };
  analytics: {
    enabled: boolean;
    retention: number; // Days
    detailedLogging: boolean;
  };
  webhooks: {
    enabled: boolean;
    endpoints: VercelGatewayWebhook[];
  };
}