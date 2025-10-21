import { getLogger } from './logging';

interface ModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

const logger = getLogger();

export class ModelFetchService {
  // Fetch OpenRouter models
  static async fetchOpenRouterModels(apiKey?: string): Promise<any[]> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      // Add authorization header only if API key is provided
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      logger.models.error("Failed to fetch OpenRouter models", { 
        error: error instanceof Error ? error.message : error,
        hasApiKey: !!apiKey 
      });
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
      logger.models.error("Failed to fetch Gateway models", { 
        error: error instanceof Error ? error.message : error,
        baseUrl,
        modelsEndpoint: baseUrl.includes('/v1/ai') ? baseUrl.replace('/v1/ai', '/v1') : baseUrl
      });
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
      logger.models.error("Failed to fetch local models", {
        error: error instanceof Error ? error.message : error,
        endpoint
      });
      throw error;
    }
  }

  // Fetch OpenAI models
  static async fetchOpenAIModels(apiKey: string): Promise<any[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data: ModelResponse = await response.json();
      return data.data || [];
    } catch (error) {
      logger.models.error("Failed to fetch OpenAI models", {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  // Fetch Google AI models
  static async fetchGoogleModels(apiKey: string): Promise<any[]> {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Google AI API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.models || [];
    } catch (error) {
      logger.models.error("Failed to fetch Google models", {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  // Fetch Anthropic models
  static async fetchAnthropicModels(apiKey: string): Promise<any[]> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      logger.models.error("Failed to fetch Anthropic models", {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  // Fetch Groq models
  static async fetchGroqModels(apiKey: string): Promise<any[]> {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.statusText}`);
      }

      const data: ModelResponse = await response.json();
      return data.data || [];
    } catch (error) {
      logger.models.error("Failed to fetch Groq models", {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  // Fetch xAI models
  static async fetchXAIModels(apiKey: string): Promise<any[]> {
    try {
      const response = await fetch('https://api.x.ai/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`xAI API error: ${response.statusText}`);
      }

      const data: ModelResponse = await response.json();
      return data.data || [];
    } catch (error) {
      logger.models.error("Failed to fetch xAI models", {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }
}