import {
  streamText,
  generateText,
  convertToModelMessages,
  UIMessage,
  stepCountIs,
} from "ai";
import { getLogger } from "./logging";
import { getModelProvider } from "./ai/providerResolver";
import { getMCPTools } from "./ai/mcpToolsAdapter";
import { buildSystemPrompt } from "./ai/systemPromptBuilder";
import { isToolUseNotSupportedError } from "./ai/toolErrorDetector";
import { calculateMaxSteps } from "./ai/stepsCalculator";

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

  async *streamChat(
    request: ChatRequest
  ): AsyncGenerator<ChatStreamChunk, void, unknown> {
    const { messages, model, webSearch, enableMCP = false } = request;

    try {
      // Get the appropriate model provider
      const modelProvider = await getModelProvider(model);

      // Get MCP tools if enabled
      let tools = {};
      if (enableMCP) {
        tools = await getMCPTools();
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
        system: await buildSystemPrompt(
          webSearch,
          enableMCP,
          Object.keys(tools).length
        ),
        stopWhen: stepCountIs(await calculateMaxSteps(Object.keys(tools).length)),
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

        // Log the actual model used when we receive finish-step
        if (chunk.type === "finish-step" && chunk.response) {
          this.logger.aiSdk.info("Model used in AI request", {
            requestedModelId: model,
            actualModelId: chunk.response.modelId,
            providerMetadata: chunk.response.headers
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
            // Check if this is a tool use not supported error
            const isToolUseError = isToolUseNotSupportedError(chunk.error);

            if (isToolUseError && enableMCP) {
              this.logger.aiSdk.warn("Model does not support tool execution. Retrying without tools", {
                model,
                error: chunk.error
              });

              // Inform user with clear message and retry without tools
              yield {
                delta: `⚠️ **Tool Use Not Supported**\n\nThe model "${model}" doesn't support tool/function calling, which is required for MCP integration.\n\n**Recommendation:** Choose a different model that supports tools, or disable MCP for this conversation.\n\nContinuing with regular chat (MCP disabled)...\n\n`
              };

              try {
                // Retry the same request without MCP tools
                const retryRequest = { ...request, enableMCP: false };
                for await (const retryChunk of this.streamChat(retryRequest)) {
                  yield retryChunk;
                }
                return;
              } catch (retryError) {
                this.logger.aiSdk.error("Retry without tools also failed", {
                  error: retryError,
                  model
                });
                yield {
                  error: "Failed to process request both with and without tools. Please try a different model.",
                  done: true,
                };
                return;
              }
            }

            // For other errors, extract the error message
            const errorMessage = chunk.error instanceof Error
              ? chunk.error.message
              : typeof chunk.error === "string"
                ? chunk.error
                : "Unknown error occurred";

            yield {
              error: errorMessage,
              done: true,
            };
            return;
        }
      }

      yield { done: true };
    } catch (error) {
      // Unexpected errors that aren't handled by the stream (rare)
      this.logger.aiSdk.error("Unexpected streaming error", {
        error: error instanceof Error ? error.message : error,
        model,
        enableMCP
      });

      yield {
        error: error instanceof Error ? error.message : "An unexpected error occurred",
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
      const modelProvider = await getModelProvider(model);

      // Get MCP tools if enabled
      let tools = {};
      if (enableMCP) {
        tools = await getMCPTools();
      }

      const result = await generateText({
        model: modelProvider,
        messages: convertToModelMessages(messages),
        tools,
        system: await buildSystemPrompt(
          webSearch,
          enableMCP,
          Object.keys(tools).length
        ),
        stopWhen: stepCountIs(await calculateMaxSteps(Object.keys(tools).length)),
      });

      return {
        response: result.text,
        sources: undefined,
        reasoning: undefined,
      };
    } catch (error) {
      // Extract error details for better logging
      const errorDetails: any = {};
      if (error && typeof error === 'object') {
        errorDetails.statusCode = (error as any).statusCode;
        errorDetails.responseBody = (error as any).responseBody;
        errorDetails.url = (error as any).url;
        errorDetails.data = (error as any).data;
      }

      this.logger.aiSdk.error("AI Service Error", {
        error: error instanceof Error ? error.message : error,
        errorType: error?.constructor?.name,
        model,
        enableMCP,
        messageCount: messages.length,
        ...errorDetails
      });

      // Check if this is a tool use not supported error
      const isToolUseError = isToolUseNotSupportedError(error);

      if (isToolUseError && enableMCP) {
        this.logger.aiSdk.warn(`Model '${model}' does not support tool execution. Retrying without tools...`);

        // Retry the same request without MCP tools
        try {
          const retryRequest = { ...request, enableMCP: false };
          const retryResult = await this.sendSingleMessage(retryRequest);

          return {
            response: `⚠️ **Tool Use Not Supported**\n\nThe model "${model}" doesn't support tool/function calling, which is required for MCP integration.\n\n**Recommendation:** Choose a different model that supports tools, or disable MCP for this conversation.\n\nHere's the response without tools:\n\n${retryResult.response}`,
            sources: retryResult.sources,
            reasoning: retryResult.reasoning
          };
        } catch (retryError) {
          this.logger.aiSdk.error("Retry without tools also failed", { error: retryError });
          throw new Error("Failed to process request both with and without tools. Please try a different model.");
        }
      }

      throw new Error(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    }
  }
}
