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
import { resolveModelTarget } from "./ai/modelTargetResolver";
import { getRawModelId } from "../../shared/modelRefs";
import {
  getReasoningConfig,
  buildProviderOptions,
  shouldUseReasoningMiddleware as shouldUseReasoningMiddlewareFromResolver,
} from "./ai/reasoningResolver";
import type { ProviderConfig } from "../../types/models";
import type { ReasoningConfig } from "../../types/reasoning";
import { getMCPTools, getCodeModeSystemPrompt } from "./ai/mcpToolsAdapter";
import { buildSystemPrompt } from "./ai/systemPromptBuilder";
import { getCodingTools } from "./ai/codingTools";
import { isToolUseNotSupportedError } from "./ai/toolErrorDetector";
import { classifyStreamingError } from "./ai/streamingErrorClassifier";
import { calculateMaxSteps } from "./ai/stepsCalculator";
import { sanitizeMessagesForModel } from "./ai/toolMessageSanitizer";
import { InferenceDispatcher } from "./inference/InferenceDispatcher";
import { attachmentStorage } from "./attachmentStorage";
import { pdfExtractionService } from "./pdfExtractionService";
import type { InferenceTask, HFChatMessage } from "../../types/inference";
import { classifyModel, getSessionType } from "../../utils/modelClassification";
import type {
  ModelCategory,
  ModelCapabilities,
} from "../../types/modelCategories";
import type { InstalledSkill } from "../../types/skills";
import { skillsService } from "./skillsService";

export interface ChatRequest {
  messages: UIMessage[];
  model: string;
  webSearch: boolean;
  enableMCP?: boolean;
  sessionId?: string;
  projectDescription?: string; // Descripción del proyecto (inyectada en system prompt)
  // Contexto de proyecto para carga de skills por scope
  projectContext?: {
    projectId?: string;
  };
  // Modo de codificación
  codeMode?: {
    enabled: boolean;
    cwd?: string; // Directorio de trabajo
    tools?: {
      bash?: boolean;
      read?: boolean;
      write?: boolean;
      edit?: boolean;
      grep?: boolean;
      find?: boolean;
      ls?: boolean;
      taskOutput?: boolean;
      killTask?: boolean;
      listTasks?: boolean;
    };
  };
}

export interface ChatStreamChunk {
  delta?: string;
  done?: boolean;
  error?: string;
  errorCategory?: string;
  stepStart?: boolean;
  stepFinish?: boolean;
  parts?: Array<any>; // Rich content parts for rendering
  sources?: Array<{ url: string; title?: string }>;
  reasoningText?: string;
  reasoningId?: string; // Stable ID for reasoning block reconciliation
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, any>;
    status: "running" | "success" | "error";
    timestamp: number;
    providerExecuted?: boolean;
    providerMetadata?: Record<string, unknown>;
  };
  toolResult?: {
    id: string;
    result: any;
    status: "success" | "error";
    timestamp: number;
    providerExecuted?: boolean;
  };
  toolApproval?: {
    approvalId: string;
    toolCallId: string;
    toolName: string;
    input: Record<string, any>;
  };
  generatedAttachment?: {
    type: "image" | "audio" | "video";
    mime: string;
    dataUrl: string;
    filename: string;
  };
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
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

type PreExecutedTool = {
  toolCallId: string;
  toolName: string;
  status: "success" | "error";
  result?: unknown;
  errorText?: string;
};

function isToolLikePart(part: any): boolean {
  if (!part || typeof part !== "object") return false;
  if (part.type === "dynamic-tool") return true;
  return typeof part.type === "string" && part.type.startsWith("tool-");
}

function resolveToolNameFromPart(part: any): string | undefined {
  if (typeof part.toolName === "string" && part.toolName.length > 0) {
    return part.toolName;
  }

  if (part.type === "dynamic-tool" && typeof part.toolName === "string") {
    return part.toolName;
  }

  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return part.type.slice(5);
  }

  return undefined;
}

/**
 * Ejecuta tools aprobadas (approval-responded + approved=true) antes de convertToModelMessages.
 *
 * Objetivo:
 * - Evitar que convertToModelMessages reciba parts en approval-responded aprobados sin output
 * - Producir estados finales válidos para modelo: output-available u output-error
 */
