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

export interface CloudProviderModel {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  contextWindow: number;
  maxOutputTokens?: number;
  inputTokenPrice: number; // Per 1M tokens
  outputTokenPrice: number; // Per 1M tokens
  currency: string;
  capabilities: CloudModelCapability[];
  metadata: {
    family?: string;
    version?: string;
    trainingCutoff?: string;
    deprecated?: boolean;
    preview?: boolean;
  };
}

export type CloudModelCapability = 
  | 'text' 
  | 'vision' 
  | 'function_calling' 
  | 'json_mode' 
  | 'streaming' 
  | 'system_prompts'
  | 'structured_output'
  | 'code_generation'
  | 'web_search'
  | 'document_analysis';

export interface CloudProviderConfig extends ProviderConnectionConfig {
  provider: 'openai' | 'anthropic' | 'google';
  apiKey: ApiKey; // Always required for cloud providers
  organizationId?: string; // OpenAI organization
  projectId?: string; // Google project ID
  region?: string; // Google/AWS region
  baseUrl?: string; // Custom endpoint override
  apiVersion?: string; // API version
  customHeaders?: Record<string, string>;
}

export interface OpenAIConfig extends CloudProviderConfig {
  provider: 'openai';
  organizationId?: string;
  apiVersion?: '2024-02-15-preview' | '2023-12-01-preview' | 'v1';
  assistantId?: string; // For GPT Assistants API
}

export interface AnthropicConfig extends CloudProviderConfig {
  provider: 'anthropic';
  apiVersion?: '2023-06-01' | '2023-01-01';
  betaFeatures?: string[]; // Beta feature flags
}

export interface GoogleConfig extends CloudProviderConfig {
  provider: 'google';
  projectId?: string;
  region?: 'us-central1' | 'us-east1' | 'europe-west4';
  apiVersion?: 'v1' | 'v1beta';
}

export interface CloudChatRequest {
  model: string;
  messages: CloudMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number; // Google Gemini specific
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  tools?: CloudTool[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  response_format?: { type: 'text' | 'json_object' | 'json_schema' };
  system?: string; // Anthropic system prompt
  metadata?: Record<string, any>;
}

export interface CloudMessage {
  role: 'user' | 'assistant' | 'system' | 'function' | 'tool';
  content: string | CloudMessageContent[];
  name?: string;
  tool_calls?: CloudToolCall[];
  tool_call_id?: string;
}

export interface CloudMessageContent {
  type: 'text' | 'image_url' | 'image' | 'document';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
  source?: { // Anthropic format
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface CloudTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>; // JSON Schema
    strict?: boolean; // OpenAI structured outputs
  };
}

export interface CloudToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface CloudChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  provider: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: CloudToolCall[];
      refusal?: string; // OpenAI refusal
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call';
    logprobs?: CloudLogprobs;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
      accepted_prediction_tokens?: number;
      rejected_prediction_tokens?: number;
    };
  };
  system_fingerprint?: string;
}

export interface CloudStreamChunk {
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
      refusal?: string;
    };
    finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call';
    logprobs?: CloudLogprobs;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  system_fingerprint?: string;
}

export interface CloudLogprobs {
  content?: Array<{
    token: string;
    logprob: number;
    bytes: number[];
    top_logprobs: Array<{
      token: string;
      logprob: number;
      bytes: number[];
    }>;
  }>;
}

export interface CloudProviderAdapter extends ModelProviderAdapter, AIProviderAdapter {
  /**
   * Get the specific cloud provider type
   */
  getCloudProvider(): 'openai' | 'anthropic' | 'google';

  /**
   * Fetch models from cloud provider
   */
  fetchCloudModels(config: CloudProviderConfig): Promise<CloudProviderModel[]>;

  /**
   * Get specific model information from provider
   */
  getCloudModelInfo(modelId: string, config: CloudProviderConfig): Promise<CloudProviderModel>;

  /**
   * Test cloud provider authentication and connectivity
   */
  testCloudConnection(config: CloudProviderConfig): Promise<CloudConnectionResult>;

  /**
   * Stream chat with cloud provider
   */
  streamCloudChat(request: ChatRequest, config: CloudProviderConfig): AsyncGenerator<ChatStreamChunk>;

  /**
   * Get account/usage information
   */
  getAccountInfo(config: CloudProviderConfig): Promise<CloudAccountInfo>;

  /**
   * Get rate limit status
   */
  getRateLimitStatus(config: CloudProviderConfig): Promise<CloudRateLimitStatus>;

  /**
   * Get billing/usage information
   */
  getBillingInfo(config: CloudProviderConfig): Promise<CloudBillingInfo>;

