import {
  streamText,
  generateText,
  convertToModelMessages,
  UIMessage,
  FileUIPart,
  stepCountIs,
  wrapLanguageModel,
  extractReasoningMiddleware,
} from "ai";
import { getLogger } from "./logging";
import { getModelProvider } from "./ai/providerResolver";
import {
  getReasoningConfig,
  buildProviderOptions,
  shouldUseReasoningMiddleware as shouldUseReasoningMiddlewareFromResolver,
} from "./ai/reasoningResolver";
import type { ProviderConfig } from "../../types/models";
import type { ReasoningConfig } from "../../types/reasoning";
import { getMCPTools } from "./ai/mcpToolsAdapter";
import { buildSystemPrompt } from "./ai/systemPromptBuilder";
import { isToolUseNotSupportedError } from "./ai/toolErrorDetector";
import { calculateMaxSteps } from "./ai/stepsCalculator";
import { InferenceDispatcher } from "./inference/InferenceDispatcher";
import { attachmentStorage } from "./attachmentStorage";
import { pdfExtractionService } from "./pdfExtractionService";
import type { InferenceTask, HFChatMessage } from "../../types/inference";
import { classifyModel, getSessionType } from "../../utils/modelClassification";
import type {
  ModelCategory,
  ModelCapabilities,
} from "../../types/modelCategories";

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
  reasoningText?: string;
  reasoningId?: string; // Stable ID for reasoning block reconciliation
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
  generatedAttachment?: {
    type: "image" | "audio" | "video";
    mime: string;
    dataUrl: string;
    filename: string;
  };
}

type RendererAttachmentPayload = {
  type?: string;
  data?: string;
  mime?: string;
  filename?: string;
};

type AttachmentAwareUIMessage = UIMessage & {
  attachments?: RendererAttachmentPayload[];
};

/**
 * Sanitize messages for model consumption.
 * Handles known Vercel AI SDK issues:
 * - Issue #8431: Deep clone to avoid object reference issues
 * - Issue #8061: Remove providerExecuted when null
 * - Issue #9731: Remove providerMetadata (except Google's thoughtSignature)
 * - Remove uiResources from tool results (MCP-UI specific)
 *
 * IMPORTANT: Google's thoughtSignature MUST be preserved for Gemini 3 tool calling.
 * Without it, multi-turn tool calls fail with "function call is missing a thought_signature".
 */
function sanitizeMessagesForModel(messages: UIMessage[]): UIMessage[] {
  // Deep clone to avoid reference issues (GitHub Issue #8431)
  // This also cleans circular references and converts to plain objects
  const clonedMessages = JSON.parse(JSON.stringify(messages));

  return clonedMessages.map((message: any) => {
    const parts = message.parts;
    if (!Array.isArray(parts)) return message;

    const sanitizedParts = parts.map((part: any) => {
      if (!part) return part;

      // Remove providerExecuted if null (GitHub Issue #8061)
      // Databases like MongoDB convert undefined to null, causing validation errors
      if ('providerExecuted' in part && part.providerExecuted === null) {
        const { providerExecuted, ...partWithoutProvider } = part;
        part = partWithoutProvider;
      }

      // Handle providerMetadata carefully (GitHub Issue #9731)
      // IMPORTANT: Google's thoughtSignature MUST be preserved for Gemini 3 tool calling
      // Without thoughtSignature, Gemini 3 fails with "function call is missing a thought_signature"
      if ('providerMetadata' in part && part.providerMetadata) {
        const metadata = part.providerMetadata as Record<string, unknown>;
        // Check if this is Google metadata with thoughtSignature - preserve it
        const googleMeta = metadata.google as Record<string, unknown> | undefined;
        const vertexMeta = metadata.vertex as Record<string, unknown> | undefined;
        const hasThoughtSignature = googleMeta?.thoughtSignature || vertexMeta?.thoughtSignature;

        if (hasThoughtSignature) {
          // Keep providerMetadata intact for Gemini 3 thought_signatures
          // The SDK needs this to maintain conversation context for multi-turn tool calls
        } else {
          // For other providers, remove providerMetadata to avoid conversion issues
          const { providerMetadata, ...partWithoutMetadata } = part;
          part = partWithoutMetadata;
        }
      }

      // Sanitize tool invocation outputs that contain uiResources (MCP-UI)
      // According to MCP spec 2025-11-25:
      // - structuredContent → SEND to LLM (structured JSON for processing)
      // - content → SEND to LLM (text for backwards compatibility)
      // - _meta → NEVER send (client metadata, may contain secrets like game words)
      // - uiResources → NEVER send (only for widget rendering)
      // Note: Tool parts can have type 'tool-invocation' or 'tool-{toolName}' depending on source
      const isToolWithOutput = (
        // AI SDK format: tool-invocation with output-available state
        (// Stored format: tool-{name} with output-available state
        ((part?.type === 'tool-invocation' && part?.state === 'output-available') || (part?.type?.startsWith('tool-') && part?.type !== 'tool-invocation' && part?.state === 'output-available')))
      );
      if (isToolWithOutput && part.output) {
        const output = part.output;
        if (output && typeof output === 'object' && 'uiResources' in output) {
          // Build clean output for LLM - include structuredContent and content text
          // but strip _meta (client metadata) and uiResources (widget rendering)
          const cleanOutput: Record<string, unknown> = {};

          // 1. Include structuredContent if present (MCP spec: structured JSON for LLM)
          if (output.structuredContent) {
            cleanOutput.structuredContent = output.structuredContent;
          }

          // 2. Extract text from content array (MCP spec: for backwards compatibility)
          if (Array.isArray(output.content)) {
            const contentTexts = output.content
              .filter((item: any) => item?.type === 'text' && item?.text)
              .map((item: any) => item.text);

            if (contentTexts.length > 0) {
              cleanOutput.text = contentTexts.join('\n');
            }
          }

          // Fallback to output.text if content array didn't provide text
          if (!cleanOutput.text && output.text) {
            cleanOutput.text = output.text;
          }

          // If we have structuredContent, return it (preferred by LLM)
          // Otherwise fall back to text, or a placeholder
          let outputForModel: unknown;
          if (cleanOutput.structuredContent) {
            // LLM can work with structured data directly
            outputForModel = cleanOutput.structuredContent;
          } else if (cleanOutput.text) {
            outputForModel = cleanOutput.text;
          } else {
            outputForModel = '[Widget rendered]';
          }

          return {
            ...part,
            output: outputForModel,
          };
        }
      }
      return part;
    });

    return {
      ...message,
      parts: sanitizedParts,
    };
  }) as UIMessage[];
}

