import {
  VercelGatewayAdapter,
  VercelGatewayConfig,
  VercelGatewayModel,
  VercelGatewayConnectionResult,
  VercelGatewayInfo,
  VercelGatewayAnalytics,
  VercelGatewayRoutingRule,
  VercelGatewayRateLimit,
  VercelGatewayRateLimitStatus,
  VercelGatewayCacheRule,
  VercelGatewayFilter,
  VercelGatewayLog,
  VercelGatewayLogOptions,
  VercelGatewayWebhook,
  VercelGatewayWebhookTest,
  VercelGatewayHealth,
  VercelGatewaySettings,
  VercelGatewayProviderStatus,
  VercelGatewayFallback,
  VercelGatewayCustomModel,
  VercelGatewayAuthValidation
} from '../../../../domain/ports/secondary/VercelGatewayAdapter';
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
  AdapterMetrics
} from '../../../../domain/ports/secondary/BaseAIAdapter';

export class VercelGatewayAdapterImpl implements VercelGatewayAdapter {

  getProviderType(): 'vercel-gateway' {
    return 'vercel-gateway';
  }

  async generateTitle(message: string, options?: any): Promise<string> {
    return `Chat about ${message.substring(0, 30)}...`;
  }

  async isModelAvailable(modelId: string): Promise<boolean> {
    try {
      const config: VercelGatewayConfig = { 
        apiKey: new (require('../../../../domain/value-objects/ApiKey').ApiKey)('default-key'),
        baseUrl: 'https://api.vercel.com/v1/ai'
      };
      const models = await this.fetchGatewayModels(config);
      return models.some(model => model.id === modelId);
    } catch {
      return false;
    }
  }

  async getModelInfo(modelId: string): Promise<ModelInfo> {
    const config: VercelGatewayConfig = { 
      apiKey: undefined,
      baseUrl: 'https://api.vercel.com/v1/ai'
    };
    const models = await this.fetchGatewayModels(config);
    const model = models.find(m => m.id === modelId);
    
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    return {
      id: model.id,
      name: model.name,
      description: model.description || '',
      contextLength: model.maxTokens,
      capabilities: model.capabilities || ['text'],
      pricing: model.pricing ? {
        inputCostPerToken: model.pricing.input,
        outputCostPerToken: model.pricing.output,
        currency: 'USD'
      } : undefined,
      metadata: {
        provider: 'vercel-gateway',
        maxTokens: model.maxTokens
      }
    };
  }

  async estimateTokens(messages: any[]): Promise<number> {
    const totalChars = messages.reduce((sum, msg) => {
      return sum + (typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length);
    }, 0);
    return Math.ceil(totalChars / 4);
  }

  async estimateCost(request: ChatRequest): Promise<number> {
    const tokenEstimate = await this.estimateTokens(request.messages);
    return tokenEstimate * 0.00002;
  }

  async discoverModels(request: ModelDiscoveryRequest): Promise<ModelDiscoveryResult> {
    try {
      const config = {
        baseUrl: request.baseUrl,
        apiKey: request.apiKey
      } as VercelGatewayConfig;
      const models = await this.fetchGatewayModels(config);
      
      const modelInfos: ModelInfo[] = models.map(model => ({
        id: model.id,
        name: model.name,
        description: model.description || '',
        contextLength: model.maxTokens,
        capabilities: model.capabilities || ['text'],
        pricing: model.pricing ? {
          inputCostPerToken: model.pricing.input,
          outputCostPerToken: model.pricing.output,
          currency: 'USD'
        } : undefined,
        metadata: {
          provider: model.provider || 'vercel-gateway',
          maxTokens: model.maxTokens,
          supportsStreaming: model.capabilities?.includes('streaming') || false,
          supportsTools: model.capabilities?.includes('tools') || false,
          supportsVision: model.capabilities?.includes('vision') || false
        }
      }));

      // Convert ModelInfo to Model entities
      const modelEntities = modelInfos.map(info => {
        const { Model } = require('../../../../domain/entities/Model');
        return Model.create({
          id: info.id,
          name: info.name,
          providerId: 'vercel-gateway',
          contextLength: info.contextLength,
          capabilities: info.capabilities,
          pricing: info.pricing ? {
            inputTokenPrice: info.pricing.inputCostPerToken,
            outputTokenPrice: info.pricing.outputCostPerToken,
            currency: info.pricing.currency
          } : undefined,
          description: info.description
        });
      });

      return {
        models: modelEntities,
        metadata: {
          discoveredAt: new Date(),
          source: 'vercel-gateway',
          totalFound: modelEntities.length,
          cached: false,
          responseTime: 0
        }
      };
    } catch (error) {
      return {
        models: [],
        metadata: {
          discoveredAt: new Date(),
          source: 'vercel-gateway',
          totalFound: 0,
          cached: false,
          responseTime: 0
        }
      };
    }
  }

