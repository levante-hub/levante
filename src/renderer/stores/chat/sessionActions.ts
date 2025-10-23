import type { ChatSession } from '../../../types/database';

/**
 * Session-related actions for the chat store
 */
export interface SessionState {
  currentSession: ChatSession | null;
  sessions: ChatSession[];
}

export interface SessionActions {
  setSessions: (sessions: ChatSession[]) => void;
  setCurrentSession: (session: ChatSession | null) => void;
  addSession: (session: ChatSession) => void;
  updateSession: (session: ChatSession) => void;
  removeSession: (sessionId: string) => void;
  refreshSessions: () => Promise<void>;
  createSession: (title?: string, model?: string) => Promise<ChatSession | null>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<boolean>;
  startNewChat: () => void;
}

export function createSessionActions(
  set: any,
  get: any
): SessionActions {
  return {
    setSessions: (sessions) => set({ sessions }),

    setCurrentSession: (currentSession) => set({ currentSession }),

    addSession: (session) => set((state: any) => ({
      sessions: [session, ...state.sessions]
    })),

    updateSession: (updatedSession) => set((state: any) => ({
      sessions: state.sessions.map((s: ChatSession) =>
        s.id === updatedSession.id ? updatedSession : s
      ),
      currentSession: state.currentSession?.id === updatedSession.id
        ? updatedSession
        : state.currentSession
    })),

    removeSession: (sessionId) => set((state: any) => ({
      sessions: state.sessions.filter((s: ChatSession) => s.id !== sessionId),
      currentSession: state.currentSession?.id === sessionId ? null : state.currentSession,
      ...(state.currentSession?.id === sessionId && {
        messages: [],
        dbMessages: []
      })
    })),

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

        const input = {
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

        const sessionResult = await window.levante.db.sessions.get(sessionId);

        if (sessionResult.success && sessionResult.data) {
          set({ currentSession: sessionResult.data });

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
  };
}