/**
 * Check if model should use reasoning middleware for <think> tag extraction.
 * DeepSeek R1 models use <think></think> tags to wrap reasoning content.
 * Delegates to reasoningResolver for centralized model pattern management.
 *
 * @param modelId - The model identifier (e.g., "deepseek-r1", "deepseek-reasoner")
 * @returns true if middleware should be applied
 */
function shouldUseReasoningMiddleware(modelId: string): boolean {
  return shouldUseReasoningMiddlewareFromResolver(modelId);
}

/**
 * Wrap model with extractReasoningMiddleware to extract reasoning from tags.
 *
 * Configuration:
 * - tagName: 'think' - DeepSeek R1 uses <think> tags
 * - startWithReasoning: true - For third-party providers like Together AI
 *
 * @param model - The language model to wrap
 * @param modelId - Model ID for logging
 * @returns Wrapped model with middleware
 */
function wrapModelForReasoning(model: any, modelId: string) {
  return wrapLanguageModel({
    model,
    middleware: extractReasoningMiddleware({
      tagName: 'think',
      startWithReasoning: true,
    }),
  });
}

/**
 * Get provider-specific options for reasoning models.
 * Uses the centralized reasoningResolver for multi-provider support.
 *
 * Priority for configuration:
 * 1. Provider-specific settings (provider.settings.reasoning)
 * 2. Global AI preferences (aiConfig.reasoning)
 * 3. Default (adaptive mode)
 *
 * @param modelId - The model identifier
 * @param provider - The provider configuration (optional, for provider-specific settings)
 * @param hasTools - Whether the request has tools (affects some model thinking behavior)
 * @returns Provider options object or undefined
 */
async function getReasoningProviderOptions(
  modelId: string,
  provider?: ProviderConfig,
  hasTools: boolean = false
): Promise<any> {
  const logger = getLogger();

  try {
    // Get global reasoning config from AI preferences
    const { preferencesService } = await import("./preferencesService");
    const aiConfig = preferencesService.get('ai') as { reasoningText?: ReasoningConfig } | undefined;
    const globalReasoningConfig = aiConfig?.reasoningText;

    // If no provider passed, try to find it
    let resolvedProvider = provider;
    if (!resolvedProvider) {
      const providers = (preferencesService.get("providers") as ProviderConfig[]) || [];
      resolvedProvider = providers.find((p) => {
        if (p.modelSource === "dynamic") {
          return p.selectedModelIds?.includes(modelId);
        } else {
          return p.models.some(
            (model) => model.id === modelId && model.isSelected !== false
          );
        }
      });
    }

    // Get reasoning config with priority resolution
    const reasoningConfig = resolvedProvider
      ? getReasoningConfig(modelId, resolvedProvider, globalReasoningConfig)
      : globalReasoningConfig;

    if (!reasoningConfig || reasoningConfig.mode === 'disabled') {
      logger.aiSdk.debug('Reasoning disabled or no config', { modelId });
      return undefined;
    }

    // Build provider-specific options
    const providerType = resolvedProvider?.type;
    if (!providerType) {
      logger.aiSdk.debug('No provider type found, cannot build reasoning options', { modelId });
      return undefined;
    }

    return buildProviderOptions(reasoningConfig, providerType, modelId, hasTools);
  } catch (error) {
    logger.aiSdk.error('Error getting reasoning provider options', {
      error: error instanceof Error ? error.message : error,
      modelId,
    });
    return undefined;
  }
}

export class AIService {
  private logger = getLogger();

  /**
   * Convert dataURL to Blob for inference API
   */
  private async dataURLToBlob(dataURL: string): Promise<Blob> {
    // Handle both data URLs and direct base64
    if (!dataURL.startsWith("data:")) {
      // Assume it's base64, add data URL prefix
      dataURL = `data:image/png;base64,${dataURL}`;
    }

    const response = await fetch(dataURL);
    return await response.blob();
  }

  /**
   * Convert UI messages to HF chat messages for inference chatCompletion calls
   */
  private buildHFChatMessages(messages: UIMessage[]): HFChatMessage[] {
    return messages.map((message) => {
      const textSegments: string[] = [];
      const parts = (message as any).parts;

      if (Array.isArray(parts) && parts.length > 0) {
        parts.forEach((part: any) => {
          if (part?.type === "text" && typeof part.text === "string") {
            textSegments.push(part.text);
          }
        });
      } else if (typeof (message as any).content === "string") {
        textSegments.push((message as any).content);
      } else if (Array.isArray((message as any).content)) {
        textSegments.push(
          (message as any).content
            .map((part: any) => part?.text || "")
            .filter(Boolean)
            .join("\n")
        );
      } else if (typeof (message as any).text === "string") {
        textSegments.push((message as any).text);
      }

      return {
        role: (message.role as HFChatMessage["role"]) || "user",
        content: textSegments.filter(Boolean).join("\n"),
      };
    });
  }

  /**
   * Attach renderer-provided files to UI message parts so convertToModelMessages forwards them.
   */
  private async includeAttachmentsInMessageParts(
    messages: UIMessage[],
    modelCapabilities?: ModelCapabilities
  ): Promise<UIMessage[]> {
    const processedMessages = [];

    for (const message of messages) {
      if (message.role !== "user") {
        processedMessages.push(message);
        continue;
      }

      const attachments = (message as AttachmentAwareUIMessage).attachments;
      if (!attachments?.length) {
        processedMessages.push(message);
        continue;
      }

      const fileParts = (
        await Promise.all(
          attachments.map((attachment) =>
            this.convertAttachmentToFilePart(attachment, modelCapabilities)
          )
        )
      ).filter((part): part is FileUIPart | { type: "text"; text: string } =>
        Boolean(part)
      );

      if (fileParts.length === 0) {
        processedMessages.push(message);
        continue;
      }

      const existingParts = Array.isArray(message.parts)
        ? [...message.parts]
        : [];
      processedMessages.push({
        ...message,
        parts: [...existingParts, ...fileParts],
      });
    }

    return processedMessages;
  }

