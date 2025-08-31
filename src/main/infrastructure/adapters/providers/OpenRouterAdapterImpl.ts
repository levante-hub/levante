import { 
  OpenRouterAdapter,
  OpenRouterConfig,
  OpenRouterModel,
  OpenRouterModelFilters,
  OpenRouterPricing,
  OpenRouterProviderStats,
  OpenRouterRateLimits,
  OpenRouterAccountInfo,
  OpenRouterGenerationInfo,
  OpenRouterModelCapabilities,
  OpenRouterBenchmark,
  OpenRouterRanking,
  OpenRouterUsageStats,
  OpenRouterModelPreferences,
  OpenRouterConfigValidation,
  OpenRouterModerationInfo,
  OpenRouterFeature
} from '../../../../domain/ports/secondary/OpenRouterAdapter';
import {
  ModelDiscoveryRequest,
  ModelDiscoveryResult,
  ConnectionTestResult,
  ConfigurationValidationResult,
  ProviderCapabilities,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ModelInfo,
  HealthCheckResult,
  AdapterMetrics,
  AIMessage
} from '../../../../domain/ports/secondary/BaseAIAdapter';
import { Model } from '../../../../domain/entities/Model';

export class OpenRouterAdapterImpl implements OpenRouterAdapter {
  private readonly baseUrl = 'https://openrouter.ai/api/v1';

  getProviderType(): 'openrouter' {
    return 'openrouter';
  }

  async discoverModels(request: ModelDiscoveryRequest): Promise<ModelDiscoveryResult> {
    try {
      const config: OpenRouterConfig = {
        apiKey: request.apiKey,
        baseUrl: request.baseUrl
      };
      
      const openRouterModels = await this.fetchModels(config);
      
      // Convert OpenRouterModel to Model entities
      const models: Model[] = openRouterModels.map(model => 
        Model.create({
          id: model.id,
          name: model.name,
          providerId: 'openrouter',
          contextLength: model.context_length,
          capabilities: ['text', 'streaming'],
          pricing: {
            inputTokenPrice: parseFloat(model.pricing.prompt),
            outputTokenPrice: parseFloat(model.pricing.completion),
            currency: 'USD'
          },
          description: model.description
        })
      );

      return {
        models,
        metadata: {
          discoveredAt: new Date(),
          source: 'openrouter',
          totalFound: models.length,
          cached: false,
          responseTime: 0 // Would need to measure
        }
      };
    } catch (error) {
      return {
        models: [],
        metadata: {
          discoveredAt: new Date(),
          source: 'openrouter',
          totalFound: 0,
          cached: false,
          responseTime: 0
        }
      };
    }
  }

  async testConnection(config: OpenRouterConfig): Promise<ConnectionTestResult> {
    try {
      const startTime = Date.now();
      await this.fetchModels(config);
      const responseTime = Date.now() - startTime;
      
      return {
        success: true,
        responseTime,
        testedAt: new Date()
      };
    } catch (error) {
      return {
        success: false,
        responseTime: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        testedAt: new Date()
      };
    }
  }

  async validateConfiguration(config: OpenRouterConfig): Promise<ConfigurationValidationResult> {
    const validation = this.validateOpenRouterConfig(config);
    
    return {
      isValid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings,
      requiredFields: ['apiKey'],
      optionalFields: ['baseUrl', 'siteName', 'siteUrl'],
      securityRecommendations: []
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
      supportsWebSearch: false,
      supportsSystemPrompts: true,
      maxContextLength: 128000,
      supportedFormats: ['json', 'text'],
      rateLimits: {
        requestsPerMinute: 1000,
        tokensPerMinute: 1000000
      }
    };
  }

  async generateTitle(message: string, options?: any): Promise<string> {
    // Stub implementation - would normally use AI to generate titles
    return `Chat about ${message.substring(0, 30)}...`;
  }

  async isModelAvailable(modelId: string): Promise<boolean> {
    try {
      const models = await this.fetchModels();
      return models.some(model => model.id === modelId);
    } catch {
      return false;
    }
  }

  async getModelInfo(modelId: string): Promise<ModelInfo> {
    const model = await this.getModelDetails(modelId);
    return {
      id: model.id,
      name: model.name,
      description: model.description || '',
      contextLength: model.context_length,
      capabilities: model.architecture.modality === 'multimodal' ? ['text', 'streaming', 'vision'] : ['text', 'streaming'],
      pricing: {
        inputCostPerToken: parseFloat(model.pricing.prompt),
        outputCostPerToken: parseFloat(model.pricing.completion),
        currency: 'USD'
      },
      metadata: {
        provider: 'openrouter',
        architecture: model.architecture
      }
    };
  }

