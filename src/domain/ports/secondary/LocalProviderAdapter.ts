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

export interface LocalProviderModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model?: string;
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface LocalProviderConfig extends ProviderConnectionConfig {
  baseUrl: string; // Local endpoint URL (e.g., http://localhost:11434)
  apiKey?: ApiKey; // Optional for local endpoints
  timeout?: number; // Request timeout
  keepAlive?: number; // Keep model loaded time
  customModels?: LocalCustomModel[]; // User-defined models
}

export interface LocalCustomModel {
  name: string;
  endpoint?: string; // Override endpoint for this model
  parameters?: LocalModelParameters;
  system?: string; // Default system prompt
  template?: string; // Prompt template
}

export interface LocalModelParameters {
  temperature?: number;
  top_k?: number;
  top_p?: number;
  repeat_last_n?: number;
  repeat_penalty?: number;
  seed?: number;
  num_predict?: number;
  num_ctx?: number;
  tfs_z?: number;
  typical_p?: number;
  mirostat?: number;
  mirostat_eta?: number;
  mirostat_tau?: number;
  penalize_newline?: boolean;
  stop?: string[];
}

export interface LocalProviderChatRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    images?: string[]; // Base64 encoded images
  }>;
  stream?: boolean;
  format?: 'json';
  options?: LocalModelParameters;
  template?: string;
  system?: string;
  raw?: boolean;
  keep_alive?: string | number;
}

export interface LocalProviderChatResponse {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
    images?: string[];
  };
  done_reason?: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  context?: number[];
}

export interface LocalProviderStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
  };
  done: boolean;
}

export interface LocalProviderShowResponse {
  modelfile: string;
  parameters: string;
  template: string;
  system?: string;
  details: {
    parent_model?: string;
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
  model_info: {
    [key: string]: any;
  };
}

export interface LocalProviderPushProgress {
  status: 'retrieving manifest' | 'downloading' | 'verifying sha256' | 'writing manifest' | 'success';
  digest?: string;
  total?: number;
  completed?: number;
}

export interface LocalProviderPullProgress extends LocalProviderPushProgress {}

export interface LocalProviderAdapter extends ModelProviderAdapter, AIProviderAdapter {
  /**
   * Discover available models from local provider (Ollama, etc.)
   */
  discoverLocalModels(config: LocalProviderConfig): Promise<LocalProviderModel[]>;

  /**
   * Get detailed information about a specific local model
   */
  showModel(modelName: string, config: LocalProviderConfig): Promise<LocalProviderShowResponse>;

  /**
   * Pull/download a model from repository
   */
  pullModel(modelName: string, config: LocalProviderConfig): AsyncGenerator<LocalProviderPullProgress>;

  /**
   * Push a model to repository
   */
  pushModel(modelName: string, config: LocalProviderConfig): AsyncGenerator<LocalProviderPushProgress>;

  /**
   * Delete a local model
   */
  deleteModel(modelName: string, config: LocalProviderConfig): Promise<void>;

  /**
   * Copy a model (create alias)
   */
  copyModel(source: string, destination: string, config: LocalProviderConfig): Promise<void>;

  /**
   * Create a custom model from Modelfile
   */
  createModel(name: string, modelfile: string, config: LocalProviderConfig): AsyncGenerator<LocalModelCreationProgress>;

  /**
   * List running models
   */
  listRunningModels(config: LocalProviderConfig): Promise<LocalRunningModel[]>;

  /**
   * Check if model is loaded/running
   */
  isModelRunning(modelName: string, config: LocalProviderConfig): Promise<boolean>;

  /**
   * Load a model into memory
   */
  loadModel(modelName: string, config: LocalProviderConfig, keepAlive?: string | number): Promise<void>;

  /**
   * Unload a model from memory
   */
  unloadModel(modelName: string, config: LocalProviderConfig): Promise<void>;

  /**
   * Get server information
   */
  getServerInfo(config: LocalProviderConfig): Promise<LocalServerInfo>;

