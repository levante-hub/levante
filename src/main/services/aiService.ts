import {
  streamText,
  generateText,
  convertToModelMessages,
  UIMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGateway } from "@ai-sdk/gateway";
import type { ProviderConfig } from "../../types/models";

export interface ChatRequest {
  messages: UIMessage[];
  model: string;
  webSearch: boolean;
}

export interface ChatStreamChunk {
  delta?: string;
  done?: boolean;
  error?: string;
  sources?: Array<{ url: string; title?: string }>;
  reasoning?: string;
}

export class AIService {
  private async getModelProvider(modelId: string) {
    try {
      // Get providers configuration from preferences via IPC
      // Since this is in main process, we need to simulate the IPC call
      const { preferencesService } = await import("./preferencesService");

      let providers: ProviderConfig[];
      try {
        providers =
          (preferencesService.get("providers") as ProviderConfig[]) || [];
      } catch (error) {
        console.warn("No providers found in preferences, using empty array");
        providers = [];
      }

      // If no providers configured, use fallback
      if (providers.length === 0) {
        console.log("No providers configured, using fallback provider");
        return this.getFallbackProvider(modelId);
      }

      // Find which provider this model belongs to
      const providerWithModel = providers.find((provider) =>
        provider.models.some(
          (model) => model.id === modelId && model.isSelected !== false
        )
      );

      if (!providerWithModel) {
        console.log(
          `Model ${modelId} not found in configured providers, using fallback`
        );
        return this.getFallbackProvider(modelId);
      }

      // Configure provider based on type
      switch (providerWithModel.type) {
        case "vercel-gateway":
          if (!providerWithModel.apiKey || !providerWithModel.baseUrl) {
            throw new Error(
              `Vercel AI Gateway configuration incomplete for provider ${providerWithModel.name}`
            );
          }

          // For AI calls, use /v1/ai endpoint (different from models listing endpoint)
          const gatewayApiUrl = providerWithModel.baseUrl.includes("/v1/ai")
            ? providerWithModel.baseUrl
            : providerWithModel.baseUrl.replace("/v1", "/v1/ai");

          const gateway = createGateway({
            apiKey: providerWithModel.apiKey,
            baseURL: gatewayApiUrl,
          });

          return gateway(modelId);

        case "openrouter":
          if (!providerWithModel.apiKey) {
            throw new Error(
              `OpenRouter API key missing for provider ${providerWithModel.name}`
            );
          }

          const openrouter = createOpenAICompatible({
            name: "openrouter",
            apiKey: providerWithModel.apiKey,
            baseURL: "https://openrouter.ai/api/v1",
          });

          return openrouter(modelId);

        case "local":
          if (!providerWithModel.baseUrl) {
            throw new Error(
              `Local provider endpoint missing for provider ${providerWithModel.name}`
            );
          }

          const localProvider = createOpenAICompatible({
            name: "local",
            baseURL: providerWithModel.baseUrl,
          });

          return localProvider(modelId);

        case "cloud":
          // For cloud providers, use direct SDK with environment variables
          return this.getCloudProvider(modelId);

        default:
          throw new Error(`Unknown provider type: ${providerWithModel.type}`);
      }
    } catch (error) {
      console.error("Error getting model provider configuration:", error);
      // Fallback to old behavior
      return this.getFallbackProvider(modelId);
    }
  }

  private getFallbackProvider(modelId: string) {
    if (modelId.startsWith("openai/")) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error(
          "OpenAI API key is required. Please set OPENAI_API_KEY environment variable."
        );
      }
      const modelName = modelId.replace("openai/", "");
      return openai(modelName);
    }

    if (modelId.startsWith("anthropic/")) {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error(
          "Anthropic API key is required. Please set ANTHROPIC_API_KEY environment variable."
        );
      }
      const modelName = modelId.replace("anthropic/", "");
      return anthropic(modelName);
    }

    if (modelId.startsWith("google/")) {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        throw new Error(
          "Google API key is required. Please set GOOGLE_GENERATIVE_AI_API_KEY environment variable."
        );
      }
      const modelName = modelId.replace("google/", "");
      return google(modelName);
    }

    // Default fallback
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OpenAI API key is required as fallback. Please set OPENAI_API_KEY environment variable."
      );
    }
    return openai("gpt-4o-mini");
  }

  private getCloudProvider(modelId: string) {
    if (modelId.startsWith("openai/")) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error(
          "OpenAI API key is required. Please set OPENAI_API_KEY environment variable."
        );
      }
      const modelName = modelId.replace("openai/", "");
      return openai(modelName);
    }

    if (modelId.startsWith("anthropic/")) {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error(
          "Anthropic API key is required. Please set ANTHROPIC_API_KEY environment variable."
        );
      }
      const modelName = modelId.replace("anthropic/", "");
      return anthropic(modelName);
    }

    if (modelId.startsWith("google/")) {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        throw new Error(
          "Google API key is required. Please set GOOGLE_GENERATIVE_AI_API_KEY environment variable."
        );
      }
      const modelName = modelId.replace("google/", "");
      return google(modelName);
    }

    throw new Error(`Unknown cloud provider for model: ${modelId}`);
  }

  async *streamChat(
    request: ChatRequest
  ): AsyncGenerator<ChatStreamChunk, void, unknown> {
    const { messages, model, webSearch } = request;

    try {
      // Get the appropriate model provider
      const modelProvider = await this.getModelProvider(model);

      const result = streamText({
        model: modelProvider,
        messages: convertToModelMessages(messages),
        system: webSearch
          ? "You are a helpful assistant with access to web search. Provide accurate and up-to-date information."
          : "You are a helpful assistant that can answer questions and help with tasks",
      });

      // Revert to textStream while we debug the duplication issue
      for await (const chunk of result.textStream) {
        yield { delta: chunk };
      }

      yield { done: true };
    } catch (error) {
      console.error("AI Service Error:", error);
      yield {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        done: true,
      };
    }
  }

  async sendSingleMessage(
    request: ChatRequest
  ): Promise<{ response: string; sources?: any[]; reasoning?: string }> {
    const { messages, model, webSearch } = request;

    try {
      // Get the appropriate model provider
      const modelProvider = await this.getModelProvider(model);

      const result = await generateText({
        model: modelProvider,
        messages: convertToModelMessages(messages),
        system: webSearch
          ? "You are a helpful assistant with access to web search. Provide accurate and up-to-date information."
          : "You are a helpful assistant that can answer questions and help with tasks",
      });

      return {
        response: result.text,
        sources: undefined, // Sources would come from the model response if supported
        reasoning: undefined, // Reasoning would come from the model response if supported
      };
    } catch (error) {
      console.error("AI Service Error:", error);
      throw new Error(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    }
  }
}
