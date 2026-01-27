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
import type { ChatSession, Message, CreateMessageInput, SessionType } from '../../types/database';
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
  createSession: (title?: string, model?: string, sessionType?: SessionType) => Promise<ChatSession | null>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<boolean>;
  updateSessionModel: (sessionId: string, model: string) => Promise<boolean>;
  setCurrentSession: (session: ChatSession | null) => void;
  startNewChat: () => void;

  // Message persistence (called by useChat onFinish callback)
  // Returns generated content if attachments were converted to text markers
  persistMessage: (message: UIMessage) => Promise<{ generatedContent?: string } | void>;
  loadHistoricalMessages: (sessionId: string) => Promise<UIMessage[]>;
  editMessage: (messageId: string, newContent: string) => Promise<boolean>;

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

      createSession: async (title = 'New Chat', model = 'openai/gpt-4o', sessionType: SessionType = 'chat') => {
        // Validate model is not empty
        if (!model || model.trim() === '') {
          logger.database.error('Cannot create session: model is required', { title, model });
          set({
            error: 'Model is required to create a session',
            loading: false,
          });
          return null;
        }

        logger.database.debug('Creating new session', { title, model, sessionType });
        set({ loading: true, error: null });

        try {
          const input = {
            title: title || 'New Chat',
            model: model,
            session_type: sessionType, // Pass session type
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

      updateSessionModel: async (sessionId: string, model: string) => {
        logger.database.debug('Updating session model', { sessionId, model });

        try {
          const result = await window.levante.db.sessions.update({
            id: sessionId,
            model,
          });

          if (result.success && result.data) {
            logger.database.info('Session model updated', { sessionId, model });

            set((state) => ({
              sessions: state.sessions.map((s) =>
                s.id === sessionId ? { ...s, model } : s
              ),
              currentSession:
                state.currentSession?.id === sessionId
                  ? { ...state.currentSession, model }
                  : state.currentSession,
            }));

            return true;
          } else {
            logger.database.error('Failed to update session model', {
              sessionId,
              error: result.error,
            });
            return false;
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          logger.database.error('Error updating session model', { error });
          return false;
        }
      },

      startNewChat: () => {
        logger.core.info('Starting new chat');
        set({ currentSession: null, error: null });
      },

      // Message persistence
      persistMessage: async (message: UIMessage): Promise<{ generatedContent?: string } | void> => {
        const { currentSession } = get();

        if (!currentSession) {
          logger.database.warn('Cannot persist message: no active session');
          return;
        }

        let generatedContent: string | undefined;

        try {
          // Extract text content from parts
          const textParts = message.parts.filter((p) => p.type === 'text');
          let content = textParts
            .map((p: any) => p.text)
            .join('\n')
            .trim();

          // Extract attachments if present (from UIMessage extension)
          const attachments = (message as any).attachments || undefined;

          // If no text content but has attachments, generate hidden content marker for AI context
          if (!content && attachments && attachments.length > 0) {
            // Get base path for absolute paths
            const basePathResult = await window.levante.attachments.getBasePath();
            const basePath = basePathResult.success ? basePathResult.data : '';

            content = attachments
              .map((att: any) => {
                const relativePath = att.path || att.storagePath;
                const absolutePath = basePath ? `${basePath}/${relativePath}` : relativePath;
                return `[attachment:${att.type}:${absolutePath}:${att.filename}]`;
              })
              .join('\n');

            // Store generated content to return to caller
            generatedContent = content;

            logger.core.info('Generated content from attachments', {
              messageId: message.id,
              attachmentCount: attachments.length,
              generatedContent: content,
            });
          }

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

          // Extract reasoning from parts (GPT-5, Gemini 2.0, DeepSeek R1, etc.)
          const reasoningParts = message.parts.filter((p: any) => p.type === 'data-reasoning');

          let reasoningData = null;
          if (reasoningParts.length > 0) {
            // Combine all reasoning text
            const combinedText = reasoningParts
              .map((p: any) => p.data?.text || '')
              .filter((text: string) => {
                // Filter out empty strings, whitespace-only, and empty object representations
                const trimmed = text.trim();
                return trimmed.length > 0 && trimmed !== '{}' && trimmed !== '[]';
              })
              .join('\n\n');

            // Only persist if there's actual reasoning content
            if (combinedText.length > 0) {
              const reasoningPart = reasoningParts[0] as any;
              reasoningData = {
                text: combinedText,
                duration: reasoningPart.data?.duration, // Optional duration in seconds
              };

              logger.database.debug('Persisting message with reasoning', {
                messageId: message.id,
                reasoningLength: reasoningData.text.length,
                duration: reasoningData.duration,
              });
          }
        }

        // Debug: Log attachments being persisted
        if (attachments) {
          logger.core.info('💾 Persisting message WITH attachments', {
            messageId: message.id,
            attachmentCount: attachments?.length || 0,
            attachments: attachments,
          });
        }

        const input: CreateMessageInput = {
          id: message.id, // Pass frontend-generated ID so backend can persist the same one
          session_id: currentSession.id,
          role: message.role,
          content: content || '', // Fallback to empty string if no text
          tool_calls: toolCallsData,
          attachments: attachments,
          reasoningText: reasoningData,
        };

          const result = await window.levante.db.messages.create(input);

          if (result.success) {
            logger.database.info('Message persisted', {
              messageId: message.id,
              sessionId: currentSession.id,
              role: message.role,
              hasToolCalls: !!toolCallsData,
              hasAttachments: !!attachments,
              attachmentCount: attachments?.length || 0,
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
                logger.database.debug('Generating title for first message (non-blocking)');

                // Track conversation creation (fire and forget)
                window.levante.analytics?.trackConversation?.().catch(() => { });

                // Generate title in background (non-blocking)
                // This prevents the title generation from delaying the message persistence
                (async () => {
                  try {
                    const titleResult = await window.levante.db.generateTitle(content);

                    if (titleResult.success && titleResult.data) {
                      await get().updateSessionTitle(
                        currentSession.id,
                        titleResult.data
                      );
                      logger.database.info('Title generated and updated in background', {
                        sessionId: currentSession.id,
                        title: titleResult.data,
                      });
                    }
                  } catch (error) {
                    logger.database.error('Failed to generate title in background', {
                      sessionId: currentSession.id,
                      error: error instanceof Error ? error.message : error,
                    });
                  }
                })();
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

        // Return generated content if any (for updating UI state)
        if (generatedContent) {
          return { generatedContent };
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

            // Debug: Log raw message from DB
            logger.core.info('🔍 Processing DB message', {
              messageId: dbMsg.id,
              role: dbMsg.role,
              hasContent: !!dbMsg.content,
              hasAttachments: !!dbMsg.attachments,
              attachmentsRaw: dbMsg.attachments ? 'PRESENT' : 'NONE',
            });

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

            // Add reasoning part (GPT-5, Gemini 2.0, DeepSeek R1, etc.)
            if (dbMsg.reasoningText) {
              try {
                const reasoning = JSON.parse(dbMsg.reasoningText);
                parts.push({
                  type: 'data-reasoning',
                  data: {
                    text: reasoning.text,
                    duration: reasoning.duration,
                  },
                });
                logger.database.debug('💭 Loaded reasoning from DB', {
                  messageId: dbMsg.id,
                  reasoningLength: reasoning.text?.length || 0,
                  duration: reasoning.duration,
                });
              } catch (err) {
                logger.database.warn('Failed to parse reasoning', {
                  messageId: dbMsg.id,
                  error: err,
                });
              }
            }

            // Parse attachments if present
            let attachments = undefined;
            if (dbMsg.attachments) {
              try {
                attachments = JSON.parse(dbMsg.attachments);
                logger.core.info('✅ Parsed attachments for message', {
                  messageId: dbMsg.id,
                  attachmentCount: attachments?.length || 0,
                  attachments: attachments,
                });
              } catch (err) {
                logger.core.warn('❌ Failed to parse attachments', {
                  messageId: dbMsg.id,
                  error: err,
                });
              }
            }

            const finalMessage = {
              id: dbMsg.id,
              role: dbMsg.role,
              parts,
              attachments, // Add attachments to UIMessage
            } as UIMessage;

            // Debug: Log final message structure
            if (attachments) {
              logger.core.info('📦 Created UIMessage with attachments', {
                messageId: finalMessage.id,
                role: finalMessage.role,
                attachmentCount: attachments?.length || 0,
                hasAttachmentsProperty: !!(finalMessage as any).attachments,
              });
            }

            return finalMessage;
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

      editMessage: async (messageId: string, newContent: string) => {
        const { currentSession } = get();

        if (!currentSession) {
          logger.database.warn('Cannot edit message: no active session');
          return false;
        }

        logger.database.debug('Editing message', {
          messageId,
          sessionId: currentSession.id,
          newContentLength: newContent.length,
        });

        try {
          // 1. Get the message to find its timestamp
          const messagesResult = await window.levante.db.messages.list({
            session_id: currentSession.id,
            limit: 1000, // Load all messages to find the one to edit
          });

          if (!messagesResult.success || !messagesResult.data) {
            logger.database.error('Failed to load messages for edit', {
              error: messagesResult.error,
            });
            return false;
          }

          const messageToEdit = messagesResult.data.items.find(
            (m) => m.id === messageId
          );

          if (!messageToEdit) {
            logger.database.error('Message not found for edit', { messageId });
            return false;
          }

          // 2. Update the message content
          const updateResult = await window.levante.db.messages.update({
            id: messageId,
            content: newContent,
          });

          if (!updateResult.success) {
            logger.database.error('Failed to update message', {
              error: updateResult.error,
            });
            return false;
          }

          // 3. Delete all messages after this one
          const deleteResult = await window.levante.db.messages.deleteAfter(
            currentSession.id,
            messageToEdit.created_at
          );

          if (!deleteResult.success) {
            logger.database.error('Failed to delete subsequent messages', {
              error: deleteResult.error,
            });
            return false;
          }

          logger.database.info('Message edited successfully', {
            messageId,
            deletedCount: deleteResult.data,
          });

          return true;
        } catch (err) {
          logger.database.error('Error editing message', {
            error: err instanceof Error ? err.message : err,
            messageId,
          });
          return false;
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