  /**
   * Stream chat with local model
   */
  streamLocalChat(request: ChatRequest, config: LocalProviderConfig): AsyncGenerator<ChatStreamChunk>;

  /**
   * Generate embeddings
   */
  generateEmbeddings(model: string, prompt: string, config: LocalProviderConfig): Promise<LocalEmbeddingResponse>;

  /**
   * Test if specific model supports vision
   */
  supportsVision(modelName: string, config: LocalProviderConfig): Promise<boolean>;

  /**
   * Test if specific model supports code generation
   */
  supportsCode(modelName: string, config: LocalProviderConfig): Promise<boolean>;

  /**
   * Get model performance metrics
   */
  getModelMetrics(modelName: string, config: LocalProviderConfig): Promise<LocalModelMetrics>;

  /**
   * Optimize model for better performance
   */
  optimizeModel(modelName: string, config: LocalProviderConfig): Promise<LocalOptimizationResult>;

  /**
   * Get available model tags/versions
   */
  getModelTags(modelName: string, config: LocalProviderConfig): Promise<string[]>;

  /**
   * Search for models in registry
   */
  searchModels(query: string, config: LocalProviderConfig): Promise<LocalRegistryModel[]>;

  /**
   * Get model download progress
   */
  getDownloadProgress(config: LocalProviderConfig): Promise<LocalDownloadStatus[]>;

  /**
   * Cancel model download
   */
  cancelDownload(modelName: string, config: LocalProviderConfig): Promise<void>;

  /**
   * Validate Modelfile syntax
   */
  validateModelfile(modelfile: string): Promise<LocalModelfileValidation>;

  /**
   * Export model to file
   */
  exportModel(modelName: string, filePath: string, config: LocalProviderConfig): Promise<void>;

  /**
   * Import model from file
   */
  importModel(filePath: string, modelName: string, config: LocalProviderConfig): AsyncGenerator<LocalImportProgress>;

  /**
   * Get system resource usage
   */
  getResourceUsage(config: LocalProviderConfig): Promise<LocalResourceUsage>;

  /**
   * Configure server settings
   */
  configureServer(settings: LocalServerSettings, config: LocalProviderConfig): Promise<void>;

  /**
   * Backup models
   */
  backupModels(config: LocalProviderConfig): Promise<LocalBackupResult>;

  /**
   * Restore models from backup
   */
  restoreModels(backupPath: string, config: LocalProviderConfig): AsyncGenerator<LocalRestoreProgress>;

  /**
   * Get model compatibility info
   */
  getCompatibility(modelName: string, config: LocalProviderConfig): Promise<LocalCompatibilityInfo>;
}

export interface LocalRunningModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  details: {
    parent_model?: string;
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
  expires_at: string;
  size_vram: number;
}

export interface LocalServerInfo {
  version: string;
  build_date?: string;
  commit?: string;
  gpu: {
    available: boolean;
    devices: Array<{
      name: string;
      memory: number;
      compute_capability?: string;
    }>;
  };
  memory: {
    total: number;
    available: number;
  };
  cpu: {
    cores: number;
    model: string;
  };
  os: {
    platform: string;
    arch: string;
  };
}

export interface LocalEmbeddingResponse {
  embedding: number[];
  model: string;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  total_duration?: number;
  load_duration?: number;
}

export interface LocalModelMetrics {
  modelName: string;
  performance: {
    tokensPerSecond: number;
    averageLatency: number;
    memoryUsage: number;
    cpuUsage: number;
    gpuUsage?: number;
  };
  usage: {
    totalRequests: number;
    totalTokens: number;
    averageTokensPerRequest: number;
    uptime: number;
  };
  quality: {
    successRate: number;
    errorRate: number;
    averageResponseLength: number;
  };
}

export interface LocalOptimizationResult {
  modelName: string;
  optimizations: {
    quantization?: {
      applied: boolean;
      method: string;
      sizeReduction: number;
      performanceImpact: number;
    };
    pruning?: {
      applied: boolean;
      parametersRemoved: number;
      accuracyLoss: number;
    };
    caching?: {
      applied: boolean;
      hitRate: number;
      speedImprovement: number;
    };
  };
  beforeOptimization: LocalModelMetrics;
  afterOptimization: LocalModelMetrics;
}

export interface LocalRegistryModel {
  name: string;
  tag: string;
  description?: string;
  size: number;
  pulls: number;
  tags: string[];
  updated_at: string;
  digest: string;
}

export interface LocalDownloadStatus {
  modelName: string;
  status: 'downloading' | 'paused' | 'completed' | 'error';
  progress: {
    total: number;
    completed: number;
    percentage: number;
  };
  speed: number; // bytes per second
  eta: number; // estimated time remaining in seconds
  error?: string;
}

export interface LocalModelfileValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  parsedInstructions: Array<{
    command: string;
    parameter: string;
    line: number;
  }>;
}

