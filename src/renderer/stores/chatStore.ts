/**
 * ChatStore - Simplified for AI SDK v5 Integration
 *
 * This store is now focused ONLY on:
 * - Session management (CRUD operations)
 * - Message persistence to database
 * - Loading historical messages
 *
 * What it NO LONGER handles (AI SDK does this):
 * - Streaming state ❌ (useChat handles this)
 * - Message display ❌ (useChat handles this)
 * - ElectronMessage conversion ❌ (ElectronChatTransport handles this)
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ChatSession, Message, CreateMessageInput } from '../../types/database';
import type { UIMessage } from 'ai';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

interface ChatStore {
  // Session state
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  loading: boolean;
  error: string | null;

  // Deep link state
  pendingPrompt: string | null;

  // Session actions
  refreshSessions: () => Promise<void>;
  createSession: (title?: string, model?: string) => Promise<ChatSession | null>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<boolean>;
  setCurrentSession: (session: ChatSession | null) => void;
  startNewChat: () => void;

  // Message persistence (called by useChat onFinish callback)
  persistMessage: (message: UIMessage) => Promise<void>;
  loadHistoricalMessages: (sessionId: string) => Promise<UIMessage[]>;

  // Deep link actions
  setPendingPrompt: (prompt: string | null) => void;

  // Utility
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useChatStore = create<ChatStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      currentSession: null,
      sessions: [],
      loading: false,
      error: null,
      pendingPrompt: null,

      // Basic setters
      setError: (error) => set({ error }),
      setLoading: (loading) => set({ loading }),
      setCurrentSession: (session) => set({ currentSession: session }),
      setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),

      // Session management
      refreshSessions: async () => {
        logger.database.debug('Refreshing chat sessions');
        set({ loading: true, error: null });

        try {
          const result = await window.levante.db.sessions.list({});

          if (result.success && result.data) {
            logger.database.info('Sessions refreshed', {
              count: result.data.items.length,
            });
            set({
              sessions: result.data.items,
              loading: false,
            });
          } else {
            logger.database.error('Failed to refresh sessions', {
              error: result.error,
            });
            set({
              error: result.error || 'Failed to load sessions',
              loading: false,
            });
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          logger.database.error('Error refreshing sessions', { error });
          set({ error, loading: false });
        }
      },

      createSession: async (title = 'New Chat', model = 'openai/gpt-4o') => {
        // Validate model is not empty
        if (!model || model.trim() === '') {
          logger.database.error('Cannot create session: model is required', { title, model });
          set({
            error: 'Model is required to create a session',
            loading: false,
          });
          return null;
        }

        logger.database.debug('Creating new session', { title, model });
        set({ loading: true, error: null });

        try {
          const input = {
            title: title || 'New Chat',
            model: model,
          };

          logger.database.debug('Calling IPC to create session', { input });

          const result = await window.levante.db.sessions.create(input);

          logger.database.debug('IPC response', {
            success: result.success,
            hasData: !!result.data,
            error: result.error
          });

          if (result.success && result.data) {
            const newSession = result.data;

            logger.database.info('Session created', {
              sessionId: newSession.id,
              title: newSession.title,
            });

            set((state) => ({
              sessions: [newSession, ...state.sessions],
              currentSession: newSession,
              loading: false,
            }));

            return newSession;
          } else {
            // Force log to console even if DATABASE logging is disabled
            console.error('[ChatStore] Failed to create session:', {
              error: result.error,
              success: result.success,
              hasData: !!result.data,
              fullResult: result
            });
            logger.database.error('Failed to create session', {
              error: result.error,
              result
            });
            set({
              error: result.error || 'Failed to create session',
              loading: false,
            });
            return null;
          }
        } catch (err) {
          // Force log to console
          console.error('[ChatStore] Exception creating session:', {
            error: err instanceof Error ? err.message : err,
            stack: err instanceof Error ? err.stack : undefined
          });
          const error = err instanceof Error ? err.message : 'Unknown error';
          logger.database.error('Error creating session', {
            error,
            stack: err instanceof Error ? err.stack : undefined
          });
          set({ error, loading: false });
          return null;
        }
      },

      loadSession: async (sessionId: string) => {
        logger.database.debug('Loading session', { sessionId });
        set({ loading: true, error: null });

        try {
          const result = await window.levante.db.sessions.get(sessionId);

          if (result.success && result.data) {
            logger.database.info('Session loaded', { sessionId });
            set({
              currentSession: result.data,
              loading: false,
            });
          } else {
            logger.database.error('Failed to load session', {
              sessionId,
              error: result.error,
            });
            set({
              error: result.error || 'Failed to load session',
              loading: false,
            });
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          logger.database.error('Error loading session', { error });
          set({ error, loading: false });
        }
      },

      deleteSession: async (sessionId: string) => {
        logger.database.debug('Deleting session', { sessionId });
        set({ loading: true, error: null });

        try {
          const result = await window.levante.db.sessions.delete(sessionId);

          if (result.success) {
            logger.database.info('Session deleted', { sessionId });

            set((state) => {
              const newSessions = state.sessions.filter((s) => s.id !== sessionId);
              const newCurrentSession =
                state.currentSession?.id === sessionId ? null : state.currentSession;

              return {
                sessions: newSessions,
                currentSession: newCurrentSession,
                loading: false,
              };
            });

            return true;
          } else {
            logger.database.error('Failed to delete session', {
              sessionId,
              error: result.error,
            });
            set({
              error: result.error || 'Failed to delete session',
              loading: false,
            });
            return false;
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          logger.database.error('Error deleting session', { error });
          set({ error, loading: false });
          return false;
        }
      },

      updateSessionTitle: async (sessionId: string, title: string) => {
        logger.database.debug('Updating session title', { sessionId, title });

        try {
          const result = await window.levante.db.sessions.update({
            id: sessionId,
            title,
          });

          if (result.success && result.data) {
            logger.database.info('Session title updated', { sessionId, title });

            set((state) => ({
              sessions: state.sessions.map((s) =>
                s.id === sessionId ? { ...s, title } : s
              ),
              currentSession:
                state.currentSession?.id === sessionId
                  ? { ...state.currentSession, title }
                  : state.currentSession,
            }));

            return true;
          } else {
            logger.database.error('Failed to update session title', {
              sessionId,
              error: result.error,
            });
            set({ error: result.error || 'Failed to update session title' });
            return false;
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          logger.database.error('Error updating session title', { error });
          set({ error });
          return false;
        }
      },

      startNewChat: () => {
        logger.core.info('Starting new chat');
        set({ currentSession: null, error: null });
      },

      // Message persistence
      persistMessage: async (message: UIMessage) => {
        const { currentSession } = get();

        if (!currentSession) {
          logger.database.warn('Cannot persist message: no active session');
          return;
        }

        try {
          // Extract text content from parts
          const textParts = message.parts.filter((p) => p.type === 'text');
          const content = textParts
            .map((p: any) => p.text)
            .join('\n')
            .trim();

          // Extract tool calls from parts
          const toolCallParts = message.parts.filter((p) =>
            p.type.startsWith('tool-')
          );

          let toolCallsData = null;
          if (toolCallParts.length > 0) {
            toolCallsData = toolCallParts.map((part: any) => ({
              id: part.toolCallId || `tool-${Date.now()}`,
              name: part.type.replace('tool-', ''),
              arguments: part.input || {},
              result: part.output,
              status: part.state === 'output-available' ? 'success' : part.state,
            }));
          }

          const input: CreateMessageInput = {
            session_id: currentSession.id,
            role: message.role,
            content: content || '', // Fallback to empty string if no text
            tool_calls: toolCallsData,
          };

          const result = await window.levante.db.messages.create(input);

          if (result.success) {
            logger.database.info('Message persisted', {
              messageId: message.id,
              sessionId: currentSession.id,
              role: message.role,
              hasToolCalls: !!toolCallsData,
            });

            // Auto-generate title for first user message
            if (message.role === 'user' && content) {
              const messagesResult = await window.levante.db.messages.list({
                session_id: currentSession.id,
                limit: 10,
              });

              const userMessageCount =
                messagesResult.success && messagesResult.data
                  ? messagesResult.data.items.filter((m) => m.role === 'user').length
                  : 0;

              if (userMessageCount === 1) {
                logger.database.debug('Generating title for first message');

                const titleResult = await window.levante.db.generateTitle(content);

                if (titleResult.success && titleResult.data) {
                  await get().updateSessionTitle(
                    currentSession.id,
                    titleResult.data
                  );
                }
              }
            }
          } else {
            logger.database.error('Failed to persist message', {
              error: result.error,
            });
          }
        } catch (err) {
          logger.database.error('Error persisting message', {
            error: err instanceof Error ? err.message : err,
          });
        }
      },

      loadHistoricalMessages: async (sessionId: string): Promise<UIMessage[]> => {
        logger.database.debug('Loading historical messages', { sessionId });

        try {
          const result = await window.levante.db.messages.list({
            session_id: sessionId,
            limit: 100,
            offset: 0,
          });

          if (!result.success || !result.data) {
            logger.database.error('Failed to load historical messages', {
              sessionId,
              error: result.error,
            });
            return [];
          }

          // Convert DB messages to UIMessage format
          const uiMessages: UIMessage[] = result.data.items.map((dbMsg: Message) => {
            const parts: any[] = [];

            // Add text part
            if (dbMsg.content) {
              parts.push({
                type: 'text',
                text: dbMsg.content,
              });
            }

            // Add tool call parts
            if (dbMsg.tool_calls) {
              try {
                const toolCalls = JSON.parse(dbMsg.tool_calls);
                if (Array.isArray(toolCalls)) {
                  toolCalls.forEach((tc) => {
                    parts.push({
                      type: `tool-${tc.name}`,
                      toolCallId: tc.id,
                      toolName: tc.name,
                      input: tc.arguments,
                      output: tc.result,
                      state: 'output-available',
                    });
                  });
                }
              } catch (err) {
                logger.database.warn('Failed to parse tool calls', {
                  messageId: dbMsg.id,
                  error: err,
                });
              }
            }

            return {
              id: dbMsg.id,
              role: dbMsg.role,
              parts,
            };
          });

          logger.database.info('Historical messages loaded', {
            sessionId,
            count: uiMessages.length,
          });

          return uiMessages;
        } catch (err) {
          logger.database.error('Error loading historical messages', {
            sessionId,
            error: err instanceof Error ? err.message : err,
          });
          return [];
        }
      },
    }),
    { name: 'chat-store' }
  )
);

// Export initialization function
export const initializeChatStore = () => {
  useChatStore.getState().refreshSessions();
};