  /**
   * Handle PDF attachment: either send as file (native) or extract text
   */
  private async handlePDFAttachment(
    attachment: RendererAttachmentPayload,
    modelCapabilities?: ModelCapabilities
  ): Promise<FileUIPart | { type: "text"; text: string } | null> {
    this.logger.aiSdk.debug('Handling PDF attachment', {
      filename: attachment.filename,
      hasData: !!attachment.data,
      dataLength: attachment.data?.length || 0,
      supportsVision: modelCapabilities?.supportsVision,
      mime: attachment.mime,
    });

    // Strategy 1: Native PDF support (if model supports vision/images, as roughly proxied)
    // User requested to use 'vision' capability as proxy for PDF support
    if (modelCapabilities?.supportsVision) {
      this.logger.aiSdk.info('Using native PDF support (model supports vision)', {
        filename: attachment.filename,
      });

      const mediaType = "application/pdf";
      const url = attachment.data?.startsWith("data:")
        ? attachment.data
        : `data:${mediaType};base64,${attachment.data || ""}`;

      return {
        type: "file",
        mediaType,
        filename: attachment.filename || "document.pdf",
        url,
      };
    }

    // Strategy 2: Extract text and send as context
    if (!attachment.data) {
      this.logger.aiSdk.warn('PDF attachment has no data', {
        filename: attachment.filename,
      });
      return null;
    }

    this.logger.aiSdk.info('Extracting text from PDF (model does not support vision)', {
      filename: attachment.filename,
    });

    try {
      const base64Data = attachment.data.replace(
        /^data:application\/pdf;base64,/,
        ""
      );
      const buffer = Buffer.from(base64Data, "base64");

      this.logger.aiSdk.debug('Buffer created from base64 data', {
        bufferLength: buffer.length,
        filename: attachment.filename,
      });

      const result = await pdfExtractionService.extractText(buffer, {
        maxLength: 50000,
      });

      if (!result.success) {
        this.logger.aiSdk.warn("PDF extraction failed", {
          filename: attachment.filename,
          error: result.error,
          isPasswordProtected: result.isPasswordProtected,
        });
        return {
          type: "text",
          text: `[PDF extraction failed for ${attachment.filename}: ${result.error}]`,
        };
      }

      this.logger.aiSdk.info('PDF extraction successful', {
        filename: attachment.filename,
        pages: result.pages,
        textLength: result.text?.length || 0,
      });

      let header = '=== PDF DOCUMENT ===\n';
      header += `File: ${attachment.filename}\n`;

      if (result.info) {
        if (result.info.Title) {
          header += `Title: ${result.info.Title}\n`;
        }
        if (result.info.Author) {
          header += `Author: ${result.info.Author}\n`;
        }
      }

      header += `Pages: ${result.pages}\n`;

      return {
        type: "text",
        text: `${header}\n${result.text}`,
      };
    } catch (error) {
      this.logger.aiSdk.error("Error processing PDF attachment", {
        error: error instanceof Error ? error.message : error,
        filename: attachment.filename,
      });
      return null;
    }
  }

  /**
   * Convert renderer attachment payloads into AI SDK file parts (currently images only).
   */
  private async convertAttachmentToFilePart(
    attachment: RendererAttachmentPayload | undefined,
    modelCapabilities?: ModelCapabilities
  ): Promise<FileUIPart | { type: "text"; text: string } | null> {
    if (!attachment || !attachment.data) {
      this.logger.aiSdk.debug("Skipping attachment without data payload", {
        attachmentType: attachment?.type,
        filename: attachment?.filename,
      });
      return null;
    }

    const mediaType =
      attachment.mime ||
      this.inferMimeTypeFromFilename(attachment.filename) ||
      "application/octet-stream";

    // Handle PDFs
    if (mediaType === "application/pdf") {
      return this.handlePDFAttachment(attachment, modelCapabilities);
    }

    if (!mediaType.startsWith("image/")) {
      this.logger.aiSdk.debug(
        "Attachment media type not yet supported for chat providers",
        {
          mediaType,
          filename: attachment.filename,
        }
      );
      return null;
    }

    const url = attachment.data.startsWith("data:")
      ? attachment.data
      : `data:${mediaType};base64,${attachment.data}`;

    return {
      type: "file",
      mediaType,
      filename: attachment.filename || "image",
      url,
    };
  }

  private inferMimeTypeFromFilename(filename?: string): string | undefined {
    if (!filename || !filename.includes(".")) {
      return undefined;
    }

    const extension = filename.split(".").pop()?.toLowerCase();
    switch (extension) {
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "png":
        return "image/png";
      case "gif":
        return "image/gif";
      case "webp":
        return "image/webp";
      case "bmp":
        return "image/bmp";
      case "pdf":
        return "application/pdf";
      default:
        return undefined;
    }
  }

  /**
   * Find the last generated image from assistant messages in the conversation.
   * This is used for image-to-image models when no new image is attached,
   * allowing users to iteratively edit the last generated image.
   */
  private async findLastGeneratedImage(
    messages: UIMessage[]
  ): Promise<{ data: string; filename: string } | null> {
    // Search messages in reverse order (most recent first)
    const reversedMessages = [...messages].reverse();

    for (const message of reversedMessages) {
      if (message.role !== "assistant") continue;

      const attachments = (message as any).attachments;
      if (!attachments || !Array.isArray(attachments)) continue;

      // Find the first image attachment
      const imageAttachment = attachments.find(
        (att: any) => att.type === "image"
      );

      if (imageAttachment) {
        this.logger.aiSdk.debug("Found previous generated image", {
          messageId: message.id,
          filename: imageAttachment.filename,
          hasPath: !!imageAttachment.path,
          hasStoragePath: !!imageAttachment.storagePath,
        });

        // If it already has dataUrl, use it
        if (imageAttachment.dataUrl) {
          return {
            data: imageAttachment.dataUrl,
            filename: imageAttachment.filename,
          };
        }

        // Otherwise, load from storage
        const storagePath = imageAttachment.storagePath || imageAttachment.path;
        if (storagePath) {
          try {
            const loaded = await attachmentStorage.loadAttachment({
              ...imageAttachment,
              path: storagePath,
            });

            if (loaded.dataUrl) {
              return {
                data: loaded.dataUrl,
                filename: imageAttachment.filename,
              };
            }
          } catch (error) {
            this.logger.aiSdk.warn("Failed to load previous image from storage", {
              path: storagePath,
              error: error instanceof Error ? error.message : error,
            });
          }
        }
      }
    }

    return null;
  }

