import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ChatSession, Message, CreateChatSessionInput, CreateMessageInput } from '../../types/database';
import { ElectronMessage, ElectronChatStatus } from '@/hooks/useElectronChat';
import { UIMessage } from 'ai';

interface ChatStore {
  // Current chat state
  messages: ElectronMessage[];
  status: ElectronChatStatus;
  streamingMessage: ElectronMessage | null;

  // Session management
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  loading: boolean;
  error: string | null;

  // Database messages (raw from DB)
  dbMessages: Message[];
  messagesOffset: number;
  hasMoreMessages: boolean;

  // Deep link state
  pendingPrompt: string | null;

  // Streaming callbacks
  onStreamFinish?: () => void;

  // Actions
  setStatus: (status: ElectronChatStatus) => void;
  setStreamingMessage: (message: ElectronMessage | null) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setOnStreamFinish: (callback?: () => void) => void;

  // Deep link actions
  setPendingPrompt: (prompt: string | null) => void;

  // Session actions
  setSessions: (sessions: ChatSession[]) => void;
  setCurrentSession: (session: ChatSession | null) => void;
  addSession: (session: ChatSession) => void;
  updateSession: (session: ChatSession) => void;
  removeSession: (sessionId: string) => void;

  // Message actions
  setDbMessages: (messages: Message[]) => void;
  addDbMessage: (message: Message) => void;
  appendDbMessages: (messages: Message[]) => void;

  // Computed/derived actions
  updateDisplayMessages: () => void;

  // API actions (async)
  refreshSessions: () => Promise<void>;
  createSession: (title?: string, model?: string) => Promise<ChatSession | null>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<boolean>;
  addMessage: (content: string, role: 'user' | 'assistant' | 'system') => Promise<Message | null>;
  addMessageWithTools: (content: string, role: 'user' | 'assistant' | 'system', toolCallsData?: any[] | null) => Promise<Message | null>;
  sendMessage: (message: { text: string }, options?: { body?: { model?: string; webSearch?: boolean; enableMCP?: boolean } }) => Promise<void>;
  stopStreaming: () => Promise<void>;
  loadMoreMessages: () => Promise<void>;

  // UI actions
  startNewChat: () => void;
}

// Helper to convert DB Message to ElectronMessage
function convertToElectronMessage(dbMessage: Message): ElectronMessage {
  const parts: Array<{
    type: 'text' | 'source-url' | 'reasoning' | 'tool-call'
    text?: string
    url?: string
    toolCall?: {
      id: string
      name: string
      arguments: Record<string, any>
      result?: {
        success: boolean
        content?: string
        error?: string
      }
      status: 'pending' | 'running' | 'success' | 'error'
      serverId?: string
      timestamp?: number
    }
  }> = [];
  
  // Add text content
  if (dbMessage.content) {
    parts.push({ type: 'text', text: dbMessage.content });
  }
  
  // Process tool calls from database
  if (dbMessage.tool_calls) {
    try {
      const toolCalls = JSON.parse(dbMessage.tool_calls);
      if (Array.isArray(toolCalls)) {
        toolCalls.forEach((toolCall) => {
          parts.push({
            type: 'tool-call',
            toolCall: {
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.arguments || {},
              result: toolCall.result,
              status: toolCall.status || 'success',
              serverId: toolCall.serverId,
              timestamp: toolCall.timestamp
            }
          });
        });
      }
    } catch (error) {
      console.error('[convertToElectronMessage] Failed to parse tool_calls JSON:', error);
    }
  }

  return {
    id: dbMessage.id,
    role: dbMessage.role,
    content: dbMessage.content,
    parts
  };
}