export interface LocalImportProgress {
  status: 'reading' | 'validating' | 'importing' | 'success' | 'error';
  progress: number; // 0-100
  message: string;
  error?: string;
}

export interface LocalResourceUsage {
  cpu: {
    usage: number; // percentage
    cores: number;
    temperature?: number;
  };
  memory: {
    total: number;
    used: number;
    available: number;
    usage: number; // percentage
  };
  gpu?: Array<{
    name: string;
    usage: number; // percentage
    memory: {
      total: number;
      used: number;
      available: number;
    };
    temperature?: number;
  }>;
  disk: {
    total: number;
    used: number;
    available: number;
    modelsSize: number;
  };
  network: {
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
  };
}

export interface LocalServerSettings {
  maxConcurrentRequests?: number;
  keepAliveDefault?: string;
  maxModelMemory?: number;
  enableGpu?: boolean;
  gpuMemoryFraction?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  enableMetrics?: boolean;
  enableCors?: boolean;
  allowedOrigins?: string[];
}

export interface LocalBackupResult {
  backupPath: string;
  modelCount: number;
  totalSize: number;
  createdAt: Date;
  models: Array<{
    name: string;
    size: number;
    digest: string;
  }>;
}

export interface LocalRestoreProgress {
  status: 'extracting' | 'validating' | 'importing' | 'success' | 'error';
  currentModel?: string;
  progress: number; // 0-100
  message: string;
  error?: string;
}

export interface LocalCompatibilityInfo {
  modelName: string;
  isCompatible: boolean;
  requirements: {
    minRam: number;
    minDisk: number;
    recommendedRam: number;
    supportedOs: string[];
    requiresGpu: boolean;
    minGpuMemory?: number;
  };
  warnings: string[];
  recommendations: string[];
  alternatives: string[]; // Alternative compatible models
}

export interface LocalModelCreationProgress {
  status: 'parsing' | 'pulling' | 'creating' | 'success' | 'error';
  progress?: number; // 0-100
  message: string;
  error?: string;
}

// Error types specific to local providers
export interface LocalProviderError {
  code: string;
  message: string;
  type: 'connection' | 'model_not_found' | 'invalid_request' | 'resource_exhausted' | 'server_error';
  statusCode?: number;
  details?: {
    modelName?: string;
    endpoint?: string;
    resource?: string;
  };
}

// Events for monitoring local provider operations
export interface LocalProviderEvent {
  type: 'model_loaded' | 'model_unloaded' | 'download_started' | 'download_completed' | 'error' | 'resource_alert';
  timestamp: Date;
  modelName?: string;
  data: Record<string, any>;
}

// Configuration for local provider-specific features
export interface LocalProviderFeatureConfig {
  autoLoad: {
    enabled: boolean;
    modelsToKeepLoaded: string[];
    keepAliveTime: string;
  };
  resourceMonitoring: {
    enabled: boolean;
    alerts: {
      highMemoryUsage: number; // percentage
      highCpuUsage: number; // percentage
      lowDiskSpace: number; // bytes
    };
  };
  autoOptimization: {
    enabled: boolean;
    quantizeOnImport: boolean;
    cacheFrequentPrompts: boolean;
  };
  autoBackup: {
    enabled: boolean;
    schedule: string; // cron expression
    retentionDays: number;
  };
}