  /**
   * Build context from full message history for inference models.
   * Concatenates all user and assistant messages to provide conversation context.
   * This allows inference models to understand the full conversation when generating outputs.
   */
  private buildInferenceContext(messages: UIMessage[]): string {
    const contextParts: string[] = [];

    for (const message of messages) {
      if (message.role !== 'user' && message.role !== 'assistant') {
        continue;
      }

      // Extract text from message parts
      const textParts = message.parts?.filter((p: any) => p.type === 'text') || [];
      const text = textParts.map((p: any) => p.text).join('\n').trim();

      if (text) {
        const prefix = message.role === 'user' ? 'User' : 'Assistant';
        contextParts.push(`${prefix}: ${text}`);
      }
    }

    return contextParts.join('\n');
  }


  /**
   * Parse a JSON block embedded in markdown fences
   */
  private extractJsonBlock(
    text: string
  ): { json: string; remainder: string } | null {
    const match = text.match(/```(?:json|table)?\s*([\s\S]*?)```/i);
    if (!match) {
      return null;
    }

    const remainder = text.replace(match[0], "").trim();
    return { json: match[1], remainder };
  }

  /**
   * Parse table-question-answering payloads from user text
   */
  private parseTableQuestionInput(
    text: string
  ): { table: any; query: string } | null {
    const jsonBlock = this.extractJsonBlock(text);
    const candidates: string[] = [];

    if (jsonBlock) {
      candidates.push(jsonBlock.json);
    }

    if (text.trim()) {
      candidates.push(text.trim());
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === "object") {
          const table = (parsed as any).table ?? parsed;
          const fallbackQuery =
            (jsonBlock?.remainder || "").trim() || text.trim();

          const query =
            (parsed as any).query ??
            (parsed as any).question ??
            (parsed as any).prompt ??
            fallbackQuery;

          return {
            table,
            query,
          };
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Get model information with classification (Phase 3: Model Classification)
   * Replaces getModelTaskType() with richer model metadata
   *
   * Note: Returns undefined if model not found (like original getModelTaskType)
   * Actual model validation happens in getModelProvider()
   */
  private async getModelInfo(modelId: string): Promise<
    | {
      category: ModelCategory;
      capabilities: ModelCapabilities;
      taskType?: string;
    }
    | undefined
  > {
    try {
      const { preferencesService } = await import("./preferencesService");
      const providers = (preferencesService.get("providers") as any[]) || [];

      for (const provider of providers) {
        // Find model in provider (should have minimal data + classification saved)
        const model = provider.models?.find((m: any) => m.id === modelId);

        if (model) {
          // Use cached classification (saved from renderer)
          if (model.category && model.computedCapabilities) {
            this.logger.aiSdk.debug("Using saved model classification", {
              modelId,
              category: model.category,
              capabilities: model.computedCapabilities,
            });

            return {
              category: model.category,
              capabilities: model.computedCapabilities,
              taskType: model.taskType,
            };
          }

          // Fallback: classify on-the-fly (shouldn't happen with Phase 2 sync)
          this.logger.aiSdk.warn(
            "Model not classified, classifying on-the-fly",
            { modelId }
          );
          const classification = classifyModel(model);

          return {
            category: classification.category,
            capabilities: classification.capabilities,
            taskType: model.taskType,
          };
        }
      }

      // Model not found - return undefined (like original getModelTaskType)
      // getModelProvider will handle the error
      this.logger.aiSdk.debug("Model not found in preferences", { modelId });
      return undefined;
    } catch (error) {
      this.logger.aiSdk.warn("Failed to get model info", {
        modelId,
        error: error instanceof Error ? error.message : error,
      });
      return undefined;
    }
  }

  /**
   * Helper to determine the provider type for a given model ID
   */
  private async getProviderType(modelId: string): Promise<string | undefined> {
    try {
      const { preferencesService } = await import("./preferencesService");
      const providers = (preferencesService.get("providers") as any[]) || [];

      // Find which provider this model belongs to
      const providerWithModel = providers.find((provider) => {
        if (provider.modelSource === "dynamic") {
          return provider.selectedModelIds?.includes(modelId);
        } else {
          return provider.models.some(
            (model: any) => model.id === modelId && model.isSelected !== false
          );
        }
      });

      return providerWithModel?.type;
    } catch (error) {
      this.logger.aiSdk.error("Failed to get provider type", { error, modelId });
      return undefined;
    }
  }

  private async getBuiltInToolsConfig(): Promise<{ mermaidValidation: boolean; mcpDiscovery: boolean }> {
    try {
      const { preferencesService } = await import("./preferencesService");
      const aiPrefs = preferencesService.get('ai') as any;

      return {
        mermaidValidation: aiPrefs?.mermaidValidation !== false, // Enabled by default
        mcpDiscovery: aiPrefs?.mcpDiscovery !== false // Enabled by default
      };
    } catch {
      return { mermaidValidation: true, mcpDiscovery: true };
    }
  }

  async *streamChat(
    request: ChatRequest
  ): AsyncGenerator<ChatStreamChunk, void, unknown> {
    const { messages, model, webSearch, enableMCP = false } = request;

    try {
      // Get model classification (Phase 3: Model Classification)
      const modelInfo = await this.getModelInfo(model);

      // Get provider type to determine if this is a local model
      const providerType = await this.getProviderType(model);
      const isLocalProvider = providerType === "local";

      // If model info available, use it for routing and validation
      if (modelInfo) {
        this.logger.aiSdk.info("Chat request received", {
          model,
          category: modelInfo.category,
          capabilities: {
            tools: modelInfo.capabilities.supportsTools,
            vision: modelInfo.capabilities.supportsVision,
            streaming: modelInfo.capabilities.supportsStreaming,
            multiTurn: modelInfo.capabilities.supportsMultiTurn,
          },
        });

        // Route based on category (cleaner than taskType checking)
        const isInferenceModel =
          getSessionType(modelInfo.category) === "inference";

        if (isInferenceModel) {
          this.logger.aiSdk.info("Routing to inference handler", {
            model,
            category: modelInfo.category,
            taskType: modelInfo.taskType,
          });

          yield* this.handleInferenceModel(
            request,
            modelInfo.taskType as InferenceTask
          );
          return;
        }

        // Validate capabilities BEFORE execution (skip for local providers)
        if (
          enableMCP &&
          !isLocalProvider &&
          !modelInfo.capabilities.supportsTools
        ) {
          this.logger.aiSdk.warn(
            "Model does not support tools, disabling MCP",
            {
              model,
              category: modelInfo.category,
              supportsTools: modelInfo.capabilities.supportsTools,
            }
          );

          yield {
            delta: `⚠️ **Tool Use Not Supported**\n\nThe model "${model}" (${modelInfo.category}) doesn't support tool/function calling, which is required for MCP integration.\n\n**Recommendation:** Choose a different model that supports tools, or disable MCP for this conversation.\n\nContinuing with regular chat (MCP disabled)...\n\n`,
          };

          request.enableMCP = false;
        } else if (
          isLocalProvider &&
          enableMCP &&
          !modelInfo.capabilities.supportsTools
        ) {
          // Log that we're attempting tools with a local model
          this.logger.aiSdk.info(
            "Attempting tool use with local model (skipping proactive validation)",
            { model, enableMCP }
          );
        }
      } else {
        // No model info available - proceed with default behavior
        this.logger.aiSdk.debug(
          "No model classification available, using default behavior",
          { model }
        );
      }

      // Get the appropriate model provider
      let modelProvider = await getModelProvider(model);

      // Wrap model with reasoning middleware if needed (DeepSeek R1, etc.)
      if (shouldUseReasoningMiddleware(model)) {
        this.logger.aiSdk.info("Applying reasoning middleware for model", {
          modelId: model,
          middleware: 'extractReasoningMiddleware',
        });
        modelProvider = wrapModelForReasoning(modelProvider, model);
      }

      // Get MCP tools if enabled
      // Get MCP tools if enabled
      let tools = {};

      // Get built-in tools (always available, independent of MCP)
      const { getBuiltInTools } = await import('./ai/builtInTools');
      const builtInToolsConfig = await this.getBuiltInToolsConfig();
      const builtInTools = await getBuiltInTools(builtInToolsConfig);

      if (enableMCP) {
        // Get disabled tools from preferences for filtering
        const { preferencesService } = await import("./preferencesService");
        await preferencesService.initialize();
        const prefs = await preferencesService.getAll();
        const disabledTools = prefs.mcp?.disabledTools;

        const mcpTools = await getMCPTools(disabledTools);
        tools = { ...builtInTools, ...mcpTools };
        this.logger.aiSdk.debug("Passing tools to streamText", {
          toolCount: Object.keys(tools).length,
          toolNames: Object.keys(tools),
        });

        // Debug: Check for any empty or invalid tool names
        const invalidTools = Object.entries(tools).filter(([key, value]) => {
          return !key || key.trim() === "" || !value;
        });

        if (invalidTools.length > 0) {
          this.logger.aiSdk.error("Found invalid tools", { invalidTools });
        }

        // Debug: Log a sample tool to see its structure
        const sampleToolKey = Object.keys(tools)[0];
        if (sampleToolKey) {
          this.logger.aiSdk.debug("Sample tool structure", {
            toolName: sampleToolKey,
            toolStructure: (tools as any)[sampleToolKey],
          });
        }

        // Debug: Log all tool keys being passed to AI SDK
        this.logger.aiSdk.debug("All tool keys being passed to AI SDK", {
          toolKeys: Object.keys(tools),
        });

        // Debug: Verify no empty keys exist
        const emptyKeys = Object.keys(tools).filter(
          (key) => !key || key.trim() === ""
        );
        if (emptyKeys.length > 0) {
          this.logger.aiSdk.error("CRITICAL: Empty tool keys detected", {
            emptyKeys,
          });
          // Remove empty keys
          emptyKeys.forEach((key) => delete (tools as any)[key]);
        }

        // Additional validation: ensure all tools are valid objects
        const invalidToolObjects = Object.entries(tools).filter(
          ([key, tool]) => {
            return (
              !tool ||
              typeof tool !== "object" ||
              typeof (tool as any).execute !== "function"
            );
          }
        );

        if (invalidToolObjects.length > 0) {
          this.logger.aiSdk.error("CRITICAL: Invalid tool objects detected", {
            invalidToolNames: invalidToolObjects.map(([key]) => key),
          });
          // Remove invalid tools
          invalidToolObjects.forEach(([key]) => delete (tools as any)[key]);
        }

        this.logger.aiSdk.debug(
          "Final tool validation passed. Tools ready for AI SDK",
          {
            finalToolCount: Object.keys(tools).length,
            finalToolNames: Object.keys(tools),
          }
        );
      } else {
        tools = builtInTools;
      }

      const messagesWithFileParts = await this.includeAttachmentsInMessageParts(
        messages,
        modelInfo?.capabilities
      );

      // Metrics tracking
      const streamStartTime = Date.now();
      let firstChunkTime: number | null = null;
      let chunkCount = 0;

      const result = streamText({
        model: modelProvider,
        messages: await convertToModelMessages(sanitizeMessagesForModel(messagesWithFileParts)),
        tools,
        system: await buildSystemPrompt(
          webSearch,
          enableMCP,
          Object.keys(tools).length,
          builtInToolsConfig.mermaidValidation,
          builtInToolsConfig.mcpDiscovery
        ),
        // Use stopWhen as recommended in AI SDK v5 (not maxSteps)
        // This allows the model to continue generating after tool results
        stopWhen: stepCountIs(await calculateMaxSteps(Object.keys(tools).length)),

        // Provider-specific options for reasoning models (GPT-5, Gemini 2.0, etc.)
        providerOptions: await (async () => {
          const hasTools = Object.keys(tools).length > 0;
          const options = await getReasoningProviderOptions(model, undefined, hasTools);
          this.logger.aiSdk.info("🔧 Applying provider options for reasoning", {
            modelId: model,
            hasTools,
            providerOptions: options,
          });
          return options;
        })(),

        // Callback for each chunk - measure TTFB
        onChunk: ({ chunk }) => {
          chunkCount++;
          if (firstChunkTime === null) {
            firstChunkTime = Date.now();
            this.logger.aiSdk.info("⚡ First chunk received (TTFB)", {
              ttfbMs: firstChunkTime - streamStartTime,
              chunkType: chunk.type,
              model,
            });
          }
        },

        // Callback when stream finishes - log final metrics
        onFinish: (finishData: any) => {
          const { usage, finishReason } = finishData;

          const totalTime = Date.now() - streamStartTime;
          const ttfb = firstChunkTime ? firstChunkTime - streamStartTime : null;

          this.logger.aiSdk.info("📊 Stream completed - metrics", {
            model,
            ttfbMs: ttfb,
            totalTimeMs: totalTime,
            streamingTimeMs: ttfb ? totalTime - ttfb : null,
            chunkCount,
            finishReason,
            usage: usage ? {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              totalTokens: usage.totalTokens,
            } : null,
            avgMsPerChunk: chunkCount > 1 && ttfb ? Math.round((totalTime - ttfb) / (chunkCount - 1)) : null,
          });
        },
      });

      // Track accumulated reasoning text per block ID
      const reasoningBlocks = new Map<string, string>();

      // Use full stream to handle tool calls
      for await (const chunk of result.fullStream) {
        // Log ALL chunks for debugging (except frequent text-delta)
        if (chunk.type !== "text-delta" && chunk.type !== "reasoning-delta") {
          this.logger.aiSdk.debug("🔄 Stream chunk", {
            type: chunk.type,
            chunkKeys: Object.keys(chunk),
          });
        }

        // Log the actual model used when we receive finish-step
        if (chunk.type === "finish-step" && chunk.response) {
          this.logger.aiSdk.info("Model used in AI request", {
            requestedModelId: model,
            actualModelId: chunk.response.modelId,
            providerOptions: chunk.response.headers,
          });
        }

        switch (chunk.type) {
          case "text-delta":
            // Log text chunks to detect if tool results are being echoed as text
            const textContent = chunk.text;
            const looksLikeJSON = textContent.trim().startsWith('{') || textContent.trim().startsWith('[');
            if (looksLikeJSON) {
              this.logger.aiSdk.debug("📝 Text-delta looks like JSON", {
                preview: textContent.substring(0, 200),
                length: textContent.length,
              });
            }

            yield { delta: chunk.text };
            break;

          case "reasoning-start":
            const startId = (chunk as any).id;
            this.logger.aiSdk.debug("Reasoning started", {
              id: startId,
            });
            // Initialize empty string for this reasoning block
            reasoningBlocks.set(startId, '');
            break;

          case "reasoning-delta":
            // AI SDK uses 'text' field for reasoning chunks
            const reasoningDelta = (chunk as any).text;
            const reasoningId = (chunk as any).id;

            this.logger.aiSdk.debug("Reasoning chunk received", {
              id: reasoningId,
              deltaLength: reasoningDelta?.length,
            });

            if (reasoningDelta && reasoningId) {
              // Accumulate the delta
              const currentText = reasoningBlocks.get(reasoningId) || '';
              const accumulatedText = currentText + reasoningDelta;
              reasoningBlocks.set(reasoningId, accumulatedText);

              this.logger.aiSdk.debug("Yielding accumulated reasoning", {
                reasoningId,
                accumulatedLength: accumulatedText.length,
              });

              // Yield the full accumulated text
              yield {
                reasoningText: accumulatedText,
                reasoningId,
              };
            } else {
              this.logger.aiSdk.warn("⚠️ Reasoning delta or ID is missing");
            }
            break;

          case "reasoning-end":
            const endId = (chunk as any).id;
            this.logger.aiSdk.debug("Reasoning completed", {
              id: endId,
              finalLength: reasoningBlocks.get(endId)?.length,
            });
            // Clean up the accumulated text
            reasoningBlocks.delete(endId);
            break;

          case "tool-call":
            this.logger.aiSdk.debug("Tool call chunk received", {
              type: chunk.type,
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              toolNameType: typeof chunk.toolName,
              toolNameLength: chunk.toolName?.length,
              hasArguments: !!(chunk as any).arguments,
            });

            // Debug: Check if tool name is empty
            if (!chunk.toolName || chunk.toolName.trim() === "") {
              this.logger.aiSdk.error(
                "ERROR: Tool call with empty name detected!",
                {
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  toolNameString: JSON.stringify(chunk.toolName),
                  arguments: (chunk as any).arguments,
                  availableTools: Object.keys(tools),
                  fullChunk: JSON.stringify(chunk, null, 2),
                }
              );

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
              chunk: JSON.stringify(chunk, null, 2),
            });
            this.logger.aiSdk.debug("Tool result details", {
              output: (chunk as any).output,
              chunkKeys: Object.keys(chunk),
            });

            // Use 'output' property as per AI SDK documentation
            const toolResult = (chunk as any).output || {};
            this.logger.aiSdk.debug("Final tool result being yielded", {
              toolResult,
            });

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
              availableTools: Object.keys(tools),
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
              this.logger.aiSdk.warn(
                "Model does not support tool execution. Retrying without tools",
                {
                  model,
                  error: chunk.error,
                }
              );

              // Inform user with clear message and retry without tools
              yield {
                delta: `⚠️ **Tool Use Not Supported**\n\nThe model "${model}" doesn't support tool/function calling, which is required for MCP integration.\n\n**Recommendation:** Choose a different model that supports tools, or disable MCP for this conversation.\n\nContinuing with regular chat (MCP disabled)...\n\n`,
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
                  model,
                });
                yield {
                  error:
                    "Failed to process request both with and without tools. Please try a different model.",
                  done: true,
                };
                return;
              }
            }

            // For other errors, extract the error message
            const errorMessage =
              chunk.error instanceof Error
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

      // After stream completes, check if reasoning is available in result
      // Some models (GPT-5) don't stream reasoning incrementally but provide it at the end
      await result.text; // Wait for completion

      this.logger.aiSdk.info("🔍 Checking result for reasoning", {
        resultKeys: Object.keys(result),
        hasReasoningText: !!(result as any).reasoningText,
        hasReasoning: !!(result as any).reasoningText,
        reasoningTextType: typeof (result as any).reasoningText,
        reasoningType: typeof (result as any).reasoningText,
        reasoningTextValue: (result as any).reasoningText,
        reasoningValue: (result as any).reasoningText,
        reasoningTextKeys: (result as any).reasoningText ? Object.keys((result as any).reasoningText) : null,
        reasoningKeys: (result as any).reasoningText ? Object.keys((result as any).reasoningText) : null,
      });

      const reasoningText = (result as any).reasoningText || (result as any).reasoningText;

      if (reasoningText) {
        this.logger.aiSdk.info("📝 Reasoning found in finishData", {
          reasoningLength: typeof reasoningText === 'string' ? reasoningText.length : JSON.stringify(reasoningText).length,
          reasoningType: typeof reasoningText,
          reasoningPreview: typeof reasoningText === 'string' ? reasoningText.substring(0, 100) : null,
        });

        // Send reasoning as final chunk before done
        yield {
          reasoningText: typeof reasoningText === 'string' ? reasoningText : JSON.stringify(reasoningText),
          reasoningId: 'finish-reasoning',
        };
      } else {
        this.logger.aiSdk.debug("No reasoning found in finishData");
      }

      yield { done: true };
    } catch (error) {
      // Unexpected errors that aren't handled by the stream (rare)
      this.logger.aiSdk.error("Unexpected streaming error", {
        error: error instanceof Error ? error.message : error,
        model,
        enableMCP,
      });

      yield {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
        done: true,
      };
    }
  }

