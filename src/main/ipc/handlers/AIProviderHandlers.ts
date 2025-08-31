import { ipcMain } from 'electron';
import { getMainProcessContainer } from '../../infrastructure/container/ElectronServiceContainer';
import { AIProviderPort } from '../../../domain/ports/primary/AIProviderPort';

export function setupAIProviderHandlers() {
  const container = getMainProcessContainer();
  const aiProviderService: AIProviderPort = container.getAIProviderService();

  // Discover models from providers
  ipcMain.removeHandler('levante/ai-providers/discover-models');
  ipcMain.handle('levante/ai-providers/discover-models', async (_, request: {
    provider: string;
    config?: any;
    filters?: {
      supportsStreaming?: boolean;
      supportsTools?: boolean;
      supportsVision?: boolean;
      maxContextLength?: number;
      minContextLength?: number;
    };
  }) => {
    try {
      const result = await aiProviderService.discoverModels(request);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('[AIProviderHandlers] Failed to discover models:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Test provider connection
  ipcMain.removeHandler('levante/ai-providers/test-connection');
  ipcMain.handle('levante/ai-providers/test-connection', async (_, request: {
    provider: string;
    config: any;
  }) => {
    try {
      const result = await aiProviderService.testConnection(request.provider, request.config);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('[AIProviderHandlers] Failed to test connection:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Validate provider configuration
  ipcMain.removeHandler('levante/ai-providers/validate-config');
  ipcMain.handle('levante/ai-providers/validate-config', async (_, request: {
    provider: string;
    config: any;
  }) => {
    try {
      const result = await aiProviderService.validateConfiguration(request.provider, request.config);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('[AIProviderHandlers] Failed to validate configuration:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get provider capabilities
  ipcMain.removeHandler('levante/ai-providers/get-capabilities');
  ipcMain.handle('levante/ai-providers/get-capabilities', async (_, provider: string) => {
    try {
      const capabilities = await aiProviderService.getProviderCapabilities(provider);
      return {
        success: true,
        data: capabilities
      };
    } catch (error) {
      console.error('[AIProviderHandlers] Failed to get capabilities:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Send single chat message
  ipcMain.removeHandler('levante/ai-providers/send-chat');
  ipcMain.handle('levante/ai-providers/send-chat', async (_, request: {
    provider: string;
    model: string;
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      toolCalls?: any[];
    }>;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    config: any;
  }) => {
    try {
      const result = await aiProviderService.sendChat(request);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('[AIProviderHandlers] Failed to send chat:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Start streaming chat
  ipcMain.removeHandler('levante/ai-providers/stream-chat');
  ipcMain.handle('levante/ai-providers/stream-chat', async (event, request: {
    provider: string;
    model: string;
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      toolCalls?: any[];
    }>;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    config: any;
  }) => {
    console.log('[AIProviderHandlers] Received stream chat request:', request);
    const streamId = `stream_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 11)}`;

    // Start streaming immediately
    setTimeout(async () => {
      try {
        console.log('[AIProviderHandlers] Starting AI provider stream...');
        const streamGenerator = aiProviderService.streamChat(request);
        
        for await (const chunk of streamGenerator) {
          // Send chunk to renderer
          event.sender.send(`levante/ai-providers/stream/${streamId}`, chunk);
          
          // Small yield to prevent blocking the event loop
          await new Promise((resolve) => setImmediate(resolve));

          // Log when stream completes
          if (chunk.finishReason) {
            console.log('[AIProviderHandlers] AI provider stream completed successfully');
          }
        }
      } catch (error) {
        console.error('[AIProviderHandlers] AI provider stream error:', error);
        event.sender.send(`levante/ai-providers/stream/${streamId}`, {
          error: error instanceof Error ? error.message : 'Stream error',
          finishReason: 'error'
        });
      }
    }, 10);

    console.log('[AIProviderHandlers] Returning streamId:', streamId);
    return { streamId };
  });

  // Get provider health status
  ipcMain.removeHandler('levante/ai-providers/health-status');
  ipcMain.handle('levante/ai-providers/health-status', async (_, provider: string) => {
    try {
      const status = await aiProviderService.getProviderHealthStatus(provider);
      return {
        success: true,
        data: status
      };
    } catch (error) {
      console.error('[AIProviderHandlers] Failed to get health status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get provider metrics
  ipcMain.removeHandler('levante/ai-providers/metrics');
  ipcMain.handle('levante/ai-providers/metrics', async (_, provider: string) => {
    try {
      const metrics = await aiProviderService.getProviderMetrics(provider);
      return {
        success: true,
        data: metrics
      };
    } catch (error) {
      console.error('[AIProviderHandlers] Failed to get metrics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // List available providers
  ipcMain.removeHandler('levante/ai-providers/list');
  ipcMain.handle('levante/ai-providers/list', async () => {
    try {
      const providers = await aiProviderService.listAvailableProviders();
      return {
        success: true,
        data: providers
      };
    } catch (error) {
      console.error('[AIProviderHandlers] Failed to list providers:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get model information
  ipcMain.removeHandler('levante/ai-providers/model-info');
  ipcMain.handle('levante/ai-providers/model-info', async (_, request: {
    provider: string;
    modelId: string;
    config?: any;
  }) => {
    try {
      const modelInfo = await aiProviderService.getModelInfo(request.provider, request.modelId, request.config);
      return {
        success: true,
        data: modelInfo
      };
    } catch (error) {
      console.error('[AIProviderHandlers] Failed to get model info:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Configure provider
  ipcMain.removeHandler('levante/ai-providers/configure');
  ipcMain.handle('levante/ai-providers/configure', async (_, request: {
    provider: string;
    config: any;
  }) => {
    try {
      const result = await aiProviderService.configureProvider(request.provider, request.config);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('[AIProviderHandlers] Failed to configure provider:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get provider configuration
  ipcMain.removeHandler('levante/ai-providers/get-config');
  ipcMain.handle('levante/ai-providers/get-config', async (_, provider: string) => {
    try {
      const config = await aiProviderService.getProviderConfig(provider);
      return {
        success: true,
        data: config
      };
    } catch (error) {
      console.error('[AIProviderHandlers] Failed to get provider config:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  console.log('[AIProviderHandlers] IPC handlers registered');
}