  /**
   * Get model fine-tuning jobs (OpenAI)
   */
  getFineTuningJobs(config: OpenAIConfig): Promise<CloudFineTuningJob[]>;

  /**
   * Create fine-tuning job (OpenAI)
   */
  createFineTuningJob(request: CloudFineTuningRequest, config: OpenAIConfig): Promise<CloudFineTuningJob>;

  /**
   * Get embeddings
   */
  generateEmbeddings(model: string, input: string | string[], config: CloudProviderConfig): Promise<CloudEmbeddingResponse>;

  /**
   * Generate images (OpenAI DALL-E, Google Imagen)
   */
  generateImages(request: CloudImageGenerationRequest, config: CloudProviderConfig): Promise<CloudImageResponse>;

  /**
   * Transcribe audio (OpenAI Whisper)
   */
  transcribeAudio(request: CloudTranscriptionRequest, config: OpenAIConfig): Promise<CloudTranscriptionResponse>;

  /**
   * Text-to-speech (OpenAI TTS)
   */
  generateSpeech(request: CloudSpeechRequest, config: OpenAIConfig): Promise<CloudSpeechResponse>;

  /**
   * Moderate content (OpenAI Moderation)
   */
  moderateContent(input: string, config: OpenAIConfig): Promise<CloudModerationResponse>;

  /**
   * Get provider-specific capabilities
   */
  getCloudCapabilities(config: CloudProviderConfig): Promise<CloudCapabilities>;

  /**
   * Validate provider-specific configuration
   */
  validateCloudConfig(config: CloudProviderConfig): Promise<CloudConfigValidation>;

  /**
   * Get model pricing information
   */
  getModelPricing(modelId: string, config: CloudProviderConfig): Promise<CloudModelPricing>;

  /**
   * Estimate cost for request
   */
  estimateRequestCost(request: ChatRequest, config: CloudProviderConfig): Promise<number>;

  /**
   * Get provider service status
   */
  getServiceStatus(config: CloudProviderConfig): Promise<CloudServiceStatus>;

  /**
   * Create assistant (OpenAI Assistants API)
   */
  createAssistant(request: CloudAssistantRequest, config: OpenAIConfig): Promise<CloudAssistant>;

  /**
   * Get assistants (OpenAI)
   */
  getAssistants(config: OpenAIConfig): Promise<CloudAssistant[]>;

  /**
   * Create batch request (OpenAI Batch API)
   */
  createBatch(request: CloudBatchRequest, config: OpenAIConfig): Promise<CloudBatch>;

  /**
   * Get batch status
   */
  getBatch(batchId: string, config: OpenAIConfig): Promise<CloudBatch>;

  /**
   * Get model context caching info (Anthropic)
   */
  getCacheInfo(config: AnthropicConfig): Promise<AnthropicCacheInfo>;

  /**
   * Search and grounding (Google Gemini)
   */
  searchAndGround(request: GoogleSearchRequest, config: GoogleConfig): Promise<GoogleSearchResponse>;

  /**
   * Get safety settings (Google)
   */
  getSafetySettings(config: GoogleConfig): Promise<GoogleSafetySettings>;

  /**
   * Configure safety settings (Google)
   */
  setSafetySettings(settings: GoogleSafetySettings, config: GoogleConfig): Promise<void>;
}

export interface CloudConnectionResult extends ConnectionTestResult {
  provider: string;
  apiVersion: string;
  accountId?: string;
  organizationId?: string;
  projectId?: string;
  region?: string;
  supportedModels: string[];
  quotas?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    requestsPerDay?: number;
    tokensPerDay?: number;
  };
}

export interface CloudAccountInfo {
  provider: string;
  accountId: string;
  organizationId?: string;
  projectId?: string;
  tier: string;
  limits: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    requestsPerDay?: number;
    tokensPerDay?: number;
  };
  usage: {
    requestsThisMonth: number;
    tokensThisMonth: number;
    costThisMonth: number;
  };
  features: string[];
}

export interface CloudRateLimitStatus {
  requestsRemaining: number;
  tokensRemaining: number;
  requestsReset: Date;
  tokensReset: Date;
  requestsPerMinute: number;
  tokensPerMinute: number;
}

export interface CloudBillingInfo {
  provider: string;
  accountId: string;
  currency: string;
  currentMonth: {
    usage: number;
    cost: number;
    breakdown: Record<string, {
      requests: number;
      tokens: number;
      cost: number;
    }>;
  };
  lastMonth?: {
    usage: number;
    cost: number;
  };
  billingAddress?: {
    name: string;
    email: string;
    address: string;
  };
}

