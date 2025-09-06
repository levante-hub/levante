import {
  streamText,
  generateText,
  convertToModelMessages,
  UIMessage,
  stepCountIs,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGateway } from "@ai-sdk/gateway";
import { tool } from "ai";
import { z } from "zod";
import type { ProviderConfig } from "../../types/models";
import { mcpService, configManager } from "../ipc/mcpHandlers";
import type { Tool, ToolCall, ToolResult } from "../types/mcp";

export interface ChatRequest {
  messages: UIMessage[];
  model: string;
  webSearch: boolean;
  enableMCP?: boolean;
}

export interface ChatStreamChunk {
  delta?: string;
  done?: boolean;
  error?: string;
  sources?: Array<{ url: string; title?: string }>;
  reasoning?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, any>;
    status: "running" | "success" | "error";
    timestamp: number;
  };
  toolResult?: {
    id: string;
    result: any;
    status: "success" | "error";
    timestamp: number;
  };
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
    const { messages, model, webSearch, enableMCP = false } = request;

    try {
      // Get the appropriate model provider
      const modelProvider = await this.getModelProvider(model);

      // Get MCP tools if enabled
      let tools = {};
      if (enableMCP) {
        tools = await this.getMCPTools();
        console.log(
          `[AI-Stream] Passing tools to streamText:`,
          Object.keys(tools)
        );
        
        // Debug: Check for any empty or invalid tool names
        const invalidTools = Object.entries(tools).filter(([key, value]) => {
          return !key || key.trim() === '' || !value;
        });
        
        if (invalidTools.length > 0) {
          console.error('[AI-Stream] Found invalid tools:', invalidTools);
        }
        
        // Debug: Log a sample tool to see its structure
        const sampleToolKey = Object.keys(tools)[0];
        if (sampleToolKey) {
          console.log(`[AI-Stream] Sample tool structure for '${sampleToolKey}':`, (tools as any)[sampleToolKey]);
        }
      }

      const result = streamText({
        model: modelProvider,
        messages: convertToModelMessages(messages),
        tools,
        system: this.getSystemPrompt(
          webSearch,
          enableMCP,
          Object.keys(tools).length
        ),
        stopWhen: stepCountIs(5), // Allow multi-step tool calls
      });

      // Use full stream to handle tool calls
      for await (const chunk of result.fullStream) {
        //Log all chunks
        if (chunk.type !== "text-delta") {
          console.log(`[AI-Stream] Chunk type: ${chunk.type}`, chunk);
        }

        switch (chunk.type) {
          case "text-delta":
            yield { delta: chunk.text };
            break;

          case "tool-call":
            console.log(`[AI-Stream] Tool call:`, chunk);
            
            // Debug: Check if tool name is empty
            if (!chunk.toolName || chunk.toolName.trim() === '') {
              console.error('[AI-Stream] ERROR: Tool call with empty name detected!', {
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                arguments: (chunk as any).arguments,
                availableTools: Object.keys(tools)
              });
            }
            
            yield {
              toolCall: {
                id: chunk.toolCallId,
                name: chunk.toolName,
                arguments: (chunk as any).arguments || {},
                status: "running" as const,
                timestamp: Date.now(),
              },
            };
            break;

          case "tool-result":
            console.log(`[AI-Stream] Tool result RAW chunk:`, JSON.stringify(chunk, null, 2));
            console.log(`[AI-Stream] Tool result chunk.output:`, (chunk as any).output);
            console.log(`[AI-Stream] Tool result chunk keys:`, Object.keys(chunk));
            
            // Use 'output' property as per AI SDK documentation
            const toolResult = (chunk as any).output || {};
            console.log(`[AI-Stream] Final tool result being yielded:`, toolResult);
            
            yield {
              toolResult: {
                id: chunk.toolCallId,
                result: toolResult,
                status: "success" as const,
                timestamp: Date.now(),
              },
            };
            break;

          case "tool-error":
            console.error('[AI-Stream] Tool execution error:', {
              toolCallId: chunk.toolCallId,
              toolName: (chunk as any).toolName,
              error: (chunk as any).error,
              availableTools: Object.keys(tools)
            });
            
            yield {
              toolResult: {
                id: chunk.toolCallId,
                result: {
                  error: (chunk as any).error || "Tool execution failed",
                },
                status: "error" as const,
                timestamp: Date.now(),
              },
            };
            break;

          case "error":
            yield {
              error:
                typeof chunk.error === "string"
                  ? chunk.error
                  : "Unknown error occurred",
              done: true,
            };
            return;
        }
      }

      yield { done: true };
    } catch (error) {
      console.error("AI Service Error:", error);
      
      // Handle specific case where model doesn't support tool use
      if (error instanceof Error && 
          error.message.includes("No endpoints found that support tool use")) {
        console.warn(`[AI-Stream] Model '${model}' does not support tool execution. Retrying without tools...`);
        
        // Inform user and retry without tools
        yield { 
          delta: `⚠️ The model "${model}" doesn't support tool execution. Continuing with regular chat...\n\n`
        };
        
        try {
          // Retry the same request without MCP tools
          const retryRequest = { ...request, enableMCP: false };
          for await (const chunk of this.streamChat(retryRequest)) {
            yield chunk;
          }
          return;
        } catch (retryError) {
          console.error("Retry without tools also failed:", retryError);
          yield {
            error: "Failed to process request both with and without tools",
            done: true,
          };
          return;
        }
      }
      
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
    const { messages, model, webSearch, enableMCP = false } = request;

    try {
      // Get the appropriate model provider
      const modelProvider = await this.getModelProvider(model);

      // Get MCP tools if enabled
      let tools = {};
      if (enableMCP) {
        tools = await this.getMCPTools();
      }

      const result = await generateText({
        model: modelProvider,
        messages: convertToModelMessages(messages),
        tools,
        system: this.getSystemPrompt(
          webSearch,
          enableMCP,
          Object.keys(tools).length
        ),
        stopWhen: stepCountIs(5), // Allow multi-step tool calls
      });

      return {
        response: result.text,
        sources: undefined, // Sources would come from the model response if supported
        reasoning: undefined, // Reasoning would come from the model response if supported
      };
    } catch (error) {
      console.error("AI Service Error:", error);
      
      // Handle specific case where model doesn't support tool use
      if (error instanceof Error && 
          error.message.includes("No endpoints found that support tool use")) {
        console.warn(`[AI-Single] Model '${model}' does not support tool execution. Retrying without tools...`);
        
        // Retry the same request without MCP tools
        try {
          const retryRequest = { ...request, enableMCP: false };
          const retryResult = await this.sendSingleMessage(retryRequest);
          
          return {
            response: `⚠️ The model "${model}" doesn't support tool execution. Here's the response without tools:\n\n${retryResult.response}`,
            sources: retryResult.sources,
            reasoning: retryResult.reasoning
          };
        } catch (retryError) {
          console.error("Retry without tools also failed:", retryError);
          throw new Error("Failed to process request both with and without tools");
        }
      }
      
      throw new Error(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    }
  }

  private async getMCPTools(): Promise<Record<string, any>> {
    try {
      const config = await configManager.loadConfiguration();
      const allTools: Record<string, any> = {};

      for (const [serverId, serverConfig] of Object.entries(
        config.mcpServers
      )) {
        try {
          // Ensure server is connected
          if (!mcpService.isConnected(serverId)) {
            await mcpService.connectServer({
              id: serverId,
              ...serverConfig,
            });
          }

          // Get tools from this server
          const serverTools = await mcpService.listTools(serverId);

          // Convert MCP tools to AI SDK format
          for (const mcpTool of serverTools) {
            if (!mcpTool.name || mcpTool.name.trim() === "") {
              console.error(
                `[AI-SDK] Invalid tool name from server ${serverId}:`,
                mcpTool
              );
              continue;
            }

            const toolId = `${serverId}_${mcpTool.name}`;
            console.log(
              `[AI-SDK] Creating tool: ${toolId} from ${mcpTool.name}`
            );
            allTools[toolId] = this.createAISDKTool(serverId, mcpTool);
          }

          console.log(
            `Loaded ${serverTools.length} tools from MCP server: ${serverId}`
          );
        } catch (error) {
          console.error(`Error loading tools from server ${serverId}:`, error);
        }
      }

      console.log(`Total MCP tools available: ${Object.keys(allTools).length}`);
      console.log(`Tool names registered:`, Object.keys(allTools));
      return allTools;
    } catch (error) {
      console.error("Error loading MCP tools:", error);
      return {};
    }
  }

  private createAISDKTool(serverId: string, mcpTool: Tool) {
    console.log(
      `[AI-SDK] Creating AI SDK tool for: ${serverId}:${mcpTool.name}`
    );

    // Validate tool name
    if (!mcpTool.name || mcpTool.name.trim() === "") {
      throw new Error(
        `Invalid tool name for server ${serverId}: ${JSON.stringify(mcpTool)}`
      );
    }

    // Create a schema from MCP tool input schema
    let inputSchema = z.object({});

    try {
      if (mcpTool.inputSchema && mcpTool.inputSchema.properties) {
        const schemaObj: Record<string, any> = {};

        for (const [propName, propDef] of Object.entries(
          mcpTool.inputSchema.properties
        )) {
          const propInfo = propDef as any;

          // Map common schema types to Zod
          switch (propInfo.type) {
            case "string":
              schemaObj[propName] = z
                .string()
                .describe(propInfo.description || "");
              break;
            case "number":
              schemaObj[propName] = z
                .number()
                .describe(propInfo.description || "");
              break;
            case "boolean":
              schemaObj[propName] = z
                .boolean()
                .describe(propInfo.description || "");
              break;
            case "array":
              schemaObj[propName] = z
                .array(z.any())
                .describe(propInfo.description || "");
              break;
            default:
              schemaObj[propName] = z
                .any()
                .describe(propInfo.description || "");
          }

          // Handle required fields
          if (!mcpTool.inputSchema.required?.includes(propName)) {
            schemaObj[propName] = schemaObj[propName].optional();
          }
        }

        inputSchema = z.object(schemaObj);
      }
    } catch (error) {
      console.warn(`Failed to parse schema for tool ${mcpTool.name}:`, error);
    }

    const aiTool = tool({
      description: mcpTool.description || `Tool from MCP server ${serverId}`,
      inputSchema: inputSchema,
      execute: async (args: any) => {
        try {
          console.log(
            `[AI-SDK] Executing MCP tool: ${serverId}:${mcpTool.name}`,
            args
          );

          const result = await mcpService.callTool(serverId, {
            name: mcpTool.name,
            arguments: args,
          });

          console.log(
            `[AI-SDK] Raw MCP result:`,
            JSON.stringify(result, null, 2)
          );

          // Convert MCP result to string format for AI SDK
          if (result.content && Array.isArray(result.content)) {
            const resultText = result.content
              .map((item) => {
                if (item.type === "text") {
                  return item.text || "";
                } else if (item.type === "resource") {
                  return `[Resource: ${item.data}]`;
                } else {
                  return `[${item.type}: ${JSON.stringify(item.data)}]`;
                }
              })
              .join("\n");

            console.log(`[AI-SDK] Converted result text:`, resultText);

            // AI SDK expects the raw result, not wrapped in an object
            return resultText;
          }

          // For non-content results, return JSON string
          const jsonResult = JSON.stringify(result);
          console.log(`[AI-SDK] Returning JSON result:`, jsonResult);
          return jsonResult;
        } catch (error) {
          console.error(
            `Error executing MCP tool ${serverId}:${mcpTool.name}:`,
            error
          );

          // For tool execution errors, we should throw to let the AI SDK handle it
          // This will trigger the 'tool-error' event in the stream
          throw new Error(
            error instanceof Error ? error.message : "Tool execution failed"
          );
        }
      },
    });

    console.log(
      `[AI-SDK] Successfully created AI SDK tool for: ${serverId}:${mcpTool.name}`
    );
    return aiTool;
  }

  private getSystemPrompt(
    webSearch: boolean,
    enableMCP: boolean,
    toolCount: number
  ): string {
    let systemPrompt = "You are a helpful assistant";

    if (webSearch) {
      systemPrompt +=
        " with access to web search. Provide accurate and up-to-date information.";
    }

    if (enableMCP && toolCount > 0) {
      systemPrompt += ` You have access to ${toolCount} specialized tools through the Model Context Protocol (MCP). These tools can help you perform various tasks like file operations, database queries, web automation, and more. 

IMPORTANT: When you use tools, ALWAYS provide a complete response based on the tool results. After calling a tool and receiving its output, analyze the results and provide a comprehensive answer to the user. Do not just say you're going to use a tool - actually use it AND then explain the results in detail.

For example:
- If listing directories, show the actual directory contents
- If searching files, display the search results
- If querying data, present the retrieved information

Always explain what tools you're using and provide meaningful responses based on the tool outputs.`;
    }

    if (!webSearch && (!enableMCP || toolCount === 0)) {
      systemPrompt += " that can answer questions and help with tasks.";
    }

    return systemPrompt;
  }
}
