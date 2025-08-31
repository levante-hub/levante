import { Model } from '../../entities/Model';
import { ApiKey } from '../../value-objects/ApiKey';

// Common types for all AI adapters
export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts?: MessagePart[];
  toolCalls?: ToolCall[];
  timestamp?: Date;
}

export interface MessagePart {
  type: 'text' | 'image' | 'source-url' | 'reasoning';
  text?: string;
  url?: string;
  imageUrl?: string;
  metadata?: Record<string, any>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
}

export interface ChatRequest {
  messages: AIMessage[];
  model: string;
  options?: ChatOptions;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  stream?: boolean;
  webSearch?: boolean;
  tools?: ToolDefinition[];
  systemPrompt?: string;
  conversationId?: string;
  metadata?: Record<string, any>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
}

export interface ChatResponse {
  id: string;
  model: string;
  content: string;
  parts?: MessagePart[];
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'cancelled';
  usage: TokenUsage;
  metadata?: Record<string, any>;
}

export interface ChatStreamChunk {
  id: string;
  delta?: string;
  parts?: MessagePart[];
  toolCalls?: ToolCall[];
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'cancelled';
  usage?: TokenUsage;
  done: boolean;
  sources?: Array<{ url: string; title?: string }>;
  reasoning?: string;
  metadata?: Record<string, any>;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number;
}

export interface ModelDiscoveryRequest {
  apiKey?: ApiKey;
  baseUrl?: string;
  filters?: ModelFilters;
  options?: DiscoveryOptions;
}

export interface ModelFilters {
  capabilities?: string[];
  maxContextLength?: number;
  minContextLength?: number;
  supportedFormats?: string[];
  pricingTier?: 'free' | 'paid' | 'premium';
  isAvailable?: boolean;
}

export interface DiscoveryOptions {
  includeDeprecated?: boolean;
  includeExperimental?: boolean;
  forceRefresh?: boolean;
  timeout?: number;
  maxRetries?: number;
}

export interface ModelDiscoveryResult {
  models: Model[];
  metadata: {
    discoveredAt: Date;
    source: string;
    totalFound: number;
    cached: boolean;
    responseTime: number;
  };
}

export interface ConnectionTestResult {
  success: boolean;
  responseTime: number;
  statusCode?: number;
  error?: string;
  capabilities?: string[];
  serverInfo?: {
    version?: string;
    provider?: string;
    supportedModels?: string[];
  };
  testedAt: Date;
}

export interface AdapterError extends Error {
  code: string;
  statusCode?: number;
  retryable: boolean;
  details?: Record<string, any>;
}

export abstract class BaseAdapterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
    public readonly statusCode?: number,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NetworkError extends BaseAdapterError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'NETWORK_ERROR', true, undefined, details);
  }
}

export class AuthenticationError extends BaseAdapterError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'AUTHENTICATION_ERROR', false, 401, details);
  }
}

export class RateLimitError extends BaseAdapterError {
  constructor(message: string, retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', true, 429, { retryAfter });
  }
}

export class ModelNotFoundError extends BaseAdapterError {
  constructor(modelId: string) {
    super(`Model ${modelId} not found`, 'MODEL_NOT_FOUND', false, 404, { modelId });
  }
}

export class InvalidRequestError extends BaseAdapterError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'INVALID_REQUEST', false, 400, details);
  }
}

export class ServiceUnavailableError extends BaseAdapterError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'SERVICE_UNAVAILABLE', true, 503, details);
  }
}

export class ContentFilterError extends BaseAdapterError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'CONTENT_FILTER', false, 400, details);
  }
}

export class TokenLimitError extends BaseAdapterError {
  constructor(message: string, limit: number, requested: number) {
    super(message, 'TOKEN_LIMIT_EXCEEDED', false, 400, { limit, requested });
  }
}

// Base interfaces for all AI adapters
export interface ModelProviderAdapter {
  /**
   * Get the provider type this adapter handles
   */
  getProviderType(): 'openrouter' | 'vercel-gateway' | 'local' | 'cloud';

  /**
   * Test connection to the provider
   */
  testConnection(config: ProviderConnectionConfig): Promise<ConnectionTestResult>;

  /**
   * Discover available models from the provider
   */
  discoverModels(request: ModelDiscoveryRequest): Promise<ModelDiscoveryResult>;

  /**
   * Validate provider configuration
   */
  validateConfiguration(config: ProviderConnectionConfig): Promise<ConfigurationValidationResult>;

  /**
   * Get provider-specific capabilities
   */
  getCapabilities(): ProviderCapabilities;
}

export interface AIProviderAdapter {
  /**
   * Send a single chat message and get complete response
   */
  sendMessage(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Generate a complete response (alias for sendMessage)
   */
  generateResponse(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Stream chat response in real-time
   */
  streamChat(request: ChatRequest): AsyncGenerator<ChatStreamChunk>;

  /**
   * Stream response (alias for streamChat)
   */
  streamResponse(request: ChatRequest): AsyncGenerator<ChatStreamChunk>;

  /**
   * Generate a title for a conversation
   */
  generateTitle(message: string, options?: Partial<ChatOptions>): Promise<string>;

  /**
   * Check if model is available for use
   */
  isModelAvailable(modelId: string): Promise<boolean>;

  /**
   * Get model information
   */
  getModelInfo(modelId: string): Promise<ModelInfo>;

  /**
   * Estimate token count for messages
   */
  estimateTokens(messages: AIMessage[]): Promise<number>;

  /**
   * Calculate estimated cost for a request
   */
  estimateCost(request: ChatRequest): Promise<number>;
}

export interface ProviderConnectionConfig {
  apiKey?: ApiKey;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
  proxy?: ProxyConfig;
}

export interface ProxyConfig {
  host: string;
  port: number;
  auth?: {
    username: string;
    password: string;
  };
}

export interface ConfigurationValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  requiredFields: string[];
  optionalFields: string[];
  securityRecommendations: string[];
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsWebSearch: boolean;
  supportsSystemPrompts: boolean;
  maxContextLength: number;
  supportedFormats: string[];
  rateLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    requestsPerDay?: number;
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  contextLength: number;
  capabilities: string[];
  pricing?: {
    inputCostPerToken: number;
    outputCostPerToken: number;
    currency: string;
  };
  metadata?: Record<string, any>;
}

// Title generation specific types
export interface TitleGenerationRequest {
  content: string;
  conversationContext?: AIMessage[];
  options?: TitleGenerationOptions;
}

export interface TitleGenerationOptions {
  maxLength?: number;
  style?: 'descriptive' | 'concise' | 'creative';
  language?: string;
  includeEmoji?: boolean;
}

// Batch processing interfaces
export interface BatchChatRequest {
  requests: ChatRequest[];
  options?: BatchOptions;
}

export interface BatchOptions {
  concurrency?: number;
  timeoutPerRequest?: number;
  continueOnError?: boolean;
}

export interface BatchChatResponse {
  responses: (ChatResponse | AdapterError)[];
  successful: number;
  failed: number;
  totalTime: number;
}

// Health monitoring interfaces
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  checks: {
    connectivity: boolean;
    authentication: boolean;
    modelAvailability: boolean;
    rateLimits: boolean;
  };
  issues: string[];
  lastCheck: Date;
}

export interface AdapterMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  errorRate: number;
  rateLimitHits: number;
  lastError?: AdapterError;
  uptime: number;
}