export interface CloudFineTuningJob {
  id: string;
  object: 'fine_tuning.job';
  created_at: number;
  finished_at?: number;
  model: string;
  fine_tuned_model?: string;
  organization_id: string;
  status: 'validating_files' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  validation_file?: string;
  training_file: string;
  hyperparameters: {
    n_epochs: number;
    batch_size?: number;
    learning_rate_multiplier?: number;
  };
  result_files?: string[];
  trained_tokens?: number;
  error?: {
    code: string;
    message: string;
  };
}

export interface CloudFineTuningRequest {
  training_file: string;
  model: string;
  validation_file?: string;
  hyperparameters?: {
    n_epochs?: number;
    batch_size?: number;
    learning_rate_multiplier?: number;
  };
  suffix?: string;
}

export interface CloudEmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface CloudImageGenerationRequest {
  prompt: string;
  model?: string; // dall-e-2, dall-e-3, imagen
  n?: number;
  size?: '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  response_format?: 'url' | 'b64_json';
  user?: string;
}

export interface CloudImageResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

export interface CloudTranscriptionRequest {
  file: File | Blob;
  model: string; // whisper-1
  language?: string;
  prompt?: string;
  response_format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  temperature?: number;
  timestamp_granularities?: ('word' | 'segment')[];
}

export interface CloudTranscriptionResponse {
  text: string;
  language?: string;
  duration?: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
  segments?: Array<{
    id: number;
    seek: number;
    start: number;
    end: number;
    text: string;
    tokens: number[];
    temperature: number;
    avg_logprob: number;
    compression_ratio: number;
    no_speech_prob: number;
  }>;
}

export interface CloudSpeechRequest {
  model: string; // tts-1, tts-1-hd
  input: string;
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  response_format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
  speed?: number;
}

export interface CloudSpeechResponse {
  audio: ArrayBuffer;
  contentType: string;
}

export interface CloudModerationResponse {
  id: string;
  model: string;
  results: Array<{
    categories: {
      hate: boolean;
      'hate/threatening': boolean;
      harassment: boolean;
      'harassment/threatening': boolean;
      'self-harm': boolean;
      'self-harm/intent': boolean;
      'self-harm/instructions': boolean;
      sexual: boolean;
      'sexual/minors': boolean;
      violence: boolean;
      'violence/graphic': boolean;
    };
    category_scores: {
      hate: number;
      'hate/threatening': number;
      harassment: number;
      'harassment/threatening': number;
      'self-harm': number;
      'self-harm/intent': number;
      'self-harm/instructions': number;
      sexual: number;
      'sexual/minors': number;
      violence: number;
      'violence/graphic': number;
    };
    flagged: boolean;
  }>;
}

export interface CloudCapabilities {
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsSystemPrompts: boolean;
  supportsJSONMode: boolean;
  supportsStructuredOutput: boolean;
  supportsFunctionCalling: boolean;
  supportsEmbeddings: boolean;
  supportsImageGeneration: boolean;
  supportsAudioTranscription: boolean;
  supportsTextToSpeech: boolean;
  supportsModeration: boolean;
  supportsFineTuning: boolean;
  supportsBatching: boolean;
  supportsAssistants: boolean;
  supportsThreads: boolean;
  maxContextLength: number;
  maxOutputTokens: number;
  supportedFormats: string[];
}

export interface CloudConfigValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  apiKeyValid: boolean;
  endpointReachable: boolean;
  authenticationValid: boolean;
  quotaAvailable: boolean;
  supportedModels: string[];
  recommendedSettings: Record<string, any>;
}

export interface CloudModelPricing {
  modelId: string;
  provider: string;
  inputTokenPrice: number; // Per 1M tokens
  outputTokenPrice: number; // Per 1M tokens
  currency: string;
  pricingTier: 'standard' | 'premium';
  lastUpdated: Date;
  specialPricing?: {
    cachedTokens?: number; // Anthropic cache pricing
    batchTokens?: number; // OpenAI batch pricing
    fineTunedMultiplier?: number;
  };
}

export interface CloudServiceStatus {
  provider: string;
  status: 'operational' | 'degraded' | 'maintenance' | 'outage';
  services: Record<string, {
    status: 'operational' | 'degraded' | 'outage';
    lastIncident?: Date;
    uptime: number; // Percentage
  }>;
  incidents: Array<{
    id: string;
    title: string;
    status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
    impact: 'minor' | 'major' | 'critical';
    createdAt: Date;
    updatedAt: Date;
    affectedServices: string[];
  }>;
  lastCheck: Date;
}

