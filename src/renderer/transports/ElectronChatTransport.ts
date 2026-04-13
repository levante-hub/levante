import type {
  ChatTransport,
  ChatRequestOptions,
  UIMessage,
  UIMessageChunk,
} from "ai";
import type { ChatRequest, ChatStreamChunk, TokenUsage } from "../../preload/types";
import { logger } from "@/services/logger";
import { ChunkBatcher } from "@/utils/chunkBatcher";

/**
 * Custom ChatTransport implementation for Electron IPC integration with AI SDK v5.
 *
 * This transport bridges the AI SDK v5's useChat hook with Electron's IPC system,
 * allowing seamless communication between the renderer and main processes while
 * maintaining compatibility with AI SDK's streaming protocol.
 *
 * Key features:
 * - Converts UIMessage[] to Electron IPC ChatRequest format
 * - Transforms Electron streaming chunks to UIMessageChunk format
 * - Supports abort signals for cancellation
 * - Handles tool calls, reasoning, and sources from MCP
 */
export class ElectronChatTransport implements ChatTransport<UIMessage> {
  private hasStartedTextPart = false;
  private currentTextPartId = "";
  private currentController: ReadableStreamDefaultController<UIMessageChunk> | null =
    null;
  /** Category of the last streaming error, if any */
  public lastErrorCategory: string | undefined = undefined;
  private lastTokenUsage: TokenUsage | null = null;
  private lastRequestMessageTokens: number | null = null;
  private lastLearnedOverheadTokens: number | null = null;
  private static readonly COMPACTION_MARKER = '[COMPACTION_SUMMARY]';
  private static readonly CHARS_PER_TOKEN = 4;

  constructor(
    private defaultOptions: {
      model?: string;
      enableMCP?: boolean;
      coworkMode?: boolean;
      coworkModeCwd?: string | null;
      projectDescription?: string | null;
      projectId?: string | null;
    } = {}
  ) {}

  consumeLastTokenUsage(): TokenUsage | null {
    const usage = this.lastTokenUsage;
    this.lastTokenUsage = null;
    return usage;
  }

  consumeLastLearnedOverheadTokens(): number | null {
    const val = this.lastLearnedOverheadTokens;
    this.lastLearnedOverheadTokens = null;
    return val;
  }

  consumeLastRequestMessageTokens(): number | null {
    const val = this.lastRequestMessageTokens;
    this.lastRequestMessageTokens = null;
    return val;
  }

  private extractText(message: UIMessage): string {
    if (!message.parts || !Array.isArray(message.parts)) return '';
    return message.parts
      .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
      .map((p: any) => p.text)
      .join('\n')
      .trim();
  }

  private buildContextMessages(messages: UIMessage[]): UIMessage[] {
    let compactionIndex = -1;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'system') continue;

