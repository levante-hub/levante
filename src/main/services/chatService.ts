import { InValue } from '@libsql/client';
import { databaseService } from './databaseService';
import {
  ChatSession,
  Message,
  CreateChatSessionInput,
  CreateMessageInput,
  UpdateChatSessionInput,
  UpdateMessageInput,
  GetMessagesQuery,
  GetChatSessionsQuery,
  DatabaseResult,
  PaginatedResult
} from '../../types/database';
import { getLogger } from './logging';
import { escapeLikePattern } from '../utils/sqlSanitizer';

export class ChatService {
  private logger = getLogger();

  // Chat Sessions
  async createSession(input: CreateChatSessionInput): Promise<DatabaseResult<ChatSession>> {
    this.logger.database.debug('Creating new chat session', { input });

    try {
      const id = this.generateId();
      const now = Date.now();

      const session: ChatSession = {
        id,
        title: input.title,
        model: input.model,
        session_type: input.session_type || 'chat', // Default to 'chat' if not specified
        folder_id: input.folder_id ?? null, // Convert undefined to null for SQLite
        created_at: now,
        updated_at: now
      };

      await databaseService.execute(
        `INSERT INTO chat_sessions (id, title, model, session_type, folder_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          session.id as InValue,
          session.title as InValue,
          session.model as InValue,
          session.session_type as InValue, // Add session_type
          (session.folder_id ?? null) as InValue, // Ensure null instead of undefined
          session.created_at as InValue,
          session.updated_at as InValue
        ]
      );

      this.logger.database.info('Chat session created successfully', {
        sessionId: id,
        sessionType: session.session_type
      });
      return { data: session, success: true };
    } catch (error) {
      this.logger.database.error('Failed to create chat session', {
        error: error instanceof Error ? error.message : error,
        input
      });
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

      const sessionType = row[3] as string;
      const session: ChatSession = {
        id: row[0] as string,
        title: row[1] as string,
        model: row[2] as string,
        session_type: (sessionType === 'chat' || sessionType === 'inference') ? sessionType : 'chat',
        folder_id: row[4] as string,
        created_at: row[5] as number,
        updated_at: row[6] as number
      };

      return { data: session, success: true };
    } catch (error) {
      this.logger.database.error('Failed to get chat session', {
        error: error instanceof Error ? error.message : error
      });
      return {
        data: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getSessions(query: GetChatSessionsQuery = {}): Promise<DatabaseResult<PaginatedResult<ChatSession>>> {
    this.logger.database.debug('Getting chat sessions', { query });

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

      const sessions: ChatSession[] = result.rows.map(row => {
        const sessionType = row[3] as string;
        return {
          id: row[0] as string,
          title: row[1] as string,
          model: row[2] as string,
          session_type: (sessionType === 'chat' || sessionType === 'inference') ? sessionType : 'chat',
          folder_id: row[4] as string,
          created_at: row[5] as number,
          updated_at: row[6] as number
        };
      });

      const paginatedResult: PaginatedResult<ChatSession> = {
        items: sessions,
        total,
        limit,
        offset
      };

      this.logger.database.debug('Retrieved chat sessions', { total, returned: sessions.length, limit, offset });
      return { data: paginatedResult, success: true };
    } catch (error) {
      this.logger.database.error('Failed to get chat sessions', {
        error: error instanceof Error ? error.message : error,
        query
      });
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
      this.logger.database.error('Failed to update chat session', {
        error: error instanceof Error ? error.message : error
      });
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
      this.logger.database.error('Failed to delete chat session', {
        error: error instanceof Error ? error.message : error
      });
      return {
        data: false,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Messages
  async createMessage(input: CreateMessageInput): Promise<DatabaseResult<Message>> {
    this.logger.database.debug('Creating message', {
      sessionId: input.session_id,
      role: input.role,
      contentLength: input.content.length,
      hasToolCalls: !!input.tool_calls,
      hasAttachments: !!input.attachments,
      attachmentCount: input.attachments?.length || 0,
      providedId: !!input.id // Log if frontend supplied an ID
    });

    try {
      // Use frontend-provided ID when present, otherwise generate a new one
      const id = input.id || this.generateId();
      const now = Date.now();

      const attachmentsString = input.attachments ? JSON.stringify(input.attachments) : null;
      const reasoningString = input.reasoningText ? JSON.stringify(input.reasoningText) : null;

      this.logger.database.debug('Inserting message into database', {
        messageId: id,
        hasAttachments: !!attachmentsString,
        attachmentsLength: attachmentsString?.length || 0,
        hasReasoning: !!reasoningString,
      });

      const message: Message = {
        id,
        session_id: input.session_id,
        role: input.role,
        content: input.content,
        tool_calls: input.tool_calls ? JSON.stringify(input.tool_calls) : null,
        attachments: attachmentsString,
        reasoningText: reasoningString,
        created_at: now
      };

      // Try to insert with reasoning column first (new schema)
      // If it fails, retry without reasoning column (old schema)
      try {
        await databaseService.execute(
          `INSERT INTO messages (id, session_id, role, content, tool_calls, attachments, reasoning, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            message.id as InValue,
            message.session_id as InValue,
            message.role as InValue,
            message.content as InValue,
            message.tool_calls as InValue,
            message.attachments as InValue,
            message.reasoningText as InValue,
            message.created_at as InValue
          ]
        );
      } catch (error: any) {
        // If error is about missing column, retry without reasoning
        if (error?.message?.includes('no such column: reasoning') ||
          error?.message?.includes('table messages has no column named reasoning')) {
          this.logger.database.warn('Reasoning column not found, inserting without it (migration pending)', {
            messageId: id
          });
          await databaseService.execute(
            `INSERT INTO messages (id, session_id, role, content, tool_calls, attachments, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              message.id as InValue,
              message.session_id as InValue,
              message.role as InValue,
              message.content as InValue,
              message.tool_calls as InValue,
              message.attachments as InValue,
              message.created_at as InValue
            ]
          );
        } else {
          throw error; // Re-throw if it's a different error
        }
      }

      this.logger.database.info('Message created successfully', {
        messageId: id,
        sessionId: input.session_id,
        role: input.role
      });

      // Update session's updated_at timestamp
      await databaseService.execute(
        'UPDATE chat_sessions SET updated_at = ? WHERE id = ?',
        [now as InValue, input.session_id as InValue]
      );

      this.logger.database.info('Message created successfully', { messageId: id, sessionId: input.session_id });
      return { data: message, success: true };
    } catch (error) {
      this.logger.database.error('Failed to create message', {
        error: error instanceof Error ? error.message : error,
        input: { ...input, content: `${input.content.substring(0, 100)}...` }
      });
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

      // Get messages (using SELECT * for compatibility with old/new schema)
      // Column order from PRAGMA table_info(messages):
      // 0: id, 1: session_id, 2: role, 3: content, 4: tool_calls,
      // 5: created_at, 6: attachments, 7: reasoning
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
        created_at: row[5] as number,
        attachments: (row[6] as string) || null,
        reasoningText: (row[7] as string) || null,
      }));

      const paginatedResult: PaginatedResult<Message> = {
        items: messages,
        total,
        limit,
        offset
      };

      return { data: paginatedResult, success: true };
    } catch (error) {
      this.logger.database.error('Failed to get messages', {
        error: error instanceof Error ? error.message : error
      });
      return {
        data: { items: [], total: 0, limit: 0, offset: 0 },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async searchMessages(searchQuery: string, sessionId?: string, limit = 50): Promise<DatabaseResult<Message[]>> {
    this.logger.database.debug('Searching messages', { searchQuery, sessionId, limit });

    try {
      // Security: Escape LIKE wildcards to prevent LIKE injection
      const escapedQuery = escapeLikePattern(searchQuery);

      let sql = 'SELECT * FROM messages WHERE content LIKE ? ESCAPE ?';
      const params: InValue[] = [`%${escapedQuery}%` as InValue, '\\' as InValue];

      if (sessionId) {
        sql += ' AND session_id = ?';
        params.push(sessionId as InValue);
      }

      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit as InValue);

      const result = await databaseService.execute(sql, params);

      // Column order from PRAGMA table_info(messages):
      // 0: id, 1: session_id, 2: role, 3: content, 4: tool_calls,
      // 5: created_at, 6: attachments, 7: reasoning
      const messages: Message[] = result.rows.map(row => ({
        id: row[0] as string,
        session_id: row[1] as string,
        role: row[2] as 'user' | 'assistant' | 'system',
        content: row[3] as string,
        tool_calls: row[4] as string,
        created_at: row[5] as number,
        attachments: (row[6] as string) || null,
        reasoningText: (row[7] as string) || null,
      }));

      this.logger.database.debug('Search completed', { found: messages.length, query: searchQuery });
      return { data: messages, success: true };
    } catch (error) {
      this.logger.database.error('Failed to search messages', {
        error: error instanceof Error ? error.message : error,
        searchQuery,
        sessionId,
        limit
      });
      return {
        data: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update a message's content
   * This is typically used when a user edits their message
   */
  async updateMessage(input: UpdateMessageInput): Promise<DatabaseResult<Message | null>> {
    this.logger.database.debug('Updating message', {
      messageId: input.id,
      hasContent: !!input.content,
      hasToolCalls: !!input.tool_calls
    });

    try {
      const updateFields: string[] = [];
      const params: InValue[] = [];

      if (input.content !== undefined) {
        updateFields.push('content = ?');
        params.push(input.content as InValue);
      }

      if (input.tool_calls !== undefined) {
        updateFields.push('tool_calls = ?');
        params.push(JSON.stringify(input.tool_calls) as InValue);
      }

      if (updateFields.length === 0) {
        this.logger.database.warn('No fields to update in message', { messageId: input.id });
        return this.getMessage(input.id);
      }

      params.push(input.id as InValue);

      await databaseService.execute(
        `UPDATE messages SET ${updateFields.join(', ')} WHERE id = ?`,
        params
      );

      this.logger.database.info('Message updated successfully', { messageId: input.id });
      return this.getMessage(input.id);
    } catch (error) {
      this.logger.database.error('Failed to update message', {
        error: error instanceof Error ? error.message : error,
        messageId: input.id
      });
      return {
        data: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Delete all messages after a specific timestamp in a session
   * Used when editing a message to remove subsequent conversation
   */
  async deleteMessagesAfter(sessionId: string, afterTimestamp: number): Promise<DatabaseResult<number>> {
    this.logger.database.debug('Deleting messages after timestamp', {
      sessionId,
      afterTimestamp
    });

    try {
      const result = await databaseService.execute(
        'DELETE FROM messages WHERE session_id = ? AND created_at > ?',
        [sessionId as InValue, afterTimestamp as InValue]
      );

      const deletedCount = result.rowsAffected || 0;

      this.logger.database.info('Messages deleted successfully', {
        sessionId,
        deletedCount
      });

      return {
        data: deletedCount,
        success: true
      };
    } catch (error) {
      this.logger.database.error('Failed to delete messages', {
        error: error instanceof Error ? error.message : error,
        sessionId,
        afterTimestamp
      });
      return {
        data: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get a single message by ID
   */
  private async getMessage(id: string): Promise<DatabaseResult<Message | null>> {
    try {
      const result = await databaseService.execute(
        'SELECT * FROM messages WHERE id = ?',
        [id as InValue]
      );

      if (result.rows.length === 0) {
        return { data: null, success: true };
      }

      const row = result.rows[0];
      const message: Message = {
        id: row[0] as string,
        session_id: row[1] as string,
        role: row[2] as 'user' | 'assistant' | 'system',
        content: row[3] as string,
        tool_calls: row[4] as string,
        created_at: row[5] as number,
        attachments: (row[6] as string) || null,
        reasoningText: (row[7] as string) || null,
      };

      return { data: message, success: true };
    } catch (error) {
      this.logger.database.error('Failed to get message', {
        error: error instanceof Error ? error.message : error,
        messageId: id
      });
      return {
        data: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Utility methods
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Singleton instance
export const chatService = new ChatService();
