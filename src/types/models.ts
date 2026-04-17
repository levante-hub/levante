import type { ModelCategory, ModelCapabilities } from './modelCategories';
import type { InferenceTask } from './inference';

export interface Model {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  pricing?: {
    input: number;
    output: number;
  };
  description?: string;
  tags?: string[];
  inputModalities?: string[];
  outputModalities?: string[];
  capabilities: string[];
  isAvailable: boolean;
  userDefined: boolean;
  isSelected?: boolean; // For user model selection
  taskType?: InferenceTask; // Inference task type (defaults to 'chat')
  inferenceProvider?: string; // HuggingFace Inference API provider slug (e.g., 'featherless-ai', 'novita', 'fireworks-ai')

  zeroDataRetention?: boolean; // Whether provider guarantees zero data retention (private inference)

  // Classification fields (computed and cached during model sync)
  category?: ModelCategory; // Computed category based on taskType, capabilities, and model ID
  computedCapabilities?: ModelCapabilities; // Computed capabilities based on category and metadata
}

export type CloudProviderType = 'openai' | 'anthropic' | 'google' | 'groq' | 'xai' | 'huggingface';
export type ProviderType = 'openrouter' | 'vercel-gateway' | 'local' | 'levante-platform' | CloudProviderType;

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiKey?: string;  // Cloud providers + optional for private local endpoints behind VPN
  baseUrl?: string;
  models: Model[]; // In-memory: full list. In storage: only selected models for 'dynamic' providers
  selectedModelIds?: string[]; // IDs of selected models (for dynamic providers, saved to disk)
  isActive: boolean;
  settings: Record<string, any>;
  modelSource: 'dynamic' | 'user-defined';
  lastModelSync?: number;
  // Cloud provider specific fields
  organizationId?: string; // For OpenAI
  projectId?: string; // For Google, Anthropic
  region?: string; // For AWS Bedrock (future)
  authMode?: 'api-key' | 'oauth'; // For providers that support subscription OAuth
}

export interface ProviderWithModels {
  provider: ProviderConfig;
  models: Model[];
  modelCount: number;
}

export interface GroupedModelsByProvider {
  providers: ProviderWithModels[];
  totalModelCount: number;
}

export interface ModelService {
  fetchOpenRouterModels(apiKey?: string): Promise<Model[]>;
  fetchGatewayModels(apiKey: string, baseUrl: string): Promise<Model[]>;
  discoverLocalModels(endpoint: string): Promise<Model[]>;
  getUserDefinedModels(providerId: string): Promise<Model[]>;
  syncProviderModels(providerId: string): Promise<Model[]>;
  getAvailableModels(): Promise<Model[]>;
  getAllProvidersWithSelectedModels(): Promise<GroupedModelsByProvider>;
  getProviderForModel(modelId: string): Promise<string | null>;
  getActiveProvider(): Promise<ProviderConfig | null>;
}
