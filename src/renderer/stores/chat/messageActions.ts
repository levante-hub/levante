import type { Message, CreateMessageInput } from '../../../types/database';
import { convertToElectronMessage } from './messageUtils';

/**
 * Message-related actions for the chat store
 */
export interface MessageState {
  dbMessages: Message[];
  messagesOffset: number;
  hasMoreMessages: boolean;
}

export interface MessageActions {
  setDbMessages: (messages: Message[]) => void;
  addDbMessage: (message: Message) => void;
  appendDbMessages: (messages: Message[]) => void;
  updateDisplayMessages: () => void;
  addMessage: (content: string, role: 'user' | 'assistant' | 'system') => Promise<Message | null>;
  addMessageWithTools: (
    content: string,
    role: 'user' | 'assistant' | 'system',
    toolCallsData?: any[] | null
  ) => Promise<Message | null>;
  loadMoreMessages: () => Promise<void>;
}

export function createMessageActions(
  set: any,
  get: any
): MessageActions {
  return {
    setDbMessages: (dbMessages) => {
      set({ dbMessages, messagesOffset: dbMessages.length, hasMoreMessages: true });
      get().updateDisplayMessages();
    },

    addDbMessage: (message) => {
      set((state: any) => ({ dbMessages: [...state.dbMessages, message] }));
      get().updateDisplayMessages();
    },

    appendDbMessages: (messages) => {
      set((state: any) => {
        const combinedMessages = [...state.dbMessages, ...messages]
          .sort((a, b) => a.created_at - b.created_at);

        return {
          dbMessages: combinedMessages,
          messagesOffset: state.messagesOffset + messages.length
        };
      });
      get().updateDisplayMessages();
    },

    updateDisplayMessages: () => {
      const { dbMessages, streamingMessage } = get();
      const sortedDbMessages = [...dbMessages].sort((a, b) => a.created_at - b.created_at);
      const electronMessages = sortedDbMessages.map(convertToElectronMessage);

      if (streamingMessage) {
        set({ messages: [...electronMessages, streamingMessage] });
      } else {
        set({ messages: electronMessages });
      }
    },

    addMessage: async (content: string, role: 'user' | 'assistant' | 'system') => {
      const { currentSession } = get();
      if (!currentSession) {
        set({ error: 'No active session' });
        return null;
      }

      try {
        set({ error: null });

        const input: CreateMessageInput = {
          session_id: currentSession.id,
          role,
          content,
          tool_calls: null
        };

        const result = await window.levante.db.messages.create(input);

        if (result.success && result.data) {
          const newMessage = result.data;
          get().addDbMessage(newMessage);

          // Auto-generate title for first user message
          if (role === 'user') {
            const currentState = get();
            const { dbMessages } = currentState;

            const userMessagesInSession = dbMessages.filter((msg: Message) =>
              msg.session_id === currentSession.id && msg.role === 'user'
            );

            if (userMessagesInSession.length === 1 && userMessagesInSession[0].id === newMessage.id) {
              const originalSessionId = currentSession.id;

              (async () => {
                try {
                  console.log('[ChatStore] Generating title for session:', originalSessionId);

                  const titleResult = await window.levante.db.generateTitle(content);

                  if (titleResult.success && titleResult.data) {
                    const newTitle = titleResult.data;

                    const currentStateAfterGeneration = get();
                    if (currentStateAfterGeneration.currentSession?.id === originalSessionId) {
                      try {
                        await get().updateSessionTitle(originalSessionId, newTitle);
                        console.log('[ChatStore] Title generated and updated:', newTitle);
                      } catch (updateError) {
                        console.error('[ChatStore] Failed to update session title:', updateError);
                      }
                    } else {
                      console.log('[ChatStore] Session changed during title generation, ignoring result');
                    }
                  }
                } catch (error) {
                  console.error('[ChatStore] Failed to generate title:', error);
                }
              })();
            }
          }

          console.log('[ChatStore] Message added:', newMessage.id);
          return newMessage;
        } else {
          set({ error: result.error || 'Failed to add message' });
          return null;
        }
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Unknown error' });
        return null;
      }
    },

    addMessageWithTools: async (
      content: string,
      role: 'user' | 'assistant' | 'system',
      toolCallsData?: any[] | null
    ) => {
      const { currentSession } = get();
      if (!currentSession) {
        set({ error: 'No active session' });
        return null;
      }

      try {
        set({ error: null });

        const input: CreateMessageInput = {
          session_id: currentSession.id,
          role,
          content,
          tool_calls: toolCallsData
        };

        const result = await window.levante.db.messages.create(input);

        if (result.success && result.data) {
          const newMessage = result.data;
          get().addDbMessage(newMessage);

          console.log(
            '[ChatStore] Message with tools added:',
            newMessage.id,
            toolCallsData ? 'with tool calls' : 'without tool calls'
          );
          return newMessage;
        } else {
          set({ error: result.error || 'Failed to add message with tools' });
          return null;
        }
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Unknown error' });
        return null;
      }
    },

    loadMoreMessages: async () => {
      const { currentSession, hasMoreMessages, loading, messagesOffset } = get();
      if (!currentSession || !hasMoreMessages || loading) return;

      set({ loading: true });

      try {
        const result = await window.levante.db.messages.list({
          session_id: currentSession.id,
          limit: 50,
          offset: messagesOffset
        });

        if (result.success && result.data) {
          get().appendDbMessages(result.data.items);
          set({ hasMoreMessages: result.data.items.length === 50 });
        }
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Unknown error' });
      } finally {
        set({ loading: false });
      }
    }
  };
}