export const useChatStore = create<ChatStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      messages: [],
      status: 'ready',
      streamingMessage: null,
      currentSession: null,
      sessions: [],
      loading: false,
      error: null,
      dbMessages: [],
      messagesOffset: 0,
      hasMoreMessages: true,
      pendingPrompt: null,
      onStreamFinish: undefined,

      // Basic setters
      setStatus: (status) => set({ status }),
      setStreamingMessage: (streamingMessage) => {
        set({ streamingMessage });
        get().updateDisplayMessages();
      },
      setError: (error) => set({ error }),
      setLoading: (loading) => set({ loading }),
      setOnStreamFinish: (callback) => set({ onStreamFinish: callback }),

      // Deep link actions
      setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),

      // Session actions
      setSessions: (sessions) => set({ sessions }),
      setCurrentSession: (currentSession) => set({ currentSession }),
      addSession: (session) => set((state) => ({ sessions: [session, ...state.sessions] })),
      updateSession: (updatedSession) => set((state) => ({
        sessions: state.sessions.map(s => s.id === updatedSession.id ? updatedSession : s),
        currentSession: state.currentSession?.id === updatedSession.id ? updatedSession : state.currentSession
      })),
      removeSession: (sessionId) => set((state) => ({
        sessions: state.sessions.filter(s => s.id !== sessionId),
        currentSession: state.currentSession?.id === sessionId ? null : state.currentSession,
        ...(state.currentSession?.id === sessionId && { messages: [], dbMessages: [] })
      })),

      // Message actions
      setDbMessages: (dbMessages) => {
        set({ dbMessages, messagesOffset: dbMessages.length, hasMoreMessages: true });
        get().updateDisplayMessages();
      },
      addDbMessage: (message) => {
        set((state) => ({ dbMessages: [...state.dbMessages, message] }));
        get().updateDisplayMessages();
      },
      appendDbMessages: (messages) => {
        set((state) => {
          // Combine and sort messages by created_at to maintain chronological order
          const combinedMessages = [...state.dbMessages, ...messages]
            .sort((a, b) => a.created_at - b.created_at);
          
          return { 
            dbMessages: combinedMessages,
            messagesOffset: state.messagesOffset + messages.length 
          };
        });
        get().updateDisplayMessages();
      },

      // Update display messages (combine DB messages + streaming)
      updateDisplayMessages: () => {
        const { dbMessages, streamingMessage } = get();
        // Ensure messages are sorted by created_at for deterministic display order
        const sortedDbMessages = [...dbMessages].sort((a, b) => a.created_at - b.created_at);
        const electronMessages = sortedDbMessages.map(convertToElectronMessage);
        
        if (streamingMessage) {
          set({ messages: [...electronMessages, streamingMessage] });
        } else {
          set({ messages: electronMessages });
        }
      },

      // API Actions
      refreshSessions: async () => {
        try {
          set({ error: null });
          const result = await window.levante.db.sessions.list({ limit: 50, offset: 0 });
          
          if (result.success && result.data) {
            set({ sessions: result.data.items });
          } else {
            set({ error: result.error || 'Failed to load sessions' });
          }
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Unknown error' });
        }
      },

      createSession: async (title?: string, model = 'openai/gpt-4') => {
        try {
          set({ loading: true, error: null });
          
          const input: CreateChatSessionInput = {
            title: title || `New Chat - ${new Date().toLocaleDateString()}`,
            model,
            folder_id: null
          };
          
          const result = await window.levante.db.sessions.create(input);
          
          if (result.success && result.data) {
            const newSession = result.data;
            get().addSession(newSession);
            set({ 
              currentSession: newSession, 
              dbMessages: [], 
              messages: [],
              messagesOffset: 0,
              hasMoreMessages: false 
            });
            
            console.log('[ChatStore] Session created:', newSession.id);
            return newSession;
          } else {
            set({ error: result.error || 'Failed to create session' });
            return null;
          }
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Unknown error' });
          return null;
        } finally {
          set({ loading: false });
        }
      },

      loadSession: async (sessionId: string) => {
        try {
          set({ loading: true, error: null });
          
          // Get session details
          const sessionResult = await window.levante.db.sessions.get(sessionId);
          
          if (sessionResult.success && sessionResult.data) {
            set({ currentSession: sessionResult.data });
            
            // Load messages for this session
            const result = await window.levante.db.messages.list({ 
              session_id: sessionId, 
              limit: 50, 
              offset: 0 
            });
            
            if (result.success && result.data) {
              get().setDbMessages(result.data.items);
            }
            
            console.log('[ChatStore] Session loaded:', sessionId);
          } else {
            set({ error: sessionResult.error || 'Session not found' });
          }
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
          set({ loading: false });
        }
      },

      deleteSession: async (sessionId: string) => {
        try {
          set({ error: null });
          const result = await window.levante.db.sessions.delete(sessionId);
          
          if (result.success) {
            get().removeSession(sessionId);
            console.log('[ChatStore] Session deleted:', sessionId);
            return true;
          } else {
            set({ error: result.error || 'Failed to delete session' });
            return false;
          }
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Unknown error' });
          return false;
        }
      },

      updateSessionTitle: async (sessionId: string, title: string) => {
        try {
          set({ error: null });
          const result = await window.levante.db.sessions.update({ id: sessionId, title });
          
          if (result.success && result.data) {
            get().updateSession(result.data);
            console.log('[ChatStore] Session title updated:', sessionId);
            return true;
          } else {
            set({ error: result.error || 'Failed to update session' });
            return false;
          }
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Unknown error' });
          return false;
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
              // Re-read the current state after addDbMessage to ensure we have the latest data
              const currentState = get();
              const { dbMessages } = currentState;
              
              // Check if this is the first user message for the current session
              const userMessagesInSession = dbMessages.filter(msg => 
                msg.session_id === currentSession.id && msg.role === 'user'
              );
              
              if (userMessagesInSession.length === 1 && userMessagesInSession[0].id === newMessage.id) {
                // This is definitely the first user message - generate title
                const originalSessionId = currentSession.id;
                
                (async () => {
                  try {
                    console.log('[ChatStore] Generating title for session:', originalSessionId);
                    
                    const titleResult = await window.levante.db.generateTitle(content);
                    
                    if (titleResult.success && titleResult.data) {
                      const newTitle = titleResult.data;
                      
                      // Verify session hasn't changed before updating title
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

      addMessageWithTools: async (content: string, role: 'user' | 'assistant' | 'system', toolCallsData?: any[] | null) => {
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
            
            console.log('[ChatStore] Message with tools added:', newMessage.id, toolCallsData ? 'with tool calls' : 'without tool calls');
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

      sendMessage: async (message: { text: string }, options?: { body?: { model?: string; webSearch?: boolean; enableMCP?: boolean } }) => {
        const { model = 'openai/gpt-4o', webSearch = false, enableMCP = false } = options?.body || {};
        
        // Ensure we have a session
        let session = get().currentSession;
        if (!session) {
          console.log('[ChatStore] Creating new session for first message');
          // Use a temporary title, will be updated after title generation
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
          const apiMessages: UIMessage[] = [...dbMessages, userDbMessage].map(msg => ({
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

                // If there's accumulated response, add the error to it
                if (fullResponse) {
                  fullResponse += `\n\n❌ Error: ${chunk.error}`;
                } else {
                  fullResponse = `❌ Error: ${chunk.error}`;
                }

                set((state) => ({
                  streamingMessage: state.streamingMessage ? {
                    ...state.streamingMessage,
                    content: fullResponse,
                    parts: [{ type: 'text', text: fullResponse }]
                  } : null,
                  status: 'error'
                }));
                get().updateDisplayMessages();

                // If done with error, save the error message
                if (chunk.done) {
                  get().addMessage(fullResponse, 'assistant').then(() => {
                    set({ streamingMessage: null });
                    get().updateDisplayMessages();
                  });
                }
                return; // Stop processing this chunk
              }

              if (chunk.delta) {
                fullResponse += chunk.delta;

                set((state) => ({
                  streamingMessage: state.streamingMessage ? {
                    ...state.streamingMessage,
                    content: fullResponse,
                    parts: [{ type: 'text', text: fullResponse }]
                  } : null
                }));
                get().updateDisplayMessages();
              }

              if (chunk.sources) {
                set((state) => ({
                  streamingMessage: state.streamingMessage ? {
                    ...state.streamingMessage,
                    parts: [
                      ...(state.streamingMessage.parts || []),
                      ...chunk.sources!.map(source => ({
                        type: 'source-url' as const,
                        url: source.url
                      }))
                    ]
                  } : null
                }));
                get().updateDisplayMessages();
              }
              
              if (chunk.reasoning) {
                set((state) => ({
                  streamingMessage: state.streamingMessage ? {
                    ...state.streamingMessage,
                    parts: [
                      ...(state.streamingMessage.parts || []),
                      { type: 'reasoning', text: chunk.reasoning! }
                    ]
                  } : null
                }));
                get().updateDisplayMessages();
              }
              
              if (chunk.toolCall) {
                // Add or update tool call
                activeToolCalls.set(chunk.toolCall.id, chunk.toolCall);
                
                set((state) => ({
                  streamingMessage: state.streamingMessage ? {
                    ...state.streamingMessage,
                    parts: [
                      ...(state.streamingMessage.parts?.filter(p => 
                        !(p.type === 'tool-call' && p.toolCall?.id === chunk.toolCall!.id)
                      ) || []),
                      { 
                        type: 'tool-call', 
                        toolCall: chunk.toolCall! 
                      }
                    ]
                  } : null
                }));
                get().updateDisplayMessages();
              }
              
              if (chunk.toolResult) {
                // Update tool call with result
                const toolCall = activeToolCalls.get(chunk.toolResult.id);
                if (toolCall) {
                  const isSuccess = chunk.toolResult.status === 'success';
                  toolCall.result = {
                    success: isSuccess,
                    content: isSuccess 
                      ? (typeof chunk.toolResult.result === 'string' 
                          ? chunk.toolResult.result 
                          : JSON.stringify(chunk.toolResult.result))
                      : undefined,
                    error: !isSuccess 
                      ? (chunk.toolResult.result?.error || 'Tool execution failed')
                      : undefined
                  };
                  toolCall.status = chunk.toolResult.status;
                  
                  set((state) => ({
                    streamingMessage: state.streamingMessage ? {
                      ...state.streamingMessage,
                      parts: state.streamingMessage.parts?.map(p => 
                        p.type === 'tool-call' && p.toolCall?.id === chunk.toolResult!.id
                          ? { ...p, toolCall }
                          : p
                      ) || []
                    } : null
                  }));
                  get().updateDisplayMessages();
                }
              }
              
              if (chunk.done) {
                // Save assistant message when streaming is complete
                if (fullResponse) {
                  // Collect all tool calls with their results
                  const toolCallsArray = Array.from(activeToolCalls.values());
                  
                  // Use the more detailed addMessageWithTools function
                  get().addMessageWithTools(fullResponse, 'assistant', toolCallsArray.length > 0 ? toolCallsArray : null).then((savedMessage) => {
                    if (savedMessage) {
                      // Successfully saved - clear streaming message and set ready
                      set({ streamingMessage: null, status: 'ready' });
                      get().updateDisplayMessages();
                      
                      // Notify that streaming has finished
                      const { onStreamFinish } = get();
                      if (onStreamFinish) {
                        onStreamFinish();
                      }
                    } else {
                      // Failed to save - keep streaming message visible and set error status
                      console.error('[ChatStore] Failed to save assistant message to database');
                      set({ 
                        status: 'error',
                        error: 'Failed to save message. Your response is preserved above - you can retry or continue the conversation.'
                      });
                      // Keep the streamingMessage visible so the response isn't lost
                    }
                  }).catch((error) => {
                    // Handle promise rejection
                    console.error('[ChatStore] Error saving assistant message:', error);
                    set({ 
                      status: 'error',
                      error: 'Failed to save message. Your response is preserved above - you can retry or continue the conversation.'
                    });
                    // Keep the streamingMessage visible so the response isn't lost
                  });
                } else {
                  set({ streamingMessage: null, status: 'ready' });
                  get().updateDisplayMessages();
                  
                  // Notify that streaming has finished
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
          
          // Save error message to database
          await get().addMessage('Sorry, there was an error processing your request.', 'assistant');
          set({ streamingMessage: null });
          get().updateDisplayMessages();
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
      },

      // UI Actions
      startNewChat: () => {
        console.log('[ChatStore] Starting new chat (clearing current session)');
        set({ 
          currentSession: null,
          messages: [],
          dbMessages: [],
          messagesOffset: 0,
          hasMoreMessages: true,
          streamingMessage: null,
          status: 'ready',
          error: null
        });
      }
    }),
    { name: 'chat-store' }
  )
);

// Export an initialization function instead
export const initializeChatStore = () => {
  useChatStore.getState().refreshSessions();
};