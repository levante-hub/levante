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
import { mcpHealthService } from "./mcpHealthService.js";
import type { Tool, ToolCall, ToolResult } from "../types/mcp";
import { getLogger } from "./logging";

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
  private logger = getLogger();

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
        this.logger.aiSdk.warn("No providers found in preferences, using empty array");
        providers = [];
      }

      // If no providers configured, use fallback
      if (providers.length === 0) {
        this.logger.aiSdk.info("No providers configured, using fallback provider");
        return this.getFallbackProvider(modelId);
      }

      // Find which provider this model belongs to
      const providerWithModel = providers.find((provider) =>
        provider.models.some(
          (model) => model.id === modelId && model.isSelected !== false
        )
      );

      if (!providerWithModel) {
        this.logger.aiSdk.info("Model not found in configured providers, using fallback", { 
          modelId 
        });
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
      this.logger.aiSdk.error("Error getting model provider configuration", { 
        error: error instanceof Error ? error.message : error,
        modelId 
      });
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
        this.logger.aiSdk.debug("Passing tools to streamText", {
          toolCount: Object.keys(tools).length,
          toolNames: Object.keys(tools)
        });
        
        // Debug: Check for any empty or invalid tool names
        const invalidTools = Object.entries(tools).filter(([key, value]) => {
          return !key || key.trim() === '' || !value;
        });
        
        if (invalidTools.length > 0) {
          this.logger.aiSdk.error("Found invalid tools", { invalidTools });
        }
        
        // Debug: Log a sample tool to see its structure
        const sampleToolKey = Object.keys(tools)[0];
        if (sampleToolKey) {
          this.logger.aiSdk.debug("Sample tool structure", {
            toolName: sampleToolKey,
            toolStructure: (tools as any)[sampleToolKey]
          });
        }

        // Debug: Log all tool keys being passed to AI SDK
        this.logger.aiSdk.debug("All tool keys being passed to AI SDK", {
          toolKeys: Object.keys(tools)
        });
        
        // Debug: Verify no empty keys exist
        const emptyKeys = Object.keys(tools).filter(key => !key || key.trim() === '');
        if (emptyKeys.length > 0) {
          this.logger.aiSdk.error("CRITICAL: Empty tool keys detected", { emptyKeys });
          // Remove empty keys
          emptyKeys.forEach(key => delete (tools as any)[key]);
        }

        // Additional validation: ensure all tools are valid objects
        const invalidToolObjects = Object.entries(tools).filter(([key, tool]) => {
          return !tool || typeof tool !== 'object' || typeof (tool as any).execute !== 'function';
        });

        if (invalidToolObjects.length > 0) {
          this.logger.aiSdk.error("CRITICAL: Invalid tool objects detected", {
            invalidToolNames: invalidToolObjects.map(([key]) => key)
          });
          // Remove invalid tools
          invalidToolObjects.forEach(([key]) => delete (tools as any)[key]);
        }

        this.logger.aiSdk.debug("Final tool validation passed. Tools ready for AI SDK", {
          finalToolCount: Object.keys(tools).length,
          finalToolNames: Object.keys(tools)
        });
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
        stopWhen: stepCountIs(await this.calculateMaxSteps(Object.keys(tools).length)), // Dynamic step count based on available tools
      });

      // Use full stream to handle tool calls
      for await (const chunk of result.fullStream) {
        //Log all chunks
        if (chunk.type !== "text-delta") {
          this.logger.aiSdk.debug("AI Stream chunk received", { 
            type: chunk.type, 
            chunk 
          });
        }

        switch (chunk.type) {
          case "text-delta":
            yield { delta: chunk.text };
            break;

          case "tool-call":
            this.logger.aiSdk.debug("Tool call chunk received", {
              type: chunk.type,
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              toolNameType: typeof chunk.toolName,
              toolNameLength: chunk.toolName?.length,
              hasArguments: !!(chunk as any).arguments
            });
            
            // Debug: Check if tool name is empty
            if (!chunk.toolName || chunk.toolName.trim() === '') {
              this.logger.aiSdk.error("ERROR: Tool call with empty name detected!", {
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                toolNameString: JSON.stringify(chunk.toolName),
                arguments: (chunk as any).arguments,
                availableTools: Object.keys(tools),
                fullChunk: JSON.stringify(chunk, null, 2)
              });
              
              // Don't yield this problematic tool call
              continue;
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
            this.logger.aiSdk.debug("Tool result RAW chunk", { 
              chunk: JSON.stringify(chunk, null, 2) 
            });
            this.logger.aiSdk.debug("Tool result details", {
              output: (chunk as any).output,
              chunkKeys: Object.keys(chunk)
            });
            
            // Use 'output' property as per AI SDK documentation
            const toolResult = (chunk as any).output || {};
            this.logger.aiSdk.debug("Final tool result being yielded", { toolResult });
            
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
            this.logger.aiSdk.error("Tool execution error", {
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
      this.logger.aiSdk.error("AI Service Error", { 
        error: error instanceof Error ? error.message : error,
        model,
        enableMCP,
        messageCount: messages.length
      });
      
      // Handle specific case where model doesn't support tool use
      if (error instanceof Error && 
          error.message.includes("No endpoints found that support tool use")) {
        this.logger.aiSdk.warn("Model does not support tool execution. Retrying without tools", { model });
        
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
          this.logger.aiSdk.error("Retry without tools also failed", { error: retryError });
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
        stopWhen: stepCountIs(await this.calculateMaxSteps(Object.keys(tools).length)), // Dynamic step count based on available tools
      });

      return {
        response: result.text,
        sources: undefined, // Sources would come from the model response if supported
        reasoning: undefined, // Reasoning would come from the model response if supported
      };
    } catch (error) {
      this.logger.aiSdk.error("AI Service Error", { error });
      
      // Handle specific case where model doesn't support tool use
      if (error instanceof Error && 
          error.message.includes("No endpoints found that support tool use")) {
        this.logger.aiSdk.warn(`Model '${model}' does not support tool execution. Retrying without tools...`);
        
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
          this.logger.aiSdk.error("Retry without tools also failed", { error: retryError });
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

      // ONLY iterate over mcpServers (active servers)
      // Servers in "disabled" are IGNORED completely
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
              this.logger.aiSdk.error("Invalid tool name from server", {
                serverId,
                tool: mcpTool
              });
              continue;
            }

            const toolId = `${serverId}_${mcpTool.name}`;
            this.logger.aiSdk.debug("Creating tool", { toolId, originalName: mcpTool.name });

            // Additional validation before creating tool
            if (!toolId || toolId.includes('undefined') || toolId.includes('null')) {
              this.logger.aiSdk.error("Invalid toolId detected", { toolId, tool: mcpTool });
              continue;
            }

            const aiTool = this.createAISDKTool(serverId, mcpTool);
            if (!aiTool) {
              this.logger.aiSdk.error("Failed to create AI SDK tool", { toolId });
              continue;
            }

            allTools[toolId] = aiTool;
            this.logger.aiSdk.debug("Successfully registered tool", { toolId });
          }

          this.logger.aiSdk.info("Loaded tools from MCP server", {
            toolCount: serverTools.length,
            serverId
          });
        } catch (error) {
          this.logger.aiSdk.error("Error loading tools from server", { serverId, error: error instanceof Error ? error.message : error });
          // Continue with next server instead of failing everything
        }
      }

      // Log info about disabled servers
      const disabledCount = Object.keys(config.disabled || {}).length;
      this.logger.aiSdk.debug('MCP tools loaded', {
        activeServers: Object.keys(config.mcpServers).length,
        disabledServers: disabledCount,
        toolCount: Object.keys(allTools).length
      });

      this.logger.aiSdk.info("MCP tools summary", {
        totalCount: Object.keys(allTools).length,
        toolNames: Object.keys(allTools)
      });
      return allTools;
    } catch (error) {
      this.logger.aiSdk.error("Error loading MCP tools", { error: error instanceof Error ? error.message : error });
      return {};
    }
  }

  private createAISDKTool(serverId: string, mcpTool: Tool) {
    this.logger.aiSdk.debug("Creating AI SDK tool", { serverId, toolName: mcpTool.name });

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
      this.logger.aiSdk.warn("Failed to parse schema for tool", { toolName: mcpTool.name, error });
    }

    const aiTool = tool({
      description: mcpTool.description || `Tool from MCP server ${serverId}`,
      inputSchema: inputSchema,
      execute: async (args: any) => {
        try {
          this.logger.aiSdk.debug("Executing MCP tool", { 
            serverId, 
            toolName: mcpTool.name, 
            args 
          });

          const result = await mcpService.callTool(serverId, {
            name: mcpTool.name,
            arguments: args,
          });

          this.logger.aiSdk.debug("Raw MCP result", { result });

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

            this.logger.aiSdk.debug("Converted result text", { resultText });

            // Record successful tool call
            mcpHealthService.recordSuccess(serverId, mcpTool.name);

            // AI SDK expects the raw result, not wrapped in an object
            return resultText;
          }

          // For non-content results, return JSON string
          const jsonResult = JSON.stringify(result);
          this.logger.aiSdk.debug("Returning JSON result", { jsonResult });

          // Record successful tool call
          mcpHealthService.recordSuccess(serverId, mcpTool.name);

          return jsonResult;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Tool execution failed";
          
          this.logger.aiSdk.error("Error executing MCP tool", { 
            serverId, 
            toolName: mcpTool.name, 
            error 
          });

          // Record failed tool call
          mcpHealthService.recordError(serverId, mcpTool.name, errorMessage);

          // For tool execution errors, we should throw to let the AI SDK handle it
          // This will trigger the 'tool-error' event in the stream
          throw new Error(errorMessage);
        }
      },
    });

    this.logger.aiSdk.debug("Successfully created AI SDK tool", { serverId, toolName: mcpTool.name });
    return aiTool;
  }

  private async calculateMaxSteps(toolCount: number): Promise<number> {
    // Get configuration from preferences
    let baseSteps = 5;
    let maxStepsLimit = 20;
    
    try {
      const { preferencesService } = await import('../services/preferencesService');
      const aiConfig = preferencesService.get('ai');
      
      if (aiConfig) {
        baseSteps = aiConfig.baseSteps || 5;
        maxStepsLimit = aiConfig.maxSteps || 20;
      }
    } catch (error) {
      this.logger.aiSdk.warn("Could not load steps configuration, using defaults", { error });
    }
    
    // Additional steps based on available tools
    // For every 5 tools, add 2 more steps to allow for more complex operations
    const additionalSteps = Math.floor(toolCount / 5) * 2;
    
    // Apply configured limits
    const calculatedSteps = Math.min(Math.max(baseSteps + additionalSteps, baseSteps), maxStepsLimit);
    
    this.logger.aiSdk.debug("Calculated max steps", { 
      calculatedSteps, 
      baseSteps, 
      maxStepsLimit, 
      toolCount 
    });
    
    return calculatedSteps;
  }

  private getSystemPrompt(
    webSearch: boolean,
    enableMCP: boolean,
    toolCount: number
  ): string {
    // Add current date information
    const currentDate = new Date();
    const dateString = currentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const timeString = currentDate.toLocaleTimeString('en-US', {
      hour12: true,
      hour: 'numeric',
      minute: '2-digit'
    });

    let systemPrompt = `You are a helpful assistant. Today's date is ${dateString} and the current time is ${timeString}.`;

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

    // Add Mermaid diagram capabilities
    systemPrompt += `

DIAGRAM CAPABILITIES:
You can create visual diagrams using Mermaid syntax. When users request diagrams, charts, or visual representations, use Mermaid code blocks. Supported diagram types include:

- **Flowcharts**: For processes, workflows, decision trees
- **Sequence diagrams**: For interactions between systems/users over time
- **Class diagrams**: For object-oriented designs and relationships
- **State diagrams**: For state machines and transitions  
- **ER diagrams**: For database relationships
- **Gantt charts**: For project timelines
- **Pie charts**: For data visualization
- **Git graphs**: For version control workflows

**Usage**: Wrap Mermaid code in \`\`\`mermaid code blocks. Examples:

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
\`\`\`

\`\`\`mermaid
sequenceDiagram
    Alice->>Bob: Hello Bob!
    Bob-->>Alice: Hello Alice!
\`\`\`

Always provide diagrams when users request visual representations, flowcharts, process maps, or any kind of diagram. Be proactive in offering diagrams for complex explanations.`;

    return systemPrompt;
  }
}
