import type {
  ChatTransport,
  ChatRequestOptions,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import type { ChatRequest, ChatStreamChunk } from '../../preload/types';

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
  private currentTextPartId = '';
  private currentController: ReadableStreamDefaultController<UIMessageChunk> | null = null;

  constructor(
    private defaultOptions: {
      model?: string;
      webSearch?: boolean;
      enableMCP?: boolean;
    } = {}
  ) {}

  /**
   * Sends messages to the chat API via Electron IPC and returns a streaming response.
   *
   * This implements the ChatTransport.sendMessages interface required by AI SDK v5.
   */
  async sendMessages(options: {
    trigger: 'submit-message' | 'regenerate-message';
    chatId: string;
    messageId: string | undefined;
    messages: UIMessage[];
    abortSignal: AbortSignal | undefined;
  } & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, abortSignal, body, chatId } = options;

    // Merge default options with per-request options
    const bodyObj = (body || {}) as Record<string, any>;
    const model = (bodyObj.model as string) || this.defaultOptions.model || 'openai/gpt-4o';
    const webSearch = (bodyObj.webSearch as boolean) ?? this.defaultOptions.webSearch ?? false;
    const enableMCP = (bodyObj.enableMCP as boolean) ?? this.defaultOptions.enableMCP ?? false;

    // Create Electron IPC request
    const request: ChatRequest = {
      messages,
      model,
      webSearch,
      enableMCP,
    };

    // Reset text part tracking for new stream
    this.hasStartedTextPart = false;
    this.currentTextPartId = `text-${Date.now()}`;

    // Create a ReadableStream that bridges Electron IPC with AI SDK
    return new ReadableStream<UIMessageChunk>({
      start: async (controller) => {
        // Store controller for external cancellation
        this.currentController = controller;

        // Track if we've been aborted
        let isAborted = false;

        // Handle abort signal
        if (abortSignal) {
          abortSignal.addEventListener('abort', async () => {
            isAborted = true;
            await window.levante.stopStreaming();

            // Close text part if needed before closing stream
            if (this.hasStartedTextPart) {
              try {
                controller.enqueue({
                  type: 'text-end',
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

        try {
          // Start streaming via Electron IPC
          await window.levante.streamChat(request, (chunk: ChatStreamChunk) => {
            if (isAborted) {
              return;
            }

            try {
              // Convert Electron chunk to AI SDK UIMessageChunk format
              const uiChunks = this.convertChunkToUIMessageChunks(chunk);

              // Enqueue all generated chunks
              for (const uiChunk of uiChunks) {
                controller.enqueue(uiChunk);
              }

              // Close stream when done
              if (chunk.done) {
                controller.close();
                this.currentController = null;
              }
            } catch (error) {
              controller.error(error);
              this.currentController = null;
            }
          });
        } catch (error) {
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
   *
   * AI SDK v5 uses a specific streaming protocol with typed chunks:
   * - text-start, text-delta, text-end for text content
   * - tool-input-start, tool-input-delta, tool-input-available for tool calls
   * - data-part-start, data-part-delta, data-part-available for custom data
   * - error for errors
   */
  private convertChunkToUIMessageChunks(chunk: ChatStreamChunk): UIMessageChunk[] {
    const chunks: UIMessageChunk[] = [];

    // Handle errors
    if (chunk.error) {
      // End text part if one was started
      if (this.hasStartedTextPart) {
        chunks.push({
          type: 'text-end',
          id: this.currentTextPartId,
        });
        this.hasStartedTextPart = false;
      }

      chunks.push({
        type: 'error',
        errorText: chunk.error,
      });
      return chunks;
    }

    // Handle text deltas
    if (chunk.delta) {
      // Emit text-start before first delta
      if (!this.hasStartedTextPart) {
        chunks.push({
          type: 'text-start',
          id: this.currentTextPartId,
        });
        this.hasStartedTextPart = true;
      }

      // Emit text-delta
      chunks.push({
        type: 'text-delta',
        id: this.currentTextPartId,
        delta: chunk.delta,
      });
    }

    // Handle stream completion
    if (chunk.done) {
      // End text part if one was started
      if (this.hasStartedTextPart) {
        chunks.push({
          type: 'text-end',
          id: this.currentTextPartId,
        });
        this.hasStartedTextPart = false;
      }
    }

    // Handle tool calls (MCP integration)
    if (chunk.toolCall) {
      // Start of tool input
      chunks.push({
        type: 'tool-input-start',
        toolCallId: chunk.toolCall.id,
        toolName: chunk.toolCall.name,
      });

      // Tool arguments are available immediately
      chunks.push({
        type: 'tool-input-available',
        toolCallId: chunk.toolCall.id,
        toolName: chunk.toolCall.name,
        input: chunk.toolCall.arguments,
      });
    }

    // Handle tool results
    if (chunk.toolResult) {
      const isError = chunk.toolResult.status === 'error';

      if (isError) {
        chunks.push({
          type: 'tool-output-error',
          toolCallId: chunk.toolResult.id,
          errorText: typeof chunk.toolResult.result === 'string'
            ? chunk.toolResult.result
            : JSON.stringify(chunk.toolResult.result),
        });
      } else {
        chunks.push({
          type: 'tool-output-available',
          toolCallId: chunk.toolResult.id,
          output: chunk.toolResult.result,
        });
      }
    }

    // Handle sources (custom data part for RAG/web search)
    if (chunk.sources && chunk.sources.length > 0) {
      for (const source of chunk.sources) {
        chunks.push({
          type: 'data-part-available',
          id: `source-${source.url}`,
          data: {
            type: 'source-url' as const,
            url: source.url,
            title: source.title,
          },
        });
      }
    }

    // Handle reasoning (custom data part for extended thinking)
    if (chunk.reasoning) {
      chunks.push({
        type: 'data-part-available',
        id: `reasoning-${Date.now()}`,
        data: {
          type: 'reasoning' as const,
          text: chunk.reasoning,
        },
      });
    }

    return chunks;
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
 *   webSearch: false,
 *   enableMCP: true
 * });
 *
 * const { messages, sendMessage } = useChat({ transport });
 * ```
 */
export function createElectronChatTransport(options?: {
  model?: string;
  webSearch?: boolean;
  enableMCP?: boolean;
}): ElectronChatTransport {
  return new ElectronChatTransport(options);
}
