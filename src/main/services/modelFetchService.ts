interface ModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

export class ModelFetchService {
  // Fetch OpenRouter models
  static async fetchOpenRouterModels(apiKey: string): Promise<any[]> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
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

  // Fetch Vercel AI Gateway models
  static async fetchGatewayModels(apiKey: string, baseUrl: string = 'https://ai-gateway.vercel.sh/v1'): Promise<any[]> {
    try {
      // For model listing, always use /v1 endpoint (not /v1/ai)
      const modelsEndpoint = baseUrl.includes('/v1/ai') 
        ? baseUrl.replace('/v1/ai', '/v1') 
        : baseUrl;
        
      const response = await fetch(`${modelsEndpoint}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Gateway API error: ${response.statusText}`);
      }

      const data: ModelResponse = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Failed to fetch Gateway models:', error);
      throw error;
    }
  }

  // Fetch local models (Ollama)
  static async fetchLocalModels(endpoint: string): Promise<any[]> {
    try {
      const response = await fetch(`${endpoint}/api/tags`);
      
      if (!response.ok) {
        throw new Error(`Local API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error('Failed to fetch local models:', error);
      throw error;
    }
  }
}