export interface Model {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  pricing?: {
    input: number;
    output: number;
  };
  capabilities: string[];
  isAvailable: boolean;
  userDefined: boolean;
  isSelected?: boolean; // For user model selection
}

export type CloudProviderType = 'openai' | 'anthropic' | 'google' | 'groq' | 'xai';
export type ProviderType = 'openrouter' | 'vercel-gateway' | 'local' | CloudProviderType;

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiKey?: string;
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
}

export interface ModelService {
  fetchOpenRouterModels(apiKey?: string): Promise<Model[]>;
  fetchGatewayModels(apiKey: string, baseUrl: string): Promise<Model[]>;
  discoverLocalModels(endpoint: string): Promise<Model[]>;
  getUserDefinedModels(providerId: string): Promise<Model[]>;
  syncProviderModels(providerId: string): Promise<Model[]>;
  getAvailableModels(): Promise<Model[]>;
  getActiveProvider(): Promise<ProviderConfig | null>;
}