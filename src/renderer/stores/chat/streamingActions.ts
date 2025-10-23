import type { UIMessage } from 'ai';
import type { ElectronMessage, ElectronChatStatus } from '@/hooks/useElectronChat';

/**
 * Streaming-related actions for the chat store
 */
export interface StreamingState {
  status: ElectronChatStatus;
  streamingMessage: ElectronMessage | null;
  onStreamFinish?: () => void;
}

export interface StreamingActions {
  setStatus: (status: ElectronChatStatus) => void;
  setStreamingMessage: (message: ElectronMessage | null) => void;
  setOnStreamFinish: (callback?: () => void) => void;
  sendMessage: (
    message: { text: string },
    options?: { body?: { model?: string; webSearch?: boolean; enableMCP?: boolean } }
  ) => Promise<void>;
  stopStreaming: () => Promise<void>;
}

export function createStreamingActions(
  set: any,
  get: any
): StreamingActions {
  return {
    setStatus: (status) => set({ status }),

    setStreamingMessage: (streamingMessage) => {
      set({ streamingMessage });
      get().updateDisplayMessages();
    },

    setOnStreamFinish: (callback) => set({ onStreamFinish: callback }),

    sendMessage: async (message: { text: string }, options?) => {
      const { model = 'openai/gpt-4o', webSearch = false, enableMCP = false } =
        options?.body || {};

      // Ensure we have a session
      let session = get().currentSession;
      if (!session) {
        console.log('[ChatStore] Creating new session for first message');
        session = await get().createSession('New Chat', model);
        if (!session) {
          set({ status: 'error' });
          return;
        }
      }

      set({ status: 'submitted' });

      try {
        // 1. Save user message to database
        const userDbMessage = await get().addMessage(message.text, 'user');
        if (!userDbMessage) {
          set({ status: 'error' });
          return;
        }

        // 2. Create streaming assistant message
        const streamingId = `streaming_${Date.now()}`;
        const streamingAssistantMessage: ElectronMessage = {
          id: streamingId,
          role: 'assistant',
          content: '',
          parts: []
        };

        // Track active tool calls
        const activeToolCalls = new Map<string, any>();

        set({ streamingMessage: streamingAssistantMessage, status: 'streaming' });

        // 3. Prepare API messages
        const { dbMessages } = get();
        const apiMessages: UIMessage[] = [...dbMessages, userDbMessage].map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          parts: [{ type: 'text' as const, text: msg.content }]
        }));

        let fullResponse = '';

        // 4. Stream the response
        await window.levante.streamChat(
          { messages: apiMessages, model, webSearch, enableMCP },
          (chunk) => {
            // Handle error chunks
            if (chunk.error) {
              console.error('[ChatStore] Stream error:', chunk.error);

              if (fullResponse) {
                fullResponse += `\n\n❌ Error: ${chunk.error}`;
              } else {
                fullResponse = `❌ Error: ${chunk.error}`;
              }

              set((state: any) => ({
                streamingMessage: state.streamingMessage
                  ? {
                      ...state.streamingMessage,
                      content: fullResponse,
                      parts: [{ type: 'text', text: fullResponse }]
                    }
                  : null,
                status: 'error'
              }));
              get().updateDisplayMessages();

              if (chunk.done) {
                get()
                  .addMessage(fullResponse, 'assistant')
                  .then(() => {
                    set({ streamingMessage: null });
                    get().updateDisplayMessages();
                  });
              }
              return;
            }

            if (chunk.delta) {
              fullResponse += chunk.delta;

              set((state: any) => ({
                streamingMessage: state.streamingMessage
                  ? {
                      ...state.streamingMessage,
                      content: fullResponse,
                      parts: [{ type: 'text', text: fullResponse }]
                    }
                  : null
              }));
              get().updateDisplayMessages();
            }

            if (chunk.sources) {
              set((state: any) => ({
                streamingMessage: state.streamingMessage
                  ? {
                      ...state.streamingMessage,
                      parts: [
                        ...(state.streamingMessage.parts || []),
                        ...chunk.sources!.map((source) => ({
                          type: 'source-url' as const,
                          url: source.url
                        }))
                      ]
                    }
                  : null
              }));
              get().updateDisplayMessages();
            }

            if (chunk.reasoning) {
              set((state: any) => ({
                streamingMessage: state.streamingMessage
                  ? {
                      ...state.streamingMessage,
                      parts: [
                        ...(state.streamingMessage.parts || []),
                        { type: 'reasoning', text: chunk.reasoning! }
                      ]
                    }
                  : null
              }));
              get().updateDisplayMessages();
            }

            if (chunk.toolCall) {
              activeToolCalls.set(chunk.toolCall.id, chunk.toolCall);

              set((state: any) => ({
                streamingMessage: state.streamingMessage
                  ? {
                      ...state.streamingMessage,
                      parts: [
                        ...(state.streamingMessage.parts?.filter(
                          (p) =>
                            !(p.type === 'tool-call' && p.toolCall?.id === chunk.toolCall!.id)
                        ) || []),
                        {
                          type: 'tool-call',
                          toolCall: chunk.toolCall!
                        }
                      ]
                    }
                  : null
              }));
              get().updateDisplayMessages();
            }

            if (chunk.toolResult) {
              const toolCall = activeToolCalls.get(chunk.toolResult.id);
              if (toolCall) {
                const isSuccess = chunk.toolResult.status === 'success';
                toolCall.result = {
                  success: isSuccess,
                  content: isSuccess
                    ? typeof chunk.toolResult.result === 'string'
                      ? chunk.toolResult.result
                      : JSON.stringify(chunk.toolResult.result)
                    : undefined,
                  error: !isSuccess
                    ? chunk.toolResult.result?.error || 'Tool execution failed'
                    : undefined
                };
                toolCall.status = chunk.toolResult.status;

                set((state: any) => ({
                  streamingMessage: state.streamingMessage
                    ? {
                        ...state.streamingMessage,
                        parts:
                          state.streamingMessage.parts?.map((p: any) =>
                            p.type === 'tool-call' && p.toolCall?.id === chunk.toolResult!.id
                              ? { ...p, toolCall }
                              : p
                          ) || []
                      }
                    : null
                }));
                get().updateDisplayMessages();
              }
            }

            if (chunk.done) {
              if (fullResponse) {
                const toolCallsArray = Array.from(activeToolCalls.values());

                get()
                  .addMessageWithTools(
                    fullResponse,
                    'assistant',
                    toolCallsArray.length > 0 ? toolCallsArray : null
                  )
                  .then((savedMessage: any) => {
                    if (savedMessage) {
                      set({ streamingMessage: null, status: 'ready' });
                      get().updateDisplayMessages();

                      const { onStreamFinish } = get();
                      if (onStreamFinish) {
                        onStreamFinish();
                      }
                    } else {
                      console.error('[ChatStore] Failed to save assistant message to database');
                      set({
                        status: 'error',
                        error:
                          'Failed to save message. Your response is preserved above - you can retry or continue the conversation.'
                      });
                    }
                  })
                  .catch((error: any) => {
                    console.error('[ChatStore] Error saving assistant message:', error);
                    set({
                      status: 'error',
                      error:
                        'Failed to save message. Your response is preserved above - you can retry or continue the conversation.'
                    });
                  });
              } else {
                set({ streamingMessage: null, status: 'ready' });
                get().updateDisplayMessages();

                const { onStreamFinish } = get();
                if (onStreamFinish) {
                  onStreamFinish();
                }
              }
            }
          }
        );
      } catch (error) {
        console.error('[ChatStore] Chat error:', error);
        set({ status: 'error' });

        await get().addMessage(
          'Sorry, there was an error processing your request.',
          'assistant'
        );
        set({ streamingMessage: null });
        get().updateDisplayMessages();
      }
    },

    stopStreaming: async () => {
      console.log('[ChatStore] Stopping current stream');

      try {
        const result = await window.levante.stopStreaming();

        if (result.success) {
          console.log('[ChatStore] Stream stopped successfully');
          set({
            status: 'ready',
            streamingMessage: null
          });
          get().updateDisplayMessages();
        } else {
          console.error('[ChatStore] Failed to stop stream:', result.error);
          set({ error: result.error || 'Failed to stop stream' });
        }
      } catch (error) {
        console.error('[ChatStore] Error stopping stream:', error);
        set({
          status: 'ready',
          streamingMessage: null,
          error: error instanceof Error ? error.message : 'Unknown error stopping stream'
        });
        get().updateDisplayMessages();
      }
    }
  };
}
