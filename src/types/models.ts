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

export interface ProviderConfig {
  id: string;
  name: string;
  type: 'openrouter' | 'vercel-gateway' | 'local' | 'cloud';
  apiKey?: string;
  baseUrl?: string;
  models: Model[];
  isActive: boolean;
  settings: Record<string, any>;
  modelSource: 'dynamic' | 'user-defined';
  lastModelSync?: number;
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