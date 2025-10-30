/**
 * Chat IPC Handlers Module
 *
 * Handles all chat-related IPC communication:
 * - Streaming chat responses (levante/chat/stream)
 * - Stopping active streams (levante/chat/stop-stream)
 * - Single message requests (levante/chat/send)
 */

import { ipcMain, IpcMainInvokeEvent } from "electron";
import { getLogger } from "../services/logging";
import { AIService, ChatRequest } from "../services/aiService";

const logger = getLogger();

// AI Service instance
const aiService = new AIService();

// Active streaming sessions
const activeStreams = new Map<string, { cancel: () => void }>();

/**
 * Register all chat-related IPC handlers
 */
export function setupChatHandlers(): void {
  // Streaming chat handler
  ipcMain.handle("levante/chat/stream", handleChatStream);

  // Stop streaming handler
  ipcMain.handle("levante/chat/stop-stream", handleStopStream);

  // Non-streaming chat handler
  ipcMain.handle("levante/chat/send", handleChatSend);

  logger.core.info("Chat handlers registered successfully");
}

/**
 * Handle streaming chat request
 * Creates a stream ID and starts async streaming to renderer
 */
async function handleChatStream(
  event: IpcMainInvokeEvent,
  request: ChatRequest
): Promise<{ streamId: string }> {
  const streamId = `stream_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 11)}`;

  logger.aiSdk.debug("Received chat stream request", {
    requestId: streamId,
    model: request.model,
    messagesCount: request.messages.length,
  });

  let isCancelled = false;

  activeStreams.set(streamId, {
    cancel: () => {
      isCancelled = true;
      logger.aiSdk.info("Stream cancelled", { streamId });
    },
  });

  setTimeout(async () => {
    try {
      logger.aiSdk.debug("Starting AI stream", { streamId });
      let chunkCount = 0;
      for await (const chunk of aiService.streamChat(request)) {
        chunkCount++;

        if (isCancelled) {
          logger.aiSdk.info("Stream cancelled, stopping generation", { streamId });
          event.sender.send(`levante/chat/stream/${streamId}`, {
            error: "Stream cancelled by user",
            done: true,
          });
          break;
        }

        event.sender.send(`levante/chat/stream/${streamId}`, chunk);
        await new Promise((resolve) => setImmediate(resolve));

        if (chunk.done) {
          logger.aiSdk.info("AI stream completed successfully", {
            streamId,
            totalChunks: chunkCount,
          });
          break;
        }
      }
      logger.aiSdk.info("Exited streaming loop", { streamId, totalChunks: chunkCount });
    } catch (error) {
      logger.aiSdk.error("AI Stream error", {
        streamId,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      event.sender.send(`levante/chat/stream/${streamId}`, {
        error: error instanceof Error ? error.message : "Stream error",
        done: true,
      });
    } finally {
      activeStreams.delete(streamId);
      logger.aiSdk.debug("Stream cleanup complete", { streamId });
    }
  }, 10);

  logger.aiSdk.debug("Returning streamId", { streamId });
  return { streamId };
}

/**
 * Handle stop stream request
 * Cancels an active streaming session
 */
async function handleStopStream(
  event: IpcMainInvokeEvent,
  streamId: string
): Promise<{ success: boolean; error?: string }> {
  logger.aiSdk.debug("Received stop stream request", { streamId });

  try {
    const streamControl = activeStreams.get(streamId);
    if (streamControl) {
      streamControl.cancel();
      activeStreams.delete(streamId);
      logger.aiSdk.info("Stream stopped successfully", { streamId });
      return { success: true };
    } else {
      logger.aiSdk.warn("Stream not found or already completed", { streamId });
      return { success: false, error: "Stream not found or already completed" };
    }
  } catch (error) {
    logger.aiSdk.error("Error stopping stream", {
      streamId,
      error: error instanceof Error ? error.message : error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Handle non-streaming chat request
 * Returns complete response in single message
 */
async function handleChatSend(
  event: IpcMainInvokeEvent,
  request: ChatRequest
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const result = await aiService.sendSingleMessage(request);
    return {
      success: true,
      ...result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