export interface CloudAssistantRequest {
  model: string;
  name?: string;
  description?: string;
  instructions?: string;
  tools?: Array<{
    type: 'code_interpreter' | 'retrieval' | 'function';
    function?: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  }>;
  file_ids?: string[];
  metadata?: Record<string, string>;
}

export interface CloudAssistant {
  id: string;
  object: 'assistant';
  created_at: number;
  name?: string;
  description?: string;
  model: string;
  instructions?: string;
  tools: Array<{
    type: 'code_interpreter' | 'retrieval' | 'function';
    function?: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  }>;
  file_ids: string[];
  metadata: Record<string, string>;
}

export interface CloudBatchRequest {
  input_file_id: string;
  endpoint: string;
  completion_window: '24h';
  metadata?: Record<string, string>;
}

export interface CloudBatch {
  id: string;
  object: 'batch';
  endpoint: string;
  errors?: {
    object: 'list';
    data: Array<{
      code: string;
      message: string;
      param?: string;
      line?: number;
    }>;
  };
  input_file_id: string;
  completion_window: string;
  status: 'validating' | 'failed' | 'in_progress' | 'finalizing' | 'completed' | 'expired' | 'cancelling' | 'cancelled';
  output_file_id?: string;
  error_file_id?: string;
  created_at: number;
  in_progress_at?: number;
  expires_at?: number;
  finalizing_at?: number;
  completed_at?: number;
  failed_at?: number;
  expired_at?: number;
  cancelling_at?: number;
  cancelled_at?: number;
  request_counts?: {
    total: number;
    completed: number;
    failed: number;
  };
  metadata?: Record<string, string>;
}

export interface AnthropicCacheInfo {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationCost: number;
  cacheReadCost: number;
  totalCacheSavings: number;
  cacheHitRate: number;
  cacheStats: {
    totalRequests: number;
    cachedRequests: number;
    cacheSize: number;
  };
}

export interface GoogleSearchRequest {
  query: string;
  model: string;
  groundingSource?: 'web' | 'vertex_ai_search';
  safetySettings?: GoogleSafetySettings;
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
  };
}

export interface GoogleSearchResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    groundingMetadata?: {
      groundingChunks: Array<{
        web: {
          uri: string;
          title: string;
        };
      }>;
      webSearchQueries: string[];
    };
    finishReason: 'FINISH_REASON_STOP' | 'FINISH_REASON_MAX_TOKENS' | 'FINISH_REASON_SAFETY' | 'FINISH_REASON_RECITATION';
    safetyRatings: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface GoogleSafetySettings {
  category: 'HARM_CATEGORY_HATE_SPEECH' | 'HARM_CATEGORY_DANGEROUS_CONTENT' | 'HARM_CATEGORY_HARASSMENT' | 'HARM_CATEGORY_SEXUALLY_EXPLICIT';
  threshold: 'HARM_BLOCK_THRESHOLD_UNSPECIFIED' | 'BLOCK_LOW_AND_ABOVE' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_NONE';
}

// Error types specific to cloud providers
export interface CloudProviderError {
  provider: string;
  code: string;
  message: string;
  type: 'authentication' | 'authorization' | 'rate_limit' | 'quota_exceeded' | 'model_not_found' | 'service_unavailable' | 'invalid_request';
  statusCode: number;
  details?: {
    requestId?: string;
    model?: string;
    quotaType?: string;
    retryAfter?: number;
  };
}

// Events for monitoring cloud provider operations
export interface CloudProviderEvent {
  type: 'request' | 'error' | 'rate_limit' | 'quota_alert' | 'cost_alert' | 'service_degradation';
  timestamp: Date;
  provider: string;
  model?: string;
  data: Record<string, any>;
}

// Configuration for cloud provider-specific features
export interface CloudProviderFeatureConfig {
  costAlerts: {
    enabled: boolean;
    dailyLimit: number;
    monthlyLimit: number;
    alertThresholds: number[]; // Percentages
  };
  quotaManagement: {
    enabled: boolean;
    reserveBuffer: number; // Percentage to reserve
    fallbackProviders: string[];
  };
  caching: {
    enabled: boolean;
    anthropicCache: boolean; // Enable Anthropic prompt caching
    ttl: number; // Cache TTL in seconds
  };
  batching: {
    enabled: boolean;
    batchSize: number;
    maxWaitTime: number; // Seconds to wait before sending batch
  };
  monitoring: {
    enabled: boolean;
    trackUsage: boolean;
    trackCosts: boolean;
    trackLatency: boolean;
  };
}