  async estimateTokens(messages: AIMessage[]): Promise<number> {
    // Rough estimation: ~4 characters per token
    const totalChars = messages.reduce((sum, msg) => {
      return sum + (typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length);
    }, 0);
    return Math.ceil(totalChars / 4);
  }

  async estimateCost(request: ChatRequest): Promise<number> {
    const tokenEstimate = await this.estimateTokens(request.messages);
    // Average cost estimation - would normally use model-specific pricing
    return tokenEstimate * 0.00002; // $0.00002 per token (rough average)
  }

  async *streamChat(request: ChatRequest): AsyncGenerator<ChatStreamChunk> {
    // Default config for interface compatibility
    const config: OpenRouterConfig = { apiKey: undefined };
    yield* this.streamChatSSE(request, config);
  }

  async sendChat(request: ChatRequest, config: OpenRouterConfig): Promise<ChatResponse> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey.toString()}`;
      }

      if (config.siteName) {
        headers['HTTP-Referer'] = config.siteUrl || 'https://localhost';
        headers['X-Title'] = config.siteName;
      }

      const body = {
        model: request.model,
        messages: request.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          ...(msg.toolCalls && { tool_calls: msg.toolCalls })
        })),
        stream: false,
        temperature: request.options?.temperature,
        max_tokens: request.options?.maxTokens,
        top_p: request.options?.topP,
        frequency_penalty: request.options?.frequencyPenalty,
        presence_penalty: request.options?.presencePenalty
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
      }

      const data = await response.json();
      const choice = data.choices[0];

      return {
        id: data.id,
        model: data.model,
        content: choice.message.content,
        finishReason: choice.finish_reason,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        }
      };
    } catch (error) {
      throw this.handleOpenRouterError(error);
    }
  }

  async *streamChatSSE(request: ChatRequest, config: OpenRouterConfig): AsyncGenerator<ChatStreamChunk> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey.toString()}`;
      }

      if (config.siteName) {
        headers['HTTP-Referer'] = config.siteUrl || 'https://localhost';
        headers['X-Title'] = config.siteName;
      }

      const body = {
        model: request.model,
        messages: request.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          ...(msg.toolCalls && { tool_calls: msg.toolCalls })
        })),
        stream: true,
        temperature: request.options?.temperature,
        max_tokens: request.options?.maxTokens,
        top_p: request.options?.topP,
        frequency_penalty: request.options?.frequencyPenalty,
        presence_penalty: request.options?.presencePenalty
      };

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim();
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices[0];
              
              if (choice?.delta) {
                yield {
                  id: parsed.id,
                  delta: choice.delta.content || '',
                  finishReason: choice.finish_reason,
                  done: !!choice.finish_reason
                };
              }
            } catch (e) {
              // Ignore parsing errors for individual chunks
            }
          }
        }
      }
    } catch (error) {
      throw this.handleOpenRouterError(error);
    }
  }

  async getHealthStatus(): Promise<HealthCheckResult> {
    try {
      const testResult = await this.testConnection({});
      
      return {
        status: testResult.success ? 'healthy' : 'unhealthy',
        responseTime: testResult.responseTime,
        checks: {
          connectivity: testResult.success,
          authentication: testResult.success,
          modelAvailability: testResult.success,
          rateLimits: true
        },
        issues: testResult.success ? [] : [testResult.error || 'Unknown error'],
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: 0,
        checks: {
          connectivity: false,
          authentication: false,
          modelAvailability: false,
          rateLimits: false
        },
        issues: [error instanceof Error ? error.message : 'Unknown error'],
        lastCheck: new Date()
      };
    }
  }

  async getMetrics(): Promise<AdapterMetrics> {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      errorRate: 0,
      rateLimitHits: 0,
      uptime: 0
    };
  }

  // OpenRouter-specific implementations

  async fetchModels(config?: OpenRouterConfig): Promise<OpenRouterModel[]> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      if (config?.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey.toString()}`;
      }
      
      const response = await fetch(`${this.baseUrl}/models`, {
        headers
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Failed to fetch OpenRouter models:', error);
      throw error;
    }
  }

  async getModelDetails(modelId: string, config?: OpenRouterConfig): Promise<OpenRouterModel> {
    const models = await this.fetchModels(config);
    const model = models.find(m => m.id === modelId);
    
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }
    
    return model;
  }

  async searchModels(query: string, filters?: OpenRouterModelFilters, config?: OpenRouterConfig): Promise<OpenRouterModel[]> {
    const models = await this.fetchModels(config);
    
    return models.filter(model => {
      // Text search
      const matchesQuery = !query || 
        model.id.toLowerCase().includes(query.toLowerCase()) ||
        model.name.toLowerCase().includes(query.toLowerCase()) ||
        (model.description && model.description.toLowerCase().includes(query.toLowerCase()));

      if (!matchesQuery) return false;

      // Apply filters
      if (filters?.modality && model.architecture.modality !== filters.modality) return false;
      if (filters?.minContextLength && model.context_length < filters.minContextLength) return false;
      if (filters?.maxContextLength && model.context_length > filters.maxContextLength) return false;
      if (filters?.isModerated !== undefined && model.top_provider.is_moderated !== filters.isModerated) return false;

      return true;
    });
  }

  // Stub implementations for remaining OpenRouter-specific methods
  async getModelPricing(modelId: string): Promise<OpenRouterPricing> {
    const model = await this.getModelDetails(modelId);
    return {
      prompt: parseFloat(model.pricing.prompt),
      completion: parseFloat(model.pricing.completion),
      currency: 'USD'
    };
  }

  async getProviderStats(modelId: string): Promise<OpenRouterProviderStats> {
    return {
      modelId,
      providers: [],
      topProvider: 'openai',
      totalProviders: 0
    };
  }

  async getRateLimitStatus(config: OpenRouterConfig): Promise<OpenRouterRateLimits> {
    return {
      requestsPerMinute: 1000,
      tokensPerMinute: 1000000,
      requestsRemaining: 1000,
      tokensRemaining: 1000000,
      resetTime: new Date(Date.now() + 60000),
      upgradeAvailable: false
    };
  }

  async getAccountInfo(config: OpenRouterConfig): Promise<OpenRouterAccountInfo> {
    return {
      credits: 10.0,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalCost: 0
      },
      limits: {
        requestsPerMinute: 1000,
        tokensPerMinute: 1000000,
        requestsRemaining: 1000,
        tokensRemaining: 1000000,
        resetTime: new Date(Date.now() + 60000),
        upgradeAvailable: false
      },
      tier: 'free'
    };
  }


  async getGenerationInfo(requestId: string, config: OpenRouterConfig): Promise<OpenRouterGenerationInfo> {
    return {
      id: requestId,
      model: 'unknown',
      status: 'completed',
      totalTokens: 0,
      cost: 0,
      providers: [],
      createdAt: new Date()
    };
  }

  async cancelGeneration(requestId: string, config: OpenRouterConfig): Promise<void> {
    // Stub implementation - in a real implementation would cancel the request
  }

  async getModelCapabilities(modelId: string): Promise<OpenRouterModelCapabilities> {
    return {
      maxContextLength: 128000,
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: modelId.includes('vision'),
      supportsSystemPrompts: true,
      supportedFormats: ['text', 'json'],
      modalities: modelId.includes('vision') ? ['text', 'vision'] : ['text'],
      languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh']
    };
  }

  async benchmarkModel(modelId: string, config: OpenRouterConfig): Promise<OpenRouterBenchmark> {
    return {
      modelId,
      metrics: {
        averageResponseTime: 1000,
        tokensPerSecond: 50,
        successRate: 0.95,
        errorRate: 0.05
      },
      testedAt: new Date(),
      testSize: 100
    };
  }

  async getModelRankings(category?: string): Promise<OpenRouterRanking[]> {
    return [
      {
        rank: 1,
        modelId: 'openai/gpt-4o',
        name: 'GPT-4 Optimized',
        score: 9.2,
        category: category || 'general',
        metrics: {
          performance: 9.0,
          cost: 8.0,
          popularity: 9.5
        }
      }
    ];
  }

  async getTrendingModels(timeframe?: 'hour' | 'day' | 'week' | 'month'): Promise<OpenRouterModel[]> {
    const models = await this.fetchModels();
    return models.slice(0, 10); // Return top 10 as trending
  }

  async getUsageStats(config: OpenRouterConfig, period?: 'day' | 'week' | 'month'): Promise<OpenRouterUsageStats> {
    return {
      period: period || 'day',
      totalRequests: 1000,
      totalTokens: 50000,
      totalCost: 25.0,
      modelUsage: {
        'gpt-4o': { requests: 500, tokens: 25000, cost: 12.5 },
        'claude-3': { requests: 300, tokens: 15000, cost: 7.5 },
        'llama-2': { requests: 200, tokens: 10000, cost: 5.0 }
      },
      dailyBreakdown: [
        { date: '2024-01-01', requests: 100, tokens: 5000, cost: 2.5 },
        { date: '2024-01-02', requests: 120, tokens: 6000, cost: 3.0 }
      ]
    };
  }

  async setModelPreferences(preferences: OpenRouterModelPreferences, config: OpenRouterConfig): Promise<void> {
    // Stub implementation - would save preferences to OpenRouter account
  }

  handleOpenRouterError(error: any): Error {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error?.message || error.message;
      
      switch (status) {
        case 401:
          return new Error(`OpenRouter authentication failed: ${message}`);
        case 429:
          return new Error(`OpenRouter rate limit exceeded: ${message}`);
        case 402:
          return new Error(`OpenRouter insufficient credits: ${message}`);
        case 404:
          return new Error(`OpenRouter model not found: ${message}`);
        default:
          return new Error(`OpenRouter API error (${status}): ${message}`);
      }
    }
    
    return error instanceof Error ? error : new Error('Unknown OpenRouter error');
  }

  validateOpenRouterConfig(config: OpenRouterConfig): OpenRouterConfigValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (!config.apiKey && !config.baseUrl?.includes('public')) {
      warnings.push('No API key provided - using public access with rate limits');
      suggestions.push('Add an API key for higher rate limits and priority access');
    }

    if (config.apiKey && !config.siteName) {
      suggestions.push('Add siteName and siteUrl for better analytics and debugging');
    }

    return {
      isValid: errors.length === 0,
      hasApiKey: !!config.apiKey,
      errors,
      warnings,
      suggestions,
      features: {
        publicAccess: !config.apiKey,
        rateLimitBypass: !!config.apiKey,
        analytics: !!(config.siteName && config.siteUrl),
        prioritySupport: !!config.apiKey
      }
    };
  }

  async getModerationInfo(modelId: string): Promise<OpenRouterModerationInfo> {
    return {
      modelId,
      isModerated: true,
      filters: ['violence', 'harassment', 'self-harm'],
      allowedRegions: ['US', 'EU', 'CA'],
      restrictedContent: ['adult', 'violence', 'illegal'],
      safetyRating: 8.5
    };
  }

  async supportsFeature(modelId: string, feature: OpenRouterFeature): Promise<boolean> {
    try {
      const model = await this.getModelDetails(modelId);
      
      switch (feature) {
        case 'streaming':
          return true; // Most models support streaming
        case 'vision':
          return model.architecture.modality === 'multimodal';
        case 'tools':
        case 'function_calling':
          return true; // Most modern models support tools
        case 'system_prompts':
          return true; // Standard feature
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  // Alias methods for AIProviderAdapter interface compatibility
  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    // Convert the streaming response to a complete response
    const chunks: ChatStreamChunk[] = [];
    let finalContent = '';
    let finalFinishReason: ChatStreamChunk['finishReason'] = 'stop';
    let finalUsage;

    for await (const chunk of this.streamChatSSE(request, this.defaultConfig)) {
      chunks.push(chunk);
      if (chunk.delta) {
        finalContent += chunk.delta;
      }
      if (chunk.finishReason) {
        finalFinishReason = chunk.finishReason;
      }
      if (chunk.usage) {
        finalUsage = chunk.usage;
      }
    }

    return {
      id: chunks[0]?.id || `chat_${Date.now()}`,
      model: request.model,
      content: finalContent,
      finishReason: finalFinishReason || 'stop',
      usage: finalUsage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      metadata: {}
    };
  }

  async generateResponse(request: ChatRequest): Promise<ChatResponse> {
    return this.sendMessage(request);
  }

  async *streamResponse(request: ChatRequest): AsyncGenerator<ChatStreamChunk> {
    yield* this.streamChatSSE(request, this.defaultConfig);
  }

  private get defaultConfig(): OpenRouterConfig {
    return {
      apiKey: undefined, // API key should be provided via method parameters
      baseUrl: 'https://openrouter.ai/api/v1'
    };
  }
}