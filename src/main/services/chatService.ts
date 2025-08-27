import { InValue } from '@libsql/client';
import { databaseService } from './databaseService';
import { 
  ChatSession, 
  Message, 
  CreateChatSessionInput, 
  CreateMessageInput,
  UpdateChatSessionInput,
  GetMessagesQuery,
  GetChatSessionsQuery,
  DatabaseResult,
  PaginatedResult
} from '../../types/database';

export class ChatService {
  
  // Chat Sessions
  async createSession(input: CreateChatSessionInput): Promise<DatabaseResult<ChatSession>> {
    console.log('[ChatService] Creating new chat session', { input });
    
    try {
      const id = this.generateId();
      const now = Date.now();
      
      const session: ChatSession = {
        id,
        title: input.title,
        model: input.model,
        folder_id: input.folder_id,
        created_at: now,
        updated_at: now
      };

      await databaseService.execute(
        `INSERT INTO chat_sessions (id, title, model, folder_id, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          session.id as InValue,
          session.title as InValue,
          session.model as InValue,
          session.folder_id as InValue,
          session.created_at as InValue,
          session.updated_at as InValue
        ]
      );

      console.log('[ChatService] Chat session created successfully', { sessionId: id });
      return { data: session, success: true };
    } catch (error) {
      console.error('[ChatService] Failed to create chat session:', error, { input });
      return { 
        data: {} as ChatSession, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async getSession(id: string): Promise<DatabaseResult<ChatSession | null>> {
    try {
      const result = await databaseService.execute(
        'SELECT * FROM chat_sessions WHERE id = ?',
        [id as InValue]
      );

      const row = result.rows[0];
      if (!row) {
        return { data: null, success: true };
      }

      const session: ChatSession = {
        id: row[0] as string,
        title: row[1] as string,
        model: row[2] as string,
        folder_id: row[3] as string,
        created_at: row[4] as number,
        updated_at: row[5] as number
      };

      return { data: session, success: true };
    } catch (error) {
      console.error('Failed to get chat session:', error);
      return { 
        data: null, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async getSessions(query: GetChatSessionsQuery = {}): Promise<DatabaseResult<PaginatedResult<ChatSession>>> {
    console.log('[ChatService] Getting chat sessions', { query });
    
    try {
      const { folder_id, limit = 50, offset = 0 } = query;
      
      let sql = 'SELECT * FROM chat_sessions';
      let countSql = 'SELECT COUNT(*) as total FROM chat_sessions';
      const params: InValue[] = [];
      
      if (folder_id) {
        sql += ' WHERE folder_id = ?';
        countSql += ' WHERE folder_id = ?';
        params.push(folder_id as InValue);
      }
      
      sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
      params.push(limit as InValue, offset as InValue);

      // Get total count
      const countResult = await databaseService.execute(countSql, folder_id ? [folder_id as InValue] : []);
      const total = countResult.rows[0][0] as number;

      // Get sessions
      const result = await databaseService.execute(sql, params);
      
      const sessions: ChatSession[] = result.rows.map(row => ({
        id: row[0] as string,
        title: row[1] as string,
        model: row[2] as string,
        folder_id: row[3] as string,
        created_at: row[4] as number,
        updated_at: row[5] as number
      }));

      const paginatedResult: PaginatedResult<ChatSession> = {
        items: sessions,
        total,
        limit,
        offset
      };

      console.log('[ChatService] Retrieved chat sessions', { total, returned: sessions.length, limit, offset });
      return { data: paginatedResult, success: true };
    } catch (error) {
      console.error('[ChatService] Failed to get chat sessions:', error, { query });
      return { 
        data: { items: [], total: 0, limit: 0, offset: 0 }, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async updateSession(input: UpdateChatSessionInput): Promise<DatabaseResult<ChatSession | null>> {
    try {
      const { id, ...updates } = input;
      const updateFields: string[] = [];
      const params: InValue[] = [];

      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          updateFields.push(`${key} = ?`);
          params.push(value as InValue);
        }
      });

      if (updateFields.length === 0) {
        return this.getSession(id);
      }

      updateFields.push('updated_at = ?');
      params.push(Date.now() as InValue);
      params.push(id as InValue);

      await databaseService.execute(
        `UPDATE chat_sessions SET ${updateFields.join(', ')} WHERE id = ?`,
        params
      );

      return this.getSession(id);
    } catch (error) {
      console.error('Failed to update chat session:', error);
      return { 
        data: null, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async deleteSession(id: string): Promise<DatabaseResult<boolean>> {
    try {
      await databaseService.execute(
        'DELETE FROM chat_sessions WHERE id = ?',
        [id as InValue]
      );

      return { data: true, success: true };
    } catch (error) {
      console.error('Failed to delete chat session:', error);
      return { 
        data: false, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Messages
  async createMessage(input: CreateMessageInput): Promise<DatabaseResult<Message>> {
    console.log('[ChatService] Creating new message', { 
      sessionId: input.session_id, 
      role: input.role, 
      contentLength: input.content.length,
      hasToolCalls: !!input.tool_calls
    });
    
    try {
      const id = this.generateId();
      const now = Date.now();
      
      const message: Message = {
        id,
        session_id: input.session_id,
        role: input.role,
        content: input.content,
        tool_calls: input.tool_calls ? JSON.stringify(input.tool_calls) : null,
        created_at: now
      };

      await databaseService.execute(
        `INSERT INTO messages (id, session_id, role, content, tool_calls, created_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          message.id as InValue,
          message.session_id as InValue,
          message.role as InValue,
          message.content as InValue,
          message.tool_calls as InValue,
          message.created_at as InValue
        ]
      );

      // Update session's updated_at timestamp
      await databaseService.execute(
        'UPDATE chat_sessions SET updated_at = ? WHERE id = ?',
        [now as InValue, input.session_id as InValue]
      );

      console.log('[ChatService] Message created successfully', { messageId: id, sessionId: input.session_id });
      return { data: message, success: true };
    } catch (error) {
      console.error('[ChatService] Failed to create message:', error, { input: { ...input, content: `${input.content.substring(0, 100)}...` } });
      return { 
        data: {} as Message, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async getMessages(query: GetMessagesQuery): Promise<DatabaseResult<PaginatedResult<Message>>> {
    try {
      const { session_id, limit = 100, offset = 0 } = query;
      
      // Get total count
      const countResult = await databaseService.execute(
        'SELECT COUNT(*) as total FROM messages WHERE session_id = ?',
        [session_id as InValue]
      );
      const total = countResult.rows[0][0] as number;

      // Get messages
      const result = await databaseService.execute(
        'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
        [session_id as InValue, limit as InValue, offset as InValue]
      );
      
      const messages: Message[] = result.rows.map(row => ({
        id: row[0] as string,
        session_id: row[1] as string,
        role: row[2] as 'user' | 'assistant' | 'system',
        content: row[3] as string,
        tool_calls: row[4] as string,
        created_at: row[5] as number
      }));

      const paginatedResult: PaginatedResult<Message> = {
        items: messages,
        total,
        limit,
        offset
      };

      return { data: paginatedResult, success: true };
    } catch (error) {
      console.error('Failed to get messages:', error);
      return { 
        data: { items: [], total: 0, limit: 0, offset: 0 }, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async searchMessages(searchQuery: string, sessionId?: string, limit = 50): Promise<DatabaseResult<Message[]>> {
    console.log('[ChatService] Searching messages', { searchQuery, sessionId, limit });
    
    try {
      const trimmedQuery = searchQuery.trim();
      if (!trimmedQuery) {
        return { data: [], success: true };
      }

      // Simple case-insensitive search with COLLATE NOCASE for better performance
      let sql = 'SELECT * FROM messages WHERE content LIKE ? COLLATE NOCASE';
      const params: InValue[] = [`%${trimmedQuery}%` as InValue];

      if (sessionId) {
        sql += ' AND session_id = ?';
        params.push(sessionId as InValue);
      }

      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit as InValue);

      const result = await databaseService.execute(sql, params);
      
      let messages: Message[] = result.rows.map(row => ({
        id: row[0] as string,
        session_id: row[1] as string,
        role: row[2] as 'user' | 'assistant' | 'system',
        content: row[3] as string,
        tool_calls: row[4] as string,
        created_at: row[5] as number
      }));

      // If no results with simple search, try accent-insensitive search
      if (messages.length === 0 && this.hasAccents(trimmedQuery)) {
        const normalizedQuery = this.normalizeSearchText(trimmedQuery);
        const accentSql = `SELECT * FROM messages WHERE ${this.buildAccentInsensitiveLike()} LIKE ?${sessionId ? ' AND session_id = ?' : ''} ORDER BY created_at DESC LIMIT ?`;
        const accentParams: InValue[] = [`%${normalizedQuery}%` as InValue];
        
        if (sessionId) accentParams.push(sessionId as InValue);
        accentParams.push(limit as InValue);

        const accentResult = await databaseService.execute(accentSql, accentParams);
        messages = accentResult.rows.map(row => ({
          id: row[0] as string,
          session_id: row[1] as string,
          role: row[2] as 'user' | 'assistant' | 'system',
          content: row[3] as string,
          tool_calls: row[4] as string,
          created_at: row[5] as number
        }));
      }

      console.log('[ChatService] Search completed', { found: messages.length, query: trimmedQuery });
      return { data: messages, success: true };
    } catch (error) {
      console.error('[ChatService] Failed to search messages:', error, { searchQuery, sessionId, limit });
      return { 
        data: [], 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Utility methods
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private normalizeSearchText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[áàäâãå]/g, 'a')
      .replace(/[éèëê]/g, 'e')
      .replace(/[íìïî]/g, 'i')
      .replace(/[óòöôõ]/g, 'o')
      .replace(/[úùüû]/g, 'u')
      .replace(/[ýÿ]/g, 'y')
      .replace(/ñ/g, 'n')
      .replace(/ç/g, 'c');
  }

  private hasAccents(text: string): boolean {
    return /[áàäâãåéèëêíìïîóòöôõúùüûýÿñç]/i.test(text);
  }

  private buildAccentInsensitiveLike(): string {
    return `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(content, 'á', 'a'), 'à', 'a'), 'ä', 'a'), 'â', 'a'), 'ã', 'a'), 'å', 'a'), 'é', 'e'), 'è', 'e'), 'ë', 'e'), 'ê', 'e'), 'í', 'i'), 'ì', 'i'), 'ï', 'i'), 'î', 'i'), 'ó', 'o'), 'ò', 'o'), 'ö', 'o'), 'ô', 'o'), 'õ', 'o'), 'ú', 'u'), 'ù', 'u'), 'ü', 'u'), 'û', 'u'), 'ý', 'y'), 'ÿ', 'y'), 'ñ', 'n'), 'ç', 'c'))`;
  }
}

// Singleton instance
export const chatService = new ChatService();