  /**
   * Handle inference model (text-to-image, image-to-image, etc.)
   */
  private async * handleInferenceModel(
    request: ChatRequest,
    taskType: InferenceTask
  ): AsyncGenerator<ChatStreamChunk, void, unknown> {
    const { messages, model } = request;

    try {
      // Get HuggingFace API key from provider config
      const { preferencesService } = await import("./preferencesService");
      const providers = (preferencesService.get("providers") as any[]) || [];
      const hfProvider = providers.find((p) => p.type === "huggingface");

      if (!hfProvider?.apiKey) {
        yield {
          error:
            "Hugging Face API key not found. Please configure it in settings.",
          done: true,
        };
        return;
      }

      // Create inference dispatcher
      const dispatcher = new InferenceDispatcher(hfProvider.apiKey);

      // Extract last user message as input
      const lastUserMessage = [...messages]
        .reverse()
        .find((m) => m.role === "user");
      if (!lastUserMessage) {
        yield {
          error: "No user message found for inference",
          done: true,
        };
        return;
      }

      // Extract text from message
      const textParts =
        lastUserMessage.parts?.filter((p: any) => p.type === "text") || [];
      const inputText = textParts.map((p: any) => p.text).join("\n") || "";

      // Extract attachments if present (for image-based tasks)
      const attachments = (lastUserMessage as any).attachments || [];
      const chatMessages = this.buildHFChatMessages(messages);
      const modelConfig = hfProvider.models?.find((m: any) => m.id === model);
      const providerSlug = modelConfig?.inferenceProvider?.trim();

      this.logger.aiSdk.info("📥 Executing inference task", {
        model,
        taskType,
        inputLength: inputText.length,
        attachmentsCount: attachments.length,
        attachmentsPreview: attachments.map((a: any) => ({
          type: a.type,
          filename: a.filename,
          hasData: !!a.data,
          dataLength: a.data?.length || 0,
        })),
        lastMessageHasAttachments: !!(lastUserMessage as any).attachments,
      });

      // Prepare input based on task type
      let inferenceInput: any;
      switch (taskType) {
        case "conversational":
        case "text-generation":
        case "text2text-generation":
          inferenceInput = { messages: chatMessages };
          break;

        case "text-to-image": {
          // Build context from FULL conversation history
          const contextPrompt = this.buildInferenceContext(messages);
          this.logger.aiSdk.info("text-to-image using full conversation context", {
            contextLength: contextPrompt.length,
            messageCount: messages.length
          });
          inferenceInput = { prompt: contextPrompt || inputText };
          break;
        }

        case "text-to-speech": {
          // Build context from FULL conversation history
          const contextText = this.buildInferenceContext(messages);
          this.logger.aiSdk.info("text-to-speech using full conversation context", {
            contextLength: contextText.length,
            messageCount: messages.length
          });
          inferenceInput = { text: contextText || inputText };
          break;
        }

        case "text-to-video": {
          // Build context from FULL conversation history
          const contextText = this.buildInferenceContext(messages);
          this.logger.aiSdk.info("text-to-video using full conversation context", {
            contextLength: contextText.length,
            messageCount: messages.length
          });
          inferenceInput = { text: contextText || inputText };
          break;
        }

        case "image-to-image": {
          // Get image from attachment or fall back to last generated image
          let imageData: string | null = null;
          let imageSource: string = "unknown";

          // First, check if user attached an image
          const imageAttachment = attachments.find(
            (a: any) => a.type === "image"
          );

          if (imageAttachment?.data) {
            imageData = imageAttachment.data;
            imageSource = "user-attachment";
            this.logger.aiSdk.debug("Using user-attached image for image-to-image");
          } else {
            // No attachment - try to find last generated image in conversation
            this.logger.aiSdk.debug("No attachment provided, searching for previous generated image");
            const lastImage = await this.findLastGeneratedImage(messages);

            if (lastImage) {
              imageData = lastImage.data;
              imageSource = "previous-generation";
              this.logger.aiSdk.info("Using previous generated image for editing", {
                filename: lastImage.filename,
              });
            }
          }

          // If no image found anywhere, show error
          if (!imageData) {
            yield {
              error:
                "Image-to-image models require an image. Please attach an image or generate one first.",
              done: true,
            };
            return;
          }

          // Convert dataURL to Blob
          const imageBlob = await this.dataURLToBlob(imageData);

          this.logger.aiSdk.info("Image-to-image input prepared", {
            imageSource,
            prompt: inputText?.substring(0, 50) || "(no prompt)",
          });

          inferenceInput = {
            image: imageBlob,
            prompt: inputText || undefined, // Optional prompt for guidance
          };
          break;
        }

        case "image-text-to-text":
          // Requires image attachment
          if (attachments.length === 0) {
            yield {
              error:
                "Multimodal models require an image attachment. Please attach an image to your message.",
              done: true,
            };
            return;
          }

          // Get first image attachment
          const imageAttachmentVLM = attachments.find(
            (a: any) => a.type === "image"
          );
          if (!imageAttachmentVLM) {
            yield {
              error:
                "No image found in attachments. Multimodal models require an image.",
              done: true,
            };
            return;
          }

          // Convert dataURL to Blob
          const imageBlobVLM = await this.dataURLToBlob(
            imageAttachmentVLM.data
          );

          inferenceInput = {
            image: imageBlobVLM,
            text: inputText || undefined, // Optional text/question about image
            mimeType: imageBlobVLM.type || undefined,
            preferChatMode: true,
          };
          break;

        case "visual-question-answering":
        case "document-question-answering": {
          // Get image from attachment or fall back to last generated/attached image
          let imageData: string | null = null;
          let imageSource: string = "unknown";

          // First, check if user attached an image
          const qaAttachment = attachments.find((a: any) => a.type === "image");

          if (qaAttachment?.data) {
            imageData = qaAttachment.data;
            imageSource = "user-attachment";
            this.logger.aiSdk.debug("Using user-attached image for visual-qa");
          } else {
            // No attachment - try to find last image in conversation history
            this.logger.aiSdk.debug("No attachment provided, searching for previous image in history");
            const lastImage = await this.findLastGeneratedImage(messages);

            if (lastImage) {
              imageData = lastImage.data;
              imageSource = "previous-image";
              this.logger.aiSdk.info("Using previous image from history for visual-qa", {
                filename: lastImage.filename,
              });
            }
          }

          // If no image found anywhere, show error
          if (!imageData) {
            yield {
              error:
                "This model requires an image. Please attach an image or use it in a conversation with existing images.",
              done: true,
            };
            return;
          }

          const qaBlob = await this.dataURLToBlob(imageData);

          // Build context from full conversation for the question
          const contextQuestion = this.buildInferenceContext(messages);

          this.logger.aiSdk.info("visual-qa input prepared", {
            imageSource,
            questionLength: contextQuestion.length || inputText.length,
          });

          inferenceInput = {
            image: qaBlob,
            question: contextQuestion || inputText || "Describe the image",
          };
          break;
        }

        case "table-question-answering": {
          const parsedTable = this.parseTableQuestionInput(inputText);

          if (!parsedTable) {
            yield {
              error:
                "Table QA models require a JSON payload that includes the table data. Provide a valid JSON object (optionally inside ```json fences) with either `{ table, query }` or `{ headers, rows }`.",
              done: true,
            };
            return;
          }

          inferenceInput = parsedTable;
          break;
        }

        default:
          yield {
            error: `Task type "${taskType}" not yet supported in chat interface`,
            done: true,
          };
          return;
      }

      // Execute inference
      const result = await dispatcher.dispatch({
        task: taskType,
        model,
        input: inferenceInput,
        provider: providerSlug,
      });

      // Convert result to chat format
      switch (result.kind) {
        case "text":
          yield { delta: result.text };
          break;

        case "image":
          // Return image as attachment (to be saved by frontend)
          yield {
            generatedAttachment: {
              type: "image",
              mime: result.mime,
              dataUrl: result.dataUrl,
              filename: `generated-image-${Date.now()}.${result.mime.split("/")[1] || "png"}`,
            },
          };
          break;

        case "audio":
          // Return audio as attachment
          yield {
            generatedAttachment: {
              type: "audio",
              mime: result.mime,
              dataUrl: result.dataUrl,
              filename: `generated-audio-${Date.now()}.${result.mime.split("/")[1] || "wav"}`,
            },
          };
          break;

        case "video":
          // Return video as attachment
          yield {
            generatedAttachment: {
              type: "video",
              mime: result.mime,
              dataUrl: result.dataUrl,
              filename: `generated-video-${Date.now()}.${result.mime.split("/")[1] || "mp4"}`,
            },
          };
          break;
      }

      yield { done: true };
    } catch (error) {
      this.logger.aiSdk.error("Inference execution failed", {
        model,
        taskType,
        error: error instanceof Error ? error.message : error,
      });

      yield {
        error: error instanceof Error ? error.message : "Inference failed",
        done: true,
      };
    }
  }