  async testConnection(config: VercelGatewayConfig): Promise<ConnectionTestResult> {
    try {
      const result = await this.testGatewayConnection(config);
      
      return {
        success: result.success,
        responseTime: result.responseTime || 0,
        testedAt: new Date()
      };
    } catch (error) {
      return {
        success: false,
        responseTime: 0,
        testedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async validateConfiguration(config: VercelGatewayConfig): Promise<ConfigurationValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (!config.apiKey) {
      errors.push('API key is required for Vercel AI Gateway');
    }

    if (!config.baseUrl) {
      errors.push('Base URL is required for Vercel AI Gateway');
    } else if (!config.baseUrl.startsWith('https://')) {
      warnings.push('Using HTTP instead of HTTPS may not be secure');
    }

    if (!config.organizationId) {
      suggestions.push('Add organizationId for better request tracking');
    }

    if (!config.projectId) {
      suggestions.push('Add projectId for project-specific analytics');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      // suggestions // Property doesn't exist in ConfigurationValidationResult
      requiredFields: ['apiKey', 'baseUrl'],
      optionalFields: ['organizationId', 'projectId'],
      securityRecommendations: warnings
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

  async sendChat(request: ChatRequest, config: VercelGatewayConfig): Promise<ChatResponse> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey.toString()}`
      };

      // Add custom headers
      if (config.customHeaders) {
        Object.assign(headers, config.customHeaders);
      }

      // Add Vercel-specific headers
      if (config.organizationId) {
        headers['X-Organization-Id'] = config.organizationId;
      }
      if (config.projectId) {
        headers['X-Project-Id'] = config.projectId;
      }
      if (config.environment) {
        headers['X-Environment'] = config.environment;
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

      // Use the AI endpoint for chat completions
      const aiEndpoint = config.baseUrl.includes('/v1/ai') ? 
        config.baseUrl : 
        config.baseUrl.replace('/v1', '/v1/ai');

      const response = await fetch(`${aiEndpoint}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Vercel Gateway API error: ${response.statusText}`);
      }

      const data = await response.json();
      const choice = data.choices[0];

      return {
        id: data.id || `chat_${Date.now()}`,
        model: data.model || request.model,
        content: choice.message.content,
        finishReason: choice.finish_reason,
        toolCalls: choice.message.tool_calls || [],
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        }
      };
    } catch (error) {
      throw new Error(`Vercel Gateway error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async *streamChat(request: ChatRequest): AsyncGenerator<ChatStreamChunk> {
    // Default config for interface compatibility
    const config: VercelGatewayConfig = { 
      apiKey: undefined,
      baseUrl: 'https://api.vercel.com/v1/ai'
    };
    yield* this.streamChatWithConfig(request, config);
  }

  async *streamChatWithConfig(request: ChatRequest, config: VercelGatewayConfig): AsyncGenerator<ChatStreamChunk> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey.toString()}`
      };

      if (config.customHeaders) {
        Object.assign(headers, config.customHeaders);
      }

      if (config.organizationId) {
        headers['X-Organization-Id'] = config.organizationId;
      }
      if (config.projectId) {
        headers['X-Project-Id'] = config.projectId;
      }
      if (config.environment) {
        headers['X-Environment'] = config.environment;
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

      const aiEndpoint = config.baseUrl.includes('/v1/ai') ? 
        config.baseUrl : 
        config.baseUrl.replace('/v1', '/v1/ai');

      const response = await fetch(`${aiEndpoint}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Vercel Gateway API error: ${response.statusText}`);
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
                  id: parsed.id || 'chunk',
                  delta: choice.delta.content || '',
                  finishReason: choice.finish_reason,
                  done: choice.finish_reason !== null
                };
              }
            } catch (e) {
              // Ignore parsing errors for individual chunks
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`Vercel Gateway streaming error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getHealthStatus(): Promise<HealthCheckResult> {
    try {
      // This would typically check a specific health endpoint
      // For now, test basic connectivity
      const testResult = await this.testConnection({} as VercelGatewayConfig);
      
      return {
        status: testResult.success ? 'healthy' : 'unhealthy',
        responseTime: testResult.responseTime || 0,
        checks: {
          connectivity: testResult.success,
          authentication: testResult.success,
          modelAvailability: testResult.success,
          rateLimits: true
        },
        issues: testResult.success ? [] : [testResult.error || 'Connection failed'],
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
      totalRequests: 0, // Would need to track this
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      errorRate: 0,
      rateLimitHits: 0,
      uptime: 100
    };
  }

  // Vercel Gateway-specific implementations

  async fetchGatewayModels(config: VercelGatewayConfig): Promise<VercelGatewayModel[]> {
    try {
      // Use the models endpoint (v1, not v1/ai)
      const modelsEndpoint = config.baseUrl.includes('/v1/ai') ? 
        config.baseUrl.replace('/v1/ai', '/v1') : 
        config.baseUrl;

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${config.apiKey.toString()}`,
        'Content-Type': 'application/json'
      };

      if (config.customHeaders) {
        Object.assign(headers, config.customHeaders);
      }

      const response = await fetch(`${modelsEndpoint}/models`, {
        headers
      });

      if (!response.ok) {
        throw new Error(`Gateway API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Transform standard OpenAI-style response to VercelGatewayModel format
      return (data.data || []).map((model: any) => ({
        id: model.id,
        name: model.id, // Use ID as name if no name provided
        provider: model.owned_by || 'unknown',
        description: model.description,
        maxTokens: model.context_length || 4096,
        capabilities: [], // Would need to infer from model data
        metadata: {
          version: model.version,
          family: model.family,
          tags: model.tags || [],
          deprecated: model.deprecated || false
        }
      }));
    } catch (error) {
      console.error('Failed to fetch Gateway models:', error);
      throw error;
    }
  }

  async getGatewayModelInfo(modelId: string, config: VercelGatewayConfig): Promise<VercelGatewayModel> {
    const models = await this.fetchGatewayModels(config);
    const model = models.find(m => m.id === modelId);
    
    if (!model) {
      throw new Error(`Model ${modelId} not found in gateway`);
    }
    
    return model;
  }

  async testGatewayConnection(config: VercelGatewayConfig): Promise<VercelGatewayConnectionResult> {
    try {
      const startTime = Date.now();
      
      // Test by fetching models
      await this.fetchGatewayModels(config);
      
      const responseTime = Date.now() - startTime;
      
      return {
        success: true,
        responseTime,
        gatewayVersion: '1.0', // Would get from actual API
        supportedProviders: [], // Would get from actual API
        customFeatures: [], // Would get from actual API
        rateLimits: {
          requestsPerMinute: 1000,
          tokensPerMinute: 1000000
        },
        testedAt: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: 0,
        gatewayVersion: 'unknown',
        supportedProviders: [],
        customFeatures: [],
        rateLimits: {
          requestsPerMinute: 0,
          tokensPerMinute: 0
        },
        testedAt: new Date()
      };
    }
  }

  async *streamGatewayChat(request: ChatRequest, config: VercelGatewayConfig): AsyncGenerator<ChatStreamChunk> {
    yield* this.streamChat(request);
  }

  // Stub implementations for remaining Gateway-specific methods
  async getGatewayConfig(config: VercelGatewayConfig): Promise<VercelGatewayInfo> {
    throw new Error('Method not implemented');
  }

  async getGatewayAnalytics(config: VercelGatewayConfig, period?: string): Promise<VercelGatewayAnalytics> {
    throw new Error('Method not implemented');
  }

  async setModelRouting(rules: VercelGatewayRoutingRule[], config: VercelGatewayConfig): Promise<void> {
    throw new Error('Method not implemented');
  }

  async getModelRouting(config: VercelGatewayConfig): Promise<VercelGatewayRoutingRule[]> {
    throw new Error('Method not implemented');
  }

  async setRateLimiting(rules: VercelGatewayRateLimit[], config: VercelGatewayConfig): Promise<void> {
    throw new Error('Method not implemented');
  }

  async getRateLimitStatus(config: VercelGatewayConfig): Promise<VercelGatewayRateLimitStatus> {
    throw new Error('Method not implemented');
  }

  async setCaching(config: VercelGatewayConfig, rules: VercelGatewayCacheRule[]): Promise<void> {
    throw new Error('Method not implemented');
  }

  async clearCache(config: VercelGatewayConfig, pattern?: string): Promise<void> {
    throw new Error('Method not implemented');
  }

  async setRequestFiltering(filters: VercelGatewayFilter[], config: VercelGatewayConfig): Promise<void> {
    throw new Error('Method not implemented');
  }

  async getRequestLogs(config: VercelGatewayConfig, options?: VercelGatewayLogOptions): Promise<VercelGatewayLog[]> {
    throw new Error('Method not implemented');
  }

  async setWebhooks(webhooks: VercelGatewayWebhook[], config: VercelGatewayConfig): Promise<void> {
    throw new Error('Method not implemented');
  }

  async testWebhook(url: string, config: VercelGatewayConfig): Promise<VercelGatewayWebhookTest> {
    throw new Error('Method not implemented');
  }

  async getGatewayHealth(config: VercelGatewayConfig): Promise<VercelGatewayHealth> {
    throw new Error('Method not implemented');
  }

  async updateGatewaySettings(settings: VercelGatewaySettings, config: VercelGatewayConfig): Promise<void> {
    throw new Error('Method not implemented');
  }

  async getProviderStatus(config: VercelGatewayConfig): Promise<VercelGatewayProviderStatus[]> {
    throw new Error('Method not implemented');
  }

  async setModelFallbacks(fallbacks: VercelGatewayFallback[], config: VercelGatewayConfig): Promise<void> {
    throw new Error('Method not implemented');
  }

  async getCustomModels(config: VercelGatewayConfig): Promise<VercelGatewayCustomModel[]> {
    throw new Error('Method not implemented');
  }

  async registerCustomModel(model: VercelGatewayCustomModel, config: VercelGatewayConfig): Promise<void> {
    throw new Error('Method not implemented');
  }

  async validateGatewayAuth(config: VercelGatewayConfig): Promise<VercelGatewayAuthValidation> {
    try {
      // Test authentication by making a simple API call
      await this.fetchGatewayModels(config);
      
      return {
        isValid: true,
        organizationId: config.organizationId,
        projectId: config.projectId,
        permissions: [], // Would get from actual API
        limits: {
          requestsPerMonth: 1000000,
          tokensPerMonth: 1000000000,
          customModels: 10
        },
        features: ['models', 'chat', 'streaming']
      };
    } catch (error) {
      return {
        isValid: false,
        permissions: [],
        limits: {
          requestsPerMonth: 0,
          tokensPerMonth: 0,
          customModels: 0
        },
        features: []
      };
    }
  }

  // Alias methods for AIProviderAdapter interface compatibility
  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    // Convert the streaming response to a complete response
    const chunks: ChatStreamChunk[] = [];
    let finalContent = '';
    let finalFinishReason: ChatStreamChunk['finishReason'] = 'stop';
    let finalUsage;

    for await (const chunk of this.streamGatewayChat(request, this.defaultConfig)) {
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
    yield* this.streamGatewayChat(request, this.defaultConfig);
  }

  private get defaultConfig(): VercelGatewayConfig {
    const ApiKey = require('../../../../domain/value-objects/ApiKey').ApiKey;
    return {
      apiKey: new ApiKey('default-gateway-key'),
      baseUrl: 'https://gateway.ai.cloud.vercel.com/v1'
    };
  }
}