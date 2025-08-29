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

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  architecture: {
    modality: 'text' | 'multimodal';
    tokenizer: string;
    instruct_type?: string;
  };
  pricing: {
    prompt: string;
    completion: string;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number;
    is_moderated: boolean;
  };
  per_request_limits?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export interface OpenRouterResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
    type: string;
  };
}

export interface OpenRouterChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
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

export interface OpenRouterStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
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
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenRouterConfig extends ProviderConnectionConfig {
  apiKey?: ApiKey; // Optional for public model listing
  baseUrl?: string; // Defaults to https://openrouter.ai/api/v1
  siteName?: string; // Your site name for analytics
  siteUrl?: string; // Your site URL for analytics
  userAgent?: string; // Custom user agent
}

export interface OpenRouterAdapter extends ModelProviderAdapter, AIProviderAdapter {
  /**
   * Fetch models from OpenRouter API
   * API key is optional - public access available with rate limits
   */
  fetchModels(config?: OpenRouterConfig): Promise<OpenRouterModel[]>;

  /**
   * Get specific model information
   */
  getModelDetails(modelId: string, config?: OpenRouterConfig): Promise<OpenRouterModel>;

  /**
   * Search models by capabilities or name
   */
  searchModels(query: string, filters?: OpenRouterModelFilters, config?: OpenRouterConfig): Promise<OpenRouterModel[]>;

  /**
   * Get model pricing information
   */
  getModelPricing(modelId: string): Promise<OpenRouterPricing>;

  /**
   * Get provider statistics and rankings
   */
  getProviderStats(modelId: string): Promise<OpenRouterProviderStats>;

  /**
   * Check rate limits status
   */
  getRateLimitStatus(config: OpenRouterConfig): Promise<OpenRouterRateLimits>;

  /**
   * Get account credits and usage (requires API key)
   */
  getAccountInfo(config: OpenRouterConfig): Promise<OpenRouterAccountInfo>;

  /**
   * Stream chat with Server-Sent Events
   */
  streamChatSSE(request: ChatRequest, config: OpenRouterConfig): AsyncGenerator<ChatStreamChunk>;

  /**
   * Get generation info for completed requests
   */
  getGenerationInfo(requestId: string, config: OpenRouterConfig): Promise<OpenRouterGenerationInfo>;

  /**
   * Cancel ongoing generation
   */
  cancelGeneration(requestId: string, config: OpenRouterConfig): Promise<void>;

  /**
   * Get supported model capabilities
   */
  getModelCapabilities(modelId: string): Promise<OpenRouterModelCapabilities>;

  /**
   * Test model availability and performance
   */
  benchmarkModel(modelId: string, config: OpenRouterConfig): Promise<OpenRouterBenchmark>;

  /**
   * Get model rankings and comparisons
   */
  getModelRankings(category?: string): Promise<OpenRouterRanking[]>;

  /**
   * Get trending/popular models
   */
  getTrendingModels(timeframe?: 'hour' | 'day' | 'week' | 'month'): Promise<OpenRouterModel[]>;

  /**
   * Get model usage statistics
   */
  getUsageStats(config: OpenRouterConfig, period?: 'day' | 'week' | 'month'): Promise<OpenRouterUsageStats>;

  /**
   * Set model preferences (fallback order)
   */
  setModelPreferences(preferences: OpenRouterModelPreferences, config: OpenRouterConfig): Promise<void>;

  /**
   * Get provider-specific error handling
   */
  handleOpenRouterError(error: any): Error;

  /**
   * Validate OpenRouter-specific configuration
   */
  validateOpenRouterConfig(config: OpenRouterConfig): OpenRouterConfigValidation;

  /**
   * Get model moderation info
   */
  getModerationInfo(modelId: string): Promise<OpenRouterModerationInfo>;

  /**
   * Check if model supports specific features
   */
  supportsFeature(modelId: string, feature: OpenRouterFeature): Promise<boolean>;
}

