import { useState, useEffect, useCallback } from 'react';
import { ChatSession, Message, CreateChatSessionInput, CreateMessageInput } from '../../types/database';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

export interface UseChatSessionResult {
  // Session management
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  messages: Message[];
  loading: boolean;
  error: string | null;
  
  // Session operations
  createSession: (title?: string, model?: string) => Promise<ChatSession | null>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<boolean>;
  
  // Message operations
  addMessage: (content: string, role: 'user' | 'assistant' | 'system') => Promise<Message | null>;
  loadMoreMessages: () => Promise<void>;
  
  // Utility
  clearCurrentSession: () => void;
  refreshSessions: () => Promise<void>;
}

export function useChatSession(initialSessionId?: string): UseChatSessionResult {
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messagesOffset, setMessagesOffset] = useState(0);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);

  // Load all sessions on mount
  const refreshSessions = useCallback(async () => {
    try {
      setError(null);
      const result = await window.levante.db.sessions.list({ limit: 50, offset: 0 });
      
      if (result.success && result.data) {
        setSessions(result.data.items);
      } else {
        setError(result.error || 'Failed to load sessions');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  // Load session messages
  const loadMessages = useCallback(async (sessionId: string, offset = 0, limit = 50) => {
    try {
      setError(null);
      const result = await window.levante.db.messages.list({ 
        session_id: sessionId, 
        limit, 
        offset 
      });
      
      if (result.success && result.data) {
        if (offset === 0) {
          setMessages(result.data.items);
        } else {
          setMessages(prev => [...result.data.items, ...prev]);
        }
        
        setHasMoreMessages(result.data.items.length === limit);
        setMessagesOffset(offset + result.data.items.length);
        return result.data.items;
      } else {
        setError(result.error || 'Failed to load messages');
        return [];
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return [];
    }
  }, []);

  // Create new session
  const createSession = useCallback(async (
    title?: string, 
    model: string = 'openai/gpt-4'
  ): Promise<ChatSession | null> => {
    try {
      setLoading(true);
      setError(null);
      
      const input: CreateChatSessionInput = {
        title: title || `New Chat - ${new Date().toLocaleDateString()}`,
        model,
        folder_id: null
      };
      
      const result = await window.levante.db.sessions.create(input);
      
      if (result.success && result.data) {
        const newSession = result.data;
        setSessions(prev => [newSession, ...prev]);
        setCurrentSession(newSession);
        setMessages([]);
        setMessagesOffset(0);
        setHasMoreMessages(false);
        
        logger.database.info('Chat session created', { sessionId: newSession.id, title: newSession.title });
        return newSession;
      } else {
        setError(result.error || 'Failed to create session');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Load specific session
  const loadSession = useCallback(async (sessionId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      // Get session details
      const sessionResult = await window.levante.db.sessions.get(sessionId);
      
      if (sessionResult.success && sessionResult.data) {
        setCurrentSession(sessionResult.data);
        
        // Load messages for this session
        await loadMessages(sessionId, 0);
        
        logger.database.info('Chat session loaded', { sessionId, messagesCount: messages.length });
      } else {
        setError(sessionResult.error || 'Session not found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [loadMessages]);

  // Delete session
  const deleteSession = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      setError(null);
      const result = await window.levante.db.sessions.delete(sessionId);
      
      if (result.success) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        
        if (currentSession?.id === sessionId) {
          setCurrentSession(null);
          setMessages([]);
        }
        
        logger.database.info('Chat session deleted', { sessionId });
        return true;
      } else {
        setError(result.error || 'Failed to delete session');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, [currentSession]);

  // Update session title
  const updateSessionTitle = useCallback(async (sessionId: string, title: string): Promise<boolean> => {
    try {
      setError(null);
      const result = await window.levante.db.sessions.update({ id: sessionId, title });
      
      if (result.success && result.data) {
        setSessions(prev => prev.map(s => s.id === sessionId ? result.data! : s));
        
        if (currentSession?.id === sessionId) {
          setCurrentSession(result.data);
        }
        
        logger.database.info('Chat session title updated', { sessionId, newTitle: title });
        return true;
      } else {
        setError(result.error || 'Failed to update session');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, [currentSession]);

  // Add message to current session
  const addMessage = useCallback(async (
    content: string, 
    role: 'user' | 'assistant' | 'system'
  ): Promise<Message | null> => {
    if (!currentSession) {
      setError('No active session');
      return null;
    }

    try {
      setError(null);
      
      const input: CreateMessageInput = {
        session_id: currentSession.id,
        role,
        content,
        tool_calls: null
      };
      
      const result = await window.levante.db.messages.create(input);
      
      if (result.success && result.data) {
        const newMessage = result.data;
        
        // Capture the current message count before updating state
        const currentMessageCount = messages.length;
        
        setMessages(prev => [...prev, newMessage]);
        
        // Auto-generate title for the first user message using stable count
        if (role === 'user' && currentMessageCount === 0 && currentSession.title?.startsWith('Chat - ')) {
          generateAndUpdateTitle(content, currentSession.id);
        }
        
        logger.database.info('Message added to session', { messageId: newMessage.id, sessionId: currentSession.id, role, contentLength: content.length });
        return newMessage;
      } else {
        setError(result.error || 'Failed to add message');
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, [currentSession, messages]);

  // Generate title automatically for first user message
  const generateAndUpdateTitle = useCallback(async (firstMessage: string, sessionId: string) => {
    try {
      logger.database.debug('Generating title for session', { sessionId, firstMessageLength: firstMessage.length });
      
      const titleResult = await window.levante.db.generateTitle(firstMessage);
      
      if (titleResult.success && titleResult.data) {
        const newTitle = titleResult.data;
        
        // Update session title
        const success = await updateSessionTitle(sessionId, newTitle);
        
        if (success) {
          logger.database.info('Title generated and updated for session', { sessionId, newTitle });
        }
      }
    } catch (error) {
      logger.database.error('Failed to generate title for session', { sessionId, error: error instanceof Error ? error.message : error });
    }
  }, [updateSessionTitle]);

  // Load more messages (pagination)
  const loadMoreMessages = useCallback(async () => {
    if (!currentSession || !hasMoreMessages || loading) return;
    
    await loadMessages(currentSession.id, messagesOffset);
  }, [currentSession, hasMoreMessages, loading, messagesOffset, loadMessages]);

  // Clear current session
  const clearCurrentSession = useCallback(() => {
    setCurrentSession(null);
    setMessages([]);
    setMessagesOffset(0);
    setHasMoreMessages(true);
    setError(null);
  }, []);

  // Initialize on mount
  useEffect(() => {
    refreshSessions();
    
    if (initialSessionId) {
      loadSession(initialSessionId);
    }
  // Only run on mount and when initialSessionId changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId]);

  return {
    currentSession,
    sessions,
    messages,
    loading,
    error,
    createSession,
    loadSession,
    deleteSession,
    updateSessionTitle,
    addMessage,
    loadMoreMessages,
    clearCurrentSession,
    refreshSessions
  };
}