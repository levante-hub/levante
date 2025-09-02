export interface AIRequest {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIStreamChunk {
  content: string;
  done: boolean;
  error?: string;
}

export interface OpenRouterAdapterSimple {
  sendMessage(request: AIRequest): Promise<AIResponse>;
  streamMessage(request: AIRequest): AsyncGenerator<AIStreamChunk>;
}