export interface OpenRouterModelFilters {
  modality?: 'text' | 'multimodal';
  maxCostPerToken?: number;
  minContextLength?: number;
  maxContextLength?: number;
  supportedFormats?: string[];
  isModerated?: boolean;
  topProvider?: boolean;
  architecture?: string;
}

export interface OpenRouterPricing {
  prompt: number; // Cost per token
  completion: number; // Cost per token
  currency: 'USD';
  perRequestLimits?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface OpenRouterProviderStats {
  modelId: string;
  providers: Array<{
    name: string;
    contextLength: number;
    maxCompletionTokens: number;
    isModerated: boolean;
    uptime: number;
    avgResponseTime: number;
    pricing: OpenRouterPricing;
  }>;
  topProvider: string;
  totalProviders: number;
}

export interface OpenRouterRateLimits {
  requestsPerMinute: number;
  tokensPerMinute: number;
  requestsRemaining: number;
  tokensRemaining: number;
  resetTime: Date;
  upgradeAvailable: boolean;
}

export interface OpenRouterAccountInfo {
  credits: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalCost: number;
  };
  limits: OpenRouterRateLimits;
  tier: 'free' | 'paid' | 'unlimited';
}

export interface OpenRouterGenerationInfo {
  id: string;
  model: string;
  status: 'completed' | 'failed' | 'cancelled' | 'in_progress';
  totalTokens: number;
  cost: number;
  providers: Array<{
    name: string;
    responseTime: number;
    success: boolean;
  }>;
  createdAt: Date;
  completedAt?: Date;
}

export interface OpenRouterModelCapabilities {
  maxContextLength: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsSystemPrompts: boolean;
  supportedFormats: string[];
  modalities: string[];
  languages: string[];
}

export interface OpenRouterBenchmark {
  modelId: string;
  metrics: {
    averageResponseTime: number;
    tokensPerSecond: number;
    successRate: number;
    errorRate: number;
  };
  testedAt: Date;
  testSize: number;
}

export interface OpenRouterRanking {
  rank: number;
  modelId: string;
  name: string;
  score: number;
  category: string;
  metrics: {
    performance: number;
    cost: number;
    popularity: number;
  };
}

export interface OpenRouterUsageStats {
  period: string;
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  modelUsage: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
  }>;
  dailyBreakdown?: Array<{
    date: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
}

export interface OpenRouterModelPreferences {
  fallbackOrder: string[];
  allowFallback: boolean;
  requireTopProvider: boolean;
  costLimit?: number; // Maximum cost per request
  qualityThreshold?: number; // Minimum quality score
}

export interface OpenRouterConfigValidation {
  isValid: boolean;
  hasApiKey: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  features: {
    publicAccess: boolean;
    rateLimitBypass: boolean;
    analytics: boolean;
    prioritySupport: boolean;
  };
}

export interface OpenRouterModerationInfo {
  modelId: string;
  isModerated: boolean;
  filters: string[];
  allowedRegions: string[];
  restrictedContent: string[];
  safetyRating: number;
}

export type OpenRouterFeature = 
  | 'streaming'
  | 'tools'
  | 'vision' 
  | 'system_prompts'
  | 'json_mode'
  | 'function_calling'
  | 'image_input'
  | 'document_input'
  | 'web_search'
  | 'code_execution';

// Error types specific to OpenRouter
export interface OpenRouterError {
  code: string;
  message: string;
  type: 'invalid_request' | 'authentication' | 'rate_limit' | 'model_not_found' | 'insufficient_credits';
  statusCode: number;
}

// Events for monitoring OpenRouter operations
export interface OpenRouterEvent {
  type: 'model_request' | 'rate_limit' | 'fallback' | 'error' | 'cost_alert';
  timestamp: Date;
  data: Record<string, any>;
}

// Configuration for OpenRouter-specific features
export interface OpenRouterFeatureConfig {
  enableFallbacks: boolean;
  costAlerts: {
    enabled: boolean;
    thresholds: number[];
  };
  analytics: {
    enabled: boolean;
    siteName?: string;
    siteUrl?: string;
  };
  caching: {
    enabled: boolean;
    ttl: number; // Time to live in seconds
  };
}