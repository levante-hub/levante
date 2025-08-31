import { AIProviderPort } from '../../../domain/ports/primary/AIProviderPort';
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
} from '../../../domain/ports/secondary/BaseAIAdapter';

/**
 * Renderer Process adapter that implements AIProviderPort
 * by communicating with Main Process via IPC
 * 
 * STUB IMPLEMENTATION - Many methods are simplified for architecture compliance
 */
export class ElectronAIProviderAdapter implements AIProviderPort {
  
  // Temporary stub for IPC - would be replaced with actual IPC implementation
  private async invokeIPC(channel: string, data?: any): Promise<{ success: boolean; data?: any; error?: string }> {
    // This is a stub - actual implementation would use proper IPC
    return { success: false, error: 'IPC not implemented in stub' };
  }

  async discoverModels(request: ModelDiscoveryRequest): Promise<ModelDiscoveryResult> {
    try {
      const result = await window.levante.invoke('levante/ai-providers/discover-models', request);
      
      if (!result.success) {
        return {
          models: []
        };
      }

      return result.data;
    } catch (error) {
      return {
        models: []
      };
    }
  }

  async testConnection(provider: string, config: any): Promise<ConnectionTestResult> {
    try {
      const result = await window.levante.invoke('levante/ai-providers/test-connection', {
        provider,
        config
      });
      
      if (!result.success) {
        return {
          success: false,
          responseTime: 0,
          testedAt: new Date(),
          error: result.error
        };
      }

      return result.data;
    } catch (error) {
      return {
        success: false,
        responseTime: 0,
        testedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async validateConfiguration(provider: string, config: any): Promise<ConfigurationValidationResult> {
    try {
      const result = await window.levante.invoke('levante/ai-providers/validate-config', {
        provider,
        config
      });
      
      if (!result.success) {
        return {
          isValid: false,
          errors: [result.error],
          warnings: [],
          requiredFields: [],
          optionalFields: [],
          securityRecommendations: []
        };
      }

      return result.data;
    } catch (error) {
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
        requiredFields: [],
        optionalFields: [],
        securityRecommendations: []
      };
    }
  }

  async getProviderCapabilities(provider: string): Promise<ProviderCapabilities> {
    try {
      const result = await window.electron.invoke('levante/ai-providers/get-capabilities', provider);
      
      if (!result.success) {
        // Return basic capabilities as fallback
        return {
          supportsStreaming: false,
          supportsTools: false,
          supportsVision: false,
          supportsWebSearch: false,
          maxContextLength: 4096,
          supportedLanguages: ['en'],
          rateLimits: {
            requestsPerMinute: 60,
            tokensPerMinute: 60000
          }
        };
      }

      return result.data;
    } catch (error) {
      return {
        supportsStreaming: false,
        supportsTools: false,
        supportsVision: false,
        supportsWebSearch: false,
        maxContextLength: 4096,
        supportedLanguages: ['en'],
        rateLimits: {
          requestsPerMinute: 60,
          tokensPerMinute: 60000
        }
      };
    }
  }

  async sendChat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const result = await window.electron.invoke('levante/ai-providers/send-chat', request);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    } catch (error) {
      throw error;
    }
  }

  async *streamChat(request: ChatRequest): AsyncGenerator<ChatStreamChunk> {
    try {
      const result = await window.electron.invoke('levante/ai-providers/stream-chat', request);
      
      if (!result.streamId) {
        throw new Error('Failed to start stream');
      }

      const streamId = result.streamId;
      
      // Listen for stream chunks
      return new Promise<AsyncGenerator<ChatStreamChunk>>((resolve, reject) => {
        const generator = this.createStreamGenerator(streamId);
        resolve(generator);
      });
    } catch (error) {
      throw error;
    }
  }

  async getProviderHealthStatus(provider: string): Promise<HealthCheckResult> {
    try {
      const result = await window.electron.invoke('levante/ai-providers/health-status', provider);
      
      if (!result.success) {
        return {
          status: 'unhealthy',
          lastChecked: new Date(),
          details: { error: result.error }
        };
      }

      return result.data;
    } catch (error) {
      return {
        status: 'unhealthy',
        lastChecked: new Date(),
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  async getProviderMetrics(provider: string): Promise<AdapterMetrics> {
    try {
      const result = await window.electron.invoke('levante/ai-providers/metrics', provider);
      
      if (!result.success) {
        return {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          totalTokensUsed: 0,
          lastReset: new Date()
        };
      }

      return result.data;
    } catch (error) {
      return {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalTokensUsed: 0,
        lastReset: new Date()
      };
    }
  }

  async listAvailableProviders(): Promise<string[]> {
    try {
      const result = await window.electron.invoke('levante/ai-providers/list');
      
      if (!result.success) {
        return [];
      }

      return result.data;
    } catch (error) {
      return [];
    }
  }

  async getModelInfo(provider: string, modelId: string, config?: any): Promise<ModelInfo> {
    try {
      const result = await window.electron.invoke('levante/ai-providers/model-info', {
        provider,
        modelId,
        config
      });
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    } catch (error) {
      throw error;
    }
  }

  async configureProvider(provider: string, config: any): Promise<void> {
    try {
      const result = await window.electron.invoke('levante/ai-providers/configure', {
        provider,
        config
      });
      
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      throw error;
    }
  }

  async getProviderConfig(provider: string): Promise<any> {
    try {
      const result = await window.electron.invoke('levante/ai-providers/get-config', provider);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return result.data;
    } catch (error) {
      throw error;
    }
  }

  // Helper method to create stream generator
  private async *createStreamGenerator(streamId: string): AsyncGenerator<ChatStreamChunk> {
    return new Promise<AsyncGenerator<ChatStreamChunk>>((resolve, reject) => {
      const generator = (async function* () {
        let streamEnded = false;
        const chunks: ChatStreamChunk[] = [];
        
        // Set up listener for stream chunks
        const handleStreamChunk = (chunk: ChatStreamChunk) => {
          if (chunk.error) {
            streamEnded = true;
            reject(new Error(chunk.error));
            return;
          }
          
          chunks.push(chunk);
          
          if (chunk.finishReason) {
            streamEnded = true;
          }
        };

        // Listen for chunks from this specific stream
        window.electron.on(`levante/ai-providers/stream/${streamId}`, handleStreamChunk);

        // Yield chunks as they arrive
        while (!streamEnded) {
          if (chunks.length > 0) {
            const chunk = chunks.shift()!;
            yield chunk;
            
            if (chunk.finishReason) {
              break;
            }
          }
          
          // Small delay to prevent tight loop
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Cleanup listener
        window.electron.removeListener(`levante/ai-providers/stream/${streamId}`, handleStreamChunk);
      })();
      
      resolve(generator);
    });
  }
}