      const text = this.extractText(msg);
      if (text.startsWith(ElectronChatTransport.COMPACTION_MARKER)) {
        compactionIndex = i;
        break;
      }
    }

    const scoped = compactionIndex >= 0 ? messages.slice(compactionIndex) : messages;

    return scoped.map((msg) => {
      if (msg.role !== 'system') return msg;

      const text = this.extractText(msg);
      if (!text.startsWith(ElectronChatTransport.COMPACTION_MARKER)) return msg;

      const clean = text.replace(ElectronChatTransport.COMPACTION_MARKER, '').trim();

      return {
        ...msg,
        role: 'assistant',
        parts: [{ type: 'text', text: clean } as any],
      } as UIMessage;
    });
  }

  /**
   * Sends messages to the chat API via Electron IPC and returns a streaming response.
   *
   * This implements the ChatTransport.sendMessages interface required by AI SDK v5.
   */
  async sendMessages(
    options: {
      trigger: "submit-message" | "regenerate-message";
      chatId: string;
      messageId: string | undefined;
      messages: UIMessage[];
      abortSignal: AbortSignal | undefined;
    } & ChatRequestOptions
  ): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, abortSignal, body, chatId } = options;

    // Merge default options with per-request options
    const bodyObj = (body || {}) as Record<string, any>;
    const model =
      (bodyObj.model as string) || this.defaultOptions.model || "openai/gpt-4o";
    const enableMCP =
      (bodyObj.enableMCP as boolean) ?? this.defaultOptions.enableMCP ?? true;
    const coworkMode =
      (bodyObj.coworkMode as boolean) ?? this.defaultOptions.coworkMode ?? false;
    const coworkModeCwd =
      (bodyObj.coworkModeCwd as string | null) ?? this.defaultOptions.coworkModeCwd ?? null;
    const projectDescription =
      (bodyObj.projectDescription as string | null) ?? this.defaultOptions.projectDescription ?? undefined;
    const projectId =
      (bodyObj.projectId as string | null) ?? this.defaultOptions.projectId ?? null;
    const attachments = bodyObj.attachments; // Extract attachments directly from body

    logger.aiSdk.debug("Transport body received", {
      hasBody: !!body,
      hasAttachments: !!attachments,
      attachmentsCount: attachments?.length || 0,
      bodyKeys: Object.keys(bodyObj),
      attachmentsPreview: attachments?.map((a: any) => ({
        type: a.type,
        filename: a.filename,
        hasData: !!a.data,
      })),
    });

    // If attachments are provided, inject them into the last user message
    let messagesWithAttachments = messages;
    if (attachments && attachments.length > 0) {
      // Find the last user message and add attachments
      const lastUserMessageIndex = messages
        .map((m) => m.role)
        .lastIndexOf("user");
      logger.aiSdk.debug("Transport injecting attachments", {
        lastUserMessageIndex,
        attachmentsCount: attachments.length,
        messagesBefore: messages.length,
      });

      if (lastUserMessageIndex !== -1) {
        messagesWithAttachments = [...messages];
        messagesWithAttachments[lastUserMessageIndex] = {
          ...messagesWithAttachments[lastUserMessageIndex],
          attachments,
        } as any;

        logger.aiSdk.debug("Transport attachments injected", {
          messageId: messagesWithAttachments[lastUserMessageIndex].id,
          hasAttachments: !!(
            messagesWithAttachments[lastUserMessageIndex] as any
          ).attachments,
          attachmentsCount: (
            messagesWithAttachments[lastUserMessageIndex] as any
          ).attachments?.length,
        });
      }
    } else {
      logger.aiSdk.debug("Transport no attachments to inject");
    }

    // Build context messages (filter by compaction marker)
    const contextMessages = this.buildContextMessages(messagesWithAttachments);

    // Create Electron IPC request
    // Only send codeMode when both coworkMode is enabled AND a valid CWD is selected
    const request: ChatRequest = {
      messages: contextMessages,
      model,
      enableMCP,
      ...(chatId !== 'new-chat' && { sessionId: chatId }),
      ...(coworkMode && coworkModeCwd && {
        codeMode: {
          enabled: true,
          cwd: coworkModeCwd,
        },
      }),
      ...(projectDescription && { projectDescription }),
      ...(projectId && {
        projectContext: { projectId },
      }),
    };

    logger.aiSdk.debug("Transport request codeMode", {
      coworkMode,
      coworkModeCwd,
      hasCodeMode: !!(coworkMode && coworkModeCwd),
    });

    // Estimate tokens of messages being sent (for learned overhead calculation)
    const requestMsgTokens = contextMessages.reduce((sum, msg) => {
      return sum + Math.max(0, Math.round(this.extractText(msg).length / ElectronChatTransport.CHARS_PER_TOKEN));
    }, 0);
    this.lastRequestMessageTokens = requestMsgTokens;

    // Reset text part tracking, error state and token usage for new stream
    this.hasStartedTextPart = false;
    this.currentTextPartId = `text-${Date.now()}`;
    this.lastErrorCategory = undefined;
    this.lastTokenUsage = null;

    // Create a ReadableStream that bridges Electron IPC with AI SDK
    return new ReadableStream<UIMessageChunk>({
      start: async (controller) => {
        // Store controller for external cancellation
        this.currentController = controller;

        // Track if we've been aborted
        let isAborted = false;

        // Handle abort signal
        if (abortSignal) {
          abortSignal.addEventListener("abort", async () => {
            isAborted = true;
            await window.levante.stopStreaming();

            // Close text part if needed before closing stream
            if (this.hasStartedTextPart) {
              try {
                controller.enqueue({
                  type: "text-end",
                  id: this.currentTextPartId,
                });
              } catch (e) {
                // Controller might already be closed
              }
              this.hasStartedTextPart = false;
            }

            try {
              controller.close();
            } catch (e) {
              // Controller might already be closed
            }

            this.currentController = null;
          });
        }

        // Create batcher to group chunks by animation frame (~16ms)
        // This reduces React re-renders from ~100/s to ~60/s max
        const batcher = new ChunkBatcher<UIMessageChunk>((chunks) => {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
        });

        try {
          // Start streaming via Electron IPC
          await window.levante.streamChat(request, (chunk: ChatStreamChunk) => {
            if (isAborted) {
              return;
            }

            try {
              // Capture token usage before converting chunks
              if (chunk.tokenUsage) {
                this.lastTokenUsage = chunk.tokenUsage;

                // Compute learned overhead from real usage
                if (chunk.tokenUsage.inputTokens > 0 && this.lastRequestMessageTokens !== null) {
                  const learned = Math.max(0, chunk.tokenUsage.inputTokens - this.lastRequestMessageTokens);
                  this.lastLearnedOverheadTokens = learned;
                  logger.aiSdk.debug('Transport: learned overhead computed', {
                    inputTokens: chunk.tokenUsage.inputTokens,
                    requestMessageTokens: this.lastRequestMessageTokens,
                    learnedOverhead: learned,
                  });
                }
                return;
              }

              // Convert Electron chunk to AI SDK UIMessageChunk format using generator
              // Generator avoids intermediate array allocations
              for (const uiChunk of this.convertChunkToUIMessageChunks(chunk)) {
                batcher.add(uiChunk);
              }

              // Close stream when done
              if (chunk.done) {
                // Flush remaining chunks and destroy batcher
                batcher.destroy();
                logger.aiSdk.debug("Transport stream done, closing");
                controller.close();
                this.currentController = null;
              }
            } catch (error) {
              batcher.destroy();
              logger.aiSdk.error("Transport error processing chunk", {
                error: error instanceof Error ? error.message : error,
              });
              controller.error(error);
              this.currentController = null;
            }
          });
        } catch (error) {
          batcher.destroy();
          if (!isAborted) {
            controller.error(error);
            this.currentController = null;
          }
        }
      },

      cancel: async () => {
        // Stop the streaming when consumer cancels
        await window.levante.stopStreaming();
        this.currentController = null;
      },
    });
  }

  /**
   * Reconnects to an existing streaming response.
   * Currently not implemented for Electron IPC, but required by ChatTransport interface.
   */
  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    // Electron IPC doesn't support reconnection pattern yet
    // This would require stream persistence in the main process
    return null;
  }

  /**
   * Converts Electron IPC ChatStreamChunk to AI SDK UIMessageChunk format.
   * Uses a generator to avoid intermediate array allocations.
   *
   * AI SDK v5 uses a specific streaming protocol with typed chunks:
   * - text-start, text-delta, text-end for text content
   * - tool-input-start, tool-input-delta, tool-input-available for tool calls
   * - data-part-start, data-part-delta, data-part-available for custom data
   * - error for errors
   */
  private *convertChunkToUIMessageChunks(
    chunk: ChatStreamChunk
  ): Generator<UIMessageChunk> {
    if (chunk.stepStart) {
      // Keep text parts scoped per step. This matches AI SDK expectations
      // when process-ui-message-stream resets active text parts on finish-step.
      if (this.hasStartedTextPart) {
        yield {
          type: "text-end",
          id: this.currentTextPartId,
        };
        this.hasStartedTextPart = false;
      }

      this.currentTextPartId = `text-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      yield { type: "start-step" };
    }

    if (chunk.stepFinish) {
      if (this.hasStartedTextPart) {
        yield {
          type: "text-end",
          id: this.currentTextPartId,
        };
        this.hasStartedTextPart = false;
      }
      yield { type: "finish-step" };
    }

    // Handle errors
    if (chunk.error) {
      // End text part if one was started
      if (this.hasStartedTextPart) {
        yield {
          type: "text-end",
          id: this.currentTextPartId,
        };
        this.hasStartedTextPart = false;
      }

      // Store category so ChatPage can read it
      if (chunk.errorCategory) {
        this.lastErrorCategory = chunk.errorCategory;
      }

      yield {
        type: "error",
        errorText: chunk.error,
      };
      return;
    }

    // Handle text deltas
    if (chunk.delta) {
      // Emit text-start before first delta
      if (!this.hasStartedTextPart) {
        yield {
          type: "text-start",
          id: this.currentTextPartId,
        };
        this.hasStartedTextPart = true;
      }

      // Emit text-delta
      yield {
        type: "text-delta",
        id: this.currentTextPartId,
        delta: chunk.delta,
      };
    }

    // Handle stream completion
    if (chunk.done) {
      // End text part if one was started
      if (this.hasStartedTextPart) {
        yield {
          type: "text-end",
          id: this.currentTextPartId,
        };
        this.hasStartedTextPart = false;
      }
    }

    // Handle tool approval requests (for needsApproval: true tools)
    if (chunk.toolApproval) {
      // Garantizar que input sea siempre un objeto
      const safeInput = chunk.toolApproval.input ?? {};

      // NO emitir tool-input-start aquí - si lo emitimos, resetea el part a 'input-streaming'
      // y tool-approval-request nunca puede transicionar a 'approval-requested'

      // Emit tool-approval-request chunk for AI SDK to set state to 'approval-requested'
      yield {
        type: "tool-approval-request",
        toolCallId: chunk.toolApproval.toolCallId,
        toolName: chunk.toolApproval.toolName,
        approvalId: chunk.toolApproval.approvalId,
        input: safeInput,
        toolCall: {
          toolCallId: chunk.toolApproval.toolCallId,
          toolName: chunk.toolApproval.toolName,
          input: safeInput,
        },
      } as any;
    }

    // Handle tool calls (MCP integration)
    if (chunk.toolCall) {
      // Start of tool input
      yield {
        type: "tool-input-start",
        toolCallId: chunk.toolCall.id,
        toolName: chunk.toolCall.name,
        providerExecuted: chunk.toolCall.providerExecuted,
        providerMetadata: chunk.toolCall.providerMetadata as any,
      };

      // Tool arguments are available immediately
      yield {
        type: "tool-input-available",
        toolCallId: chunk.toolCall.id,
        toolName: chunk.toolCall.name,
        input: chunk.toolCall.arguments,
        providerExecuted: chunk.toolCall.providerExecuted,
        providerMetadata: chunk.toolCall.providerMetadata as any,
      };
    }

    // Handle tool results
    if (chunk.toolResult) {
      const isError = chunk.toolResult.status === "error";

      if (isError) {
        yield {
          type: "tool-output-error",
          toolCallId: chunk.toolResult.id,
          errorText:
            typeof chunk.toolResult.result === "string"
              ? chunk.toolResult.result
              : JSON.stringify(chunk.toolResult.result),
          providerExecuted: chunk.toolResult.providerExecuted,
        };
      } else {
        yield {
          type: "tool-output-available",
          toolCallId: chunk.toolResult.id,
          output: chunk.toolResult.result,
          providerExecuted: chunk.toolResult.providerExecuted,
        };
      }
    }

    // Handle sources (custom data part for RAG/web search)
    if (chunk.sources && chunk.sources.length > 0) {
      for (const source of chunk.sources) {
        yield {
          type: "data-part-available",
          id: `source-${source.url}`,
          data: {
            type: "source-url" as const,
            url: source.url,
            title: source.title,
          },
        };
      }
    }

    // Handle reasoning (custom data part for extended thinking)
    if (chunk.reasoningText) {
      // Use stable reasoningId from chunk for reconciliation, fallback to timestamp
      const reasoningId = chunk.reasoningId || `reasoning-${Date.now()}`;
      yield {
        type: "data-reasoning",
        id: reasoningId,
        data: {
          text: chunk.reasoningText,
        },
      };
    }

    // Handle generated attachments (images, audio, video from inference models)
    if (chunk.generatedAttachment) {
      yield {
        type: "data-part-available",
        id: `generated-attachment-${Date.now()}`,
        data: {
          type: "generated-attachment" as const,
          attachmentType: chunk.generatedAttachment.type,
          mime: chunk.generatedAttachment.mime,
          dataUrl: chunk.generatedAttachment.dataUrl,
          filename: chunk.generatedAttachment.filename,
        },
      };
    }
  }

  /**
   * Updates transport options (model, webSearch, enableMCP)
   */
  updateOptions(options: Partial<typeof this.defaultOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }
}

/**
 * Factory function to create an ElectronChatTransport instance
 *
 * Usage:
 * ```tsx
 * const transport = createElectronChatTransport({
 *   model: 'openai/gpt-4o',
 *   enableMCP: true,
 *   coworkMode: false
 * });
 *
 * const { messages, sendMessage } = useChat({ transport });
 * ```
 */
export function createElectronChatTransport(options?: {
  model?: string;
  enableMCP?: boolean;
  coworkMode?: boolean;
  coworkModeCwd?: string | null;
  projectDescription?: string | null;
  projectId?: string | null;
}): ElectronChatTransport {
  return new ElectronChatTransport(options);
}