  async sendSingleMessage(
    request: ChatRequest
  ): Promise<{ response: string; sources?: any[]; reasoningText?: string }> {
    const { messages, model, webSearch, enableMCP = false } = request;

    try {
      // Get model classification (Phase 3: Model Classification)
      const modelInfo = await this.getModelInfo(model);

      if (modelInfo) {
        this.logger.aiSdk.info("Single message request", {
          model,
          category: modelInfo.category,
          capabilities: modelInfo.capabilities,
        });

        // Validate capabilities BEFORE execution
        if (enableMCP && !modelInfo.capabilities.supportsTools) {
          this.logger.aiSdk.warn(
            `Model '${model}' does not support tools. Disabling MCP...`,
            {
              category: modelInfo.category,
              supportsTools: modelInfo.capabilities.supportsTools,
            }
          );
          request.enableMCP = false;
        }
      } else {
        this.logger.aiSdk.debug(
          "No model classification available for single message",
          { model }
        );
      }

      // Get the appropriate model provider
      let modelProvider = await getModelProvider(model);

      // Wrap model with reasoning middleware if needed (DeepSeek R1, etc.)
      if (shouldUseReasoningMiddleware(model)) {
        this.logger.aiSdk.info("Applying reasoning middleware for model", {
          modelId: model,
          middleware: 'extractReasoningMiddleware',
        });
        modelProvider = wrapModelForReasoning(modelProvider, model);
      }

      // Get MCP tools if enabled
      let tools = {};
      if (enableMCP) {
        // Get disabled tools from preferences for filtering
        const { preferencesService } = await import("./preferencesService");
        await preferencesService.initialize();
        const prefs = await preferencesService.getAll();
        const disabledTools = prefs.mcp?.disabledTools;

        tools = await getMCPTools(disabledTools);
      }

      // Get built-in tools config for system prompt
      const builtInToolsConfig = await this.getBuiltInToolsConfig();

      const messagesWithFileParts = await this.includeAttachmentsInMessageParts(
        messages,
        modelInfo?.capabilities
      );

      const result = await generateText({
        model: modelProvider,
        messages: await convertToModelMessages(sanitizeMessagesForModel(messagesWithFileParts)),
        tools,
        system: await buildSystemPrompt(
          webSearch,
          enableMCP,
          Object.keys(tools).length,
          builtInToolsConfig.mermaidValidation,
          builtInToolsConfig.mcpDiscovery
        ),
        stopWhen: stepCountIs(await calculateMaxSteps(Object.keys(tools).length)),
        providerOptions: await getReasoningProviderOptions(model, undefined, Object.keys(tools).length > 0),
      });

      return {
        response: result.text,
        sources: undefined,
        reasoningText: undefined,
      };
    } catch (error) {
      // Extract error details for better logging
      const errorDetails: any = {};
      if (error && typeof error === "object") {
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
        ...errorDetails,
      });

      // Check if this is a tool use not supported error
      const isToolUseError = isToolUseNotSupportedError(error);

      if (isToolUseError && enableMCP) {
        this.logger.aiSdk.warn(
          `Model '${model}' does not support tool execution. Retrying without tools...`
        );

        // Retry the same request without MCP tools
        try {
          const retryRequest = { ...request, enableMCP: false };
          const retryResult = await this.sendSingleMessage(retryRequest);

          return {
            response: `⚠️ **Tool Use Not Supported**\n\nThe model "${model}" doesn't support tool/function calling, which is required for MCP integration.\n\n**Recommendation:** Choose a different model that supports tools, or disable MCP for this conversation.\n\nHere's the response without tools:\n\n${retryResult.response}`,
            sources: retryResult.sources,
            reasoningText: retryResult.reasoningText,
          };
        } catch (retryError) {
          this.logger.aiSdk.error("Retry without tools also failed", {
            error: retryError,
          });
          throw new Error(
            "Failed to process request both with and without tools. Please try a different model."
          );
        }
      }

      throw new Error(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    }
  }
}
