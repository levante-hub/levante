import {
  streamText,
  generateText,
  convertToModelMessages,
  UIMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

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
  private getModelProvider(modelId: string) {
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

    // Default fallback to OpenAI if no specific provider
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OpenAI API key is required as fallback. Please set OPENAI_API_KEY environment variable."
      );
    }
    return openai("gpt-5-mini");
  }

  async *streamChat(
    request: ChatRequest
  ): AsyncGenerator<ChatStreamChunk, void, unknown> {
    const { messages, model, webSearch } = request;

    try {
      // Get the appropriate model provider
      const modelProvider = this.getModelProvider(model);

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
      const modelProvider = this.getModelProvider(model);

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