async function preExecuteApprovedTools(
  messages: UIMessage[],
  tools: Record<string, any>
): Promise<{
  updatedMessages: UIMessage[];
  executedTools: PreExecutedTool[];
}> {
  const cloned = JSON.parse(JSON.stringify(messages)) as any[];
  const executedTools: PreExecutedTool[] = [];

  for (const message of cloned) {
    if (message.role !== "assistant" || !Array.isArray(message.parts)) continue;

    for (const part of message.parts) {
      if (!isToolLikePart(part)) continue;

      const isApprovedResponse =
        part.state === "approval-responded" && part.approval?.approved === true;
      if (!isApprovedResponse) continue;

      const toolCallId = part.toolCallId;
      const toolName = resolveToolNameFromPart(part);

      if (!toolCallId || !toolName) {
        const errorText = "Cannot resume approved tool: missing toolCallId or toolName.";

        part.state = "output-error";
        part.errorText = errorText;
        delete part.output;

        if (toolCallId) {
          executedTools.push({
            toolCallId,
            toolName: toolName ?? "unknown-tool",
            status: "error",
            errorText,
          });
        }

        continue;
      }

      const tool = tools[toolName];
      if (!tool || typeof tool.execute !== "function") {
        const errorText = `Tool "${toolName}" not found or has no execute function.`;

        part.state = "output-error";
        part.errorText = errorText;
        delete part.output;

        executedTools.push({
          toolCallId,
          toolName,
          status: "error",
          errorText,
        });

        continue;
      }

      const input = part.input ?? {};

      try {
        // Mantener output con su tipo original. NO stringify aquí.
        const result = await tool.execute(input, { toolCallId });

        part.state = "output-available";
        part.output = result;
        delete part.errorText;

        executedTools.push({
          toolCallId,
          toolName,
          status: "success",
          result,
        });

      } catch (error) {
        const errorText =
          error instanceof Error ? error.message : "Unknown tool execution error";

        part.state = "output-error";
        part.errorText = errorText;
        delete part.output;

        executedTools.push({
          toolCallId,
          toolName,
          status: "error",
          errorText,
        });

      }
    }
  }

  return {
    updatedMessages: cloned as UIMessage[],
    executedTools,
  };
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

    // If no provider passed, try to find it using resolveModelTarget
    let resolvedProvider = provider;
    if (!resolvedProvider) {
      try {
        const target = await resolveModelTarget(modelId);
        if (target.source === 'provider') {
          resolvedProvider = target.provider;
        }
      } catch {
        // Fallback: search by raw ID
        const rawId = getRawModelId(modelId);
        const providers = (preferencesService.get("providers") as ProviderConfig[]) || [];
        resolvedProvider = providers.find((p) => {
          if (p.modelSource === "dynamic") {
            return p.selectedModelIds?.includes(rawId);
          } else {
            return p.models.some(
              (model) => model.id === rawId && model.isSelected !== false
            );
          }
        });
      }
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
      // Extract raw model ID for lookups in provider models
      const rawId = getRawModelId(modelId);

      const { preferencesService } = await import("./preferencesService");
      const providers = (preferencesService.get("providers") as any[]) || [];

      for (const provider of providers) {
        // Find model in provider using raw ID (providers store raw IDs)
        const model = provider.models?.find((m: any) => m.id === rawId);

        if (model) {
          // Use cached classification (saved from renderer)
          if (model.category && model.computedCapabilities) {
            this.logger.aiSdk.debug("Using saved model classification", {
              modelId: rawId,
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
            { modelId: rawId }
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
      // For platform-qualified refs, model info may not be in preferences
      this.logger.aiSdk.debug("Model not found in preferences", { modelId: rawId });
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
      const target = await resolveModelTarget(modelId);
      return target.providerType;
    } catch {
      // Fallback: try raw lookup in providers for backwards compat
      try {
        const rawId = getRawModelId(modelId);
        const { preferencesService } = await import("./preferencesService");
        const providers = (preferencesService.get("providers") as any[]) || [];

        const providerWithModel = providers.find((provider) => {
          if (provider.modelSource === "dynamic") {
            return provider.selectedModelIds?.includes(rawId);
          } else {
            return provider.models.some(
              (model: any) => model.id === rawId && model.isSelected !== false
            );
          }
        });

        return providerWithModel?.type;
      } catch (error) {
        this.logger.aiSdk.error("Failed to get provider type", { error, modelId });
        return undefined;
      }
    }
  }

  /**
   * Verifica si se debe saltar la aprobación de tools para el proveedor dado
   *
   * @param providerType - Tipo de proveedor (openrouter, anthropic, etc.)
   * @returns true si el proveedor está configurado para NO usar aprobación
   */
  private async shouldSkipToolApproval(providerType: string | undefined): Promise<boolean> {
    if (!providerType) {
      // Si no hay proveedor, usar comportamiento por defecto (con aprobación)
      return false;
    }

    try {
      const { preferencesService } = await import("./preferencesService");
      const aiPrefs = preferencesService.get("ai") as any | undefined;
      const rawProviders = aiPrefs?.providersWithoutToolApproval ?? [];
      const validProviders = rawProviders.filter((p: string) => this.isProviderType(p));

      if (validProviders.length !== rawProviders.length) {
        this.logger.aiSdk.warn("Invalid provider types in providersWithoutToolApproval", {
          rawProviders,
          validProviders,
        });
      }

      const shouldSkip = validProviders.includes(providerType);

      this.logger.aiSdk.debug("Tool approval check", {
        providerType,
        providersWithoutApproval: validProviders,
        shouldSkip,
      });

      return shouldSkip;
    } catch (error) {
      this.logger.aiSdk.warn("Error checking tool approval config, using default", {
        error: error instanceof Error ? error.message : error,
      });
      return false;
    }
  }

  private isProviderType(value: unknown): boolean {
    return [
      "openrouter",
      "vercel-gateway",
      "local",
      "openai",
      "anthropic",
      "google",
      "groq",
      "xai",
      "huggingface",
    ].includes(value as string);
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

  /**
   * Validate cowork CWD path.
   * Returns the path if valid, null otherwise.
   * Does NOT fallback to process.cwd() - must be explicitly provided.
   */
  private async resolveValidCoworkCwd(cwd?: string): Promise<string | null> {
    if (!cwd) {
      return null;
    }

    try {
      const fs = await import('fs/promises');
      const stats = await fs.stat(cwd);
      return stats.isDirectory() ? cwd : null;
    } catch {
      return null;
    }
  }

  async *streamChat(
    request: ChatRequest
  ): AsyncGenerator<ChatStreamChunk, void, unknown> {
    const { messages, model, webSearch, enableMCP = false, projectDescription, projectContext } = request;

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

      const codeModeEnabled = request.codeMode?.enabled === true;
      const codeModePrompt = codeModeEnabled ? getCodeModeSystemPrompt() : null;

      const projectId = projectContext?.projectId;
      let installedSkills: InstalledSkill[] = [];

      if (codeModeEnabled) {
        try {
          installedSkills = await skillsService.listInstalledSkills(
            projectId
              ? { mode: 'project-merged', projectId }
              : { mode: 'global' }
          );
          this.logger.aiSdk.debug('Loaded installed skills for agent context', {
            count: installedSkills.length,
            projectId,
            mode: projectId ? 'project-merged' : 'global',
            ids: installedSkills.map((s) => s.id),
          });
        } catch (error) {
          this.logger.aiSdk.warn('Failed to load installed skills', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const builtInTools = await getBuiltInTools({
        ...builtInToolsConfig,
        skills: installedSkills,
      });

      if (enableMCP) {
        // Verificar si el proveedor soporta aprobación de tools
        const shouldSkipApproval = await this.shouldSkipToolApproval(providerType);

        if (shouldSkipApproval) {
          this.logger.aiSdk.info("Skipping tool approval for provider", {
            providerType,
            reason: "Provider configured in providersWithoutToolApproval",
          });
        }

        // Get disabled tools from preferences for filtering
        const { preferencesService } = await import("./preferencesService");
        await preferencesService.initialize();
        const prefs = await preferencesService.getAll();
        const disabledTools = prefs.mcp?.disabledTools;

        const mcpTools = await getMCPTools({
          skipApproval: shouldSkipApproval,
          disabledTools
        });
        tools = { ...builtInTools, ...mcpTools };
        this.logger.aiSdk.debug("Passing tools to streamText", {
          toolCount: Object.keys(tools).length,
          toolNames: Object.keys(tools),
          needsApproval: !shouldSkipApproval,
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

      // ──────────────────────────────────────────────────
      // Cargar Coding Tools (si está habilitado code mode)
      // ──────────────────────────────────────────────────
      if (request.codeMode?.enabled) {
        const validCwd = await this.resolveValidCoworkCwd(request.codeMode.cwd);

        if (!validCwd) {
          this.logger.aiSdk.warn('Cowork code mode requested without valid cwd; skipping coding tools', {
            requestedCwd: request.codeMode.cwd,
          });
        } else {
          const codingTools = getCodingTools({
            cwd: validCwd,
            sessionId: request.sessionId,
            enabled: request.codeMode.tools, // { bash: true, read: true, ... }
          });

          tools = {
            ...tools,
            ...codingTools,
          };

          this.logger.aiSdk.debug("Loaded coding tools", {
            tools: Object.keys(codingTools),
            cwd: validCwd,
          });
        }
      }

      const messagesWithFileParts = await this.includeAttachmentsInMessageParts(
        messages,
        modelInfo?.capabilities
      );

      // Metrics tracking
      const streamStartTime = Date.now();
      let firstChunkTime: number | null = null;
      let chunkCount = 0;

      const { updatedMessages, executedTools } = await preExecuteApprovedTools(
        messagesWithFileParts,
        tools
      );

      // Emitir primero resultados pre-ejecutados para actualizar renderer
      for (const executed of executedTools) {
        if (executed.status === "success") {
          yield {
            toolResult: {
              id: executed.toolCallId,
              result: executed.result,
              status: "success" as const,
              timestamp: Date.now(),
            },
          };
        } else {
          yield {
            toolResult: {
              id: executed.toolCallId,
              result: executed.errorText ?? "Tool execution failed",
              status: "error" as const,
              timestamp: Date.now(),
            },
          };
        }
      }

      const sanitizedMessages = sanitizeMessagesForModel(updatedMessages);

      const modelMessages = await convertToModelMessages(sanitizedMessages);

      const todoToolsEnabled = 'todo_write' in tools;

      const result = streamText({
        model: modelProvider,
        messages: modelMessages,
        tools,
        system: await buildSystemPrompt(
          webSearch,
          enableMCP,
          Object.keys(tools).length,
          builtInToolsConfig.mermaidValidation,
          builtInToolsConfig.mcpDiscovery,
          projectDescription,
          installedSkills,
          codeModePrompt,
          todoToolsEnabled
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
        // Log the actual model used when we receive finish-step
        if (chunk.type === "finish-step") {
          if (chunk.response) {
            this.logger.aiSdk.info("Model used in AI request", {
              requestedModelId: model,
              actualModelId: chunk.response.modelId,
            });
          }
        }

        switch (chunk.type) {
          case "start-step":
            yield { stepStart: true };
            break;

          case "finish-step":
            yield { stepFinish: true };
            break;

          case "text-delta":
            yield { delta: chunk.text };
            break;

          case "reasoning-start":
            const startId = (chunk as any).id;
            // Initialize empty string for this reasoning block
            reasoningBlocks.set(startId, '');
            break;

          case "reasoning-delta":
            // AI SDK uses 'text' field for reasoning chunks
            const reasoningDelta = (chunk as any).text;
            const reasoningId = (chunk as any).id;

            if (reasoningDelta && reasoningId) {
              // Accumulate the delta
              const currentText = reasoningBlocks.get(reasoningId) || '';
              const accumulatedText = currentText + reasoningDelta;
              reasoningBlocks.set(reasoningId, accumulatedText);

              // Yield the full accumulated text
              yield {
                reasoningText: accumulatedText,
                reasoningId,
              };
            }
            break;

          case "reasoning-end":
            const endId = (chunk as any).id;
            // Clean up the accumulated text
            reasoningBlocks.delete(endId);
            break;

          case "tool-approval-request":
            // Herramienta con needsApproval: true requiere aprobación del usuario
            const approvalChunk = chunk as {
              type: string;
              approvalId: string;
              toolCall?: {
                toolCallId: string;
                toolName: string;
                input?: Record<string, unknown>;
              };
            };

            this.logger.aiSdk.info("Tool approval request received", {
              approvalId: approvalChunk.approvalId,
              toolCallId: approvalChunk.toolCall?.toolCallId,
              toolName: approvalChunk.toolCall?.toolName,
            });

            // Garantizar que input NUNCA sea undefined
            const toolInput = approvalChunk.toolCall?.input ?? {};

            yield {
              toolApproval: {
                approvalId: approvalChunk.approvalId,
                toolCallId: approvalChunk.toolCall?.toolCallId ?? '',
                toolName: approvalChunk.toolCall?.toolName ?? '',
                input: toolInput,
              },
            };
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
                arguments: (chunk as any).input || (chunk as any).arguments || {},
                status: "running" as const,
                timestamp: Date.now(),
                providerExecuted: (chunk as any).providerExecuted,
                providerMetadata: (chunk as any).providerMetadata,
              },
            };
            break;

          case "tool-result":
            // Use 'output' property as per AI SDK documentation
            const toolResult = (chunk as any).output || {};

            yield {
              toolResult: {
                id: chunk.toolCallId,
                result: toolResult,
                status: "success" as const,
                timestamp: Date.now(),
                providerExecuted: (chunk as any).providerExecuted,
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
                providerExecuted: (chunk as any).providerExecuted,
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

            // For other errors, classify and extract the error message
            const { category, originalMessage } = classifyStreamingError(chunk.error);

            yield {
              error: originalMessage,
              errorCategory: category,
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

      // Extract response parts for rich rendering (mini-chat, etc.)
      const responseParts = (result as any).response?.messages?.[0]?.content;
      if (responseParts && Array.isArray(responseParts)) {
        this.logger.aiSdk.debug("📦 Sending response parts", {
          partsCount: responseParts.length,
          partTypes: responseParts.map((p: any) => p.type),
        });
        yield { parts: responseParts };
      }

      // Emit token usage before done
      const finalUsage = await (result as any).usage;
      if (finalUsage) {
        yield {
          tokenUsage: {
            inputTokens: finalUsage.inputTokens || 0,
            outputTokens: finalUsage.outputTokens || 0,
            totalTokens: finalUsage.totalTokens || 0,
          },
        };
      }

      yield { done: true };
    } catch (error) {
      // Unexpected errors that aren't handled by the stream (rare)
      this.logger.aiSdk.error("Unexpected streaming error", {
        error: error instanceof Error ? error.message : error,
        model,
        enableMCP,
      });

      const { category: outerCategory, originalMessage: outerMessage } = classifyStreamingError(error);
      yield {
        error: outerMessage,
        errorCategory: outerCategory,
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
    const { messages, model, webSearch, enableMCP = false, projectDescription, projectContext } = request;

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

      // Load skills by scope (project-merged or global)
      const singleMsgCodeModeEnabled = request.codeMode?.enabled === true;
      const singleMsgCodeModePrompt = singleMsgCodeModeEnabled ? getCodeModeSystemPrompt() : null;

      const singleMsgProjectId = projectContext?.projectId;
      let singleMsgInstalledSkills: InstalledSkill[] = [];

      if (singleMsgCodeModeEnabled) {
        try {
          singleMsgInstalledSkills = await skillsService.listInstalledSkills(
            singleMsgProjectId
              ? { mode: 'project-merged', projectId: singleMsgProjectId }
              : { mode: 'global' }
          );
        } catch (error) {
          this.logger.aiSdk.warn('Failed to load installed skills for single message', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Get built-in tools with skills context
      const { getBuiltInTools } = await import('./ai/builtInTools');
      const singleMsgBuiltInTools = await getBuiltInTools({
        ...builtInToolsConfig,
        skills: singleMsgInstalledSkills,
      });

      const messagesWithFileParts = await this.includeAttachmentsInMessageParts(
        messages,
        modelInfo?.capabilities
      );

      const allSingleMsgTools = { ...singleMsgBuiltInTools, ...tools };
      const singleMsgTodoToolsEnabled = 'todo_write' in allSingleMsgTools;

      const result = await generateText({
        model: modelProvider,
        messages: await convertToModelMessages(sanitizeMessagesForModel(messagesWithFileParts)),
        tools: allSingleMsgTools,
        system: await buildSystemPrompt(
          webSearch,
          enableMCP,
          Object.keys(allSingleMsgTools).length,
          builtInToolsConfig.mermaidValidation,
          builtInToolsConfig.mcpDiscovery,
          projectDescription,
          singleMsgInstalledSkills,
          singleMsgCodeModePrompt,
          singleMsgTodoToolsEnabled
        ),
        stopWhen: stepCountIs(await calculateMaxSteps(Object.keys(allSingleMsgTools).length)),
        providerOptions: await getReasoningProviderOptions(model, undefined, Object.keys(allSingleMsgTools).length > 0),
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

      const wrapped = new Error(
        error instanceof Error ? error.message : "Unknown error occurred"
      );

      (wrapped as any).statusCode = (error as any)?.statusCode;
      (wrapped as any).responseBody = (error as any)?.responseBody;
      (wrapped as any).data = (error as any)?.data;
      (wrapped as any).url = (error as any)?.url;

      throw wrapped;
    }
  }
}
