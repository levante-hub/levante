import { InValue } from '@libsql/client';
// Temporary stub - would be replaced with proper database service
const databaseService = {
  db: {
    prepare: (sql: string) => ({
      all: (params?: any[]) => [],
      get: (params?: any[]) => null,
      run: (params?: any[]) => ({ meta: { changes: 1 } })
    })
  }
};
import { Message } from '../../../../domain/entities/Message';
import { MessageId } from '../../../../domain/value-objects/MessageId';
import { ChatId } from '../../../../domain/value-objects/ChatId';
import { MessageRole } from '../../../../domain/value-objects/MessageRole';
import { MessageParts } from '../../../../domain/value-objects/MessageParts';
import { ToolCall } from '../../../../domain/value-objects/ToolCall';
import { 
  MessageRepository, 
  MessageCreateInput, 
  MessageUpdateInput,
  MessageSearchFilters,
  MessageWithContext,
  MessageStatistics,
  ConversationThread,
  MessageExport,
  MessageImport,
  ConversationAnalytics
} from '../../../../domain/ports/secondary/MessageRepository';
import { RepositoryResult, PaginatedResult, QueryOptions } from '../../../../domain/ports/secondary/BaseRepository';

export class SqliteMessageRepository implements MessageRepository {
  
  async findById(id: MessageId): Promise<RepositoryResult<Message | null>> {
    try {
      const stmt = databaseService.db.prepare('SELECT * FROM messages WHERE id = ?');
      const result = stmt.get([id.toString() as InValue]);
      if (!result) {
        return { success: true, data: null };
      }

      const message = this.mapRowToMessage(result as any);
      return { success: true, data: message };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: null
      };
    }
  }

  async findBySessionId(sessionId: string, options?: {
    limit?: number;
    offset?: number;
    includeSystemMessages?: boolean;
  }): Promise<RepositoryResult<Message[]>>;
  async findBySessionId(sessionId: ChatId, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>>;
  async findBySessionId(sessionId: string | ChatId, options?: any): Promise<RepositoryResult<Message[] | PaginatedResult<Message>>> {
    try {
      let sql = 'SELECT * FROM messages WHERE session_id = ?';
      const sessionIdStr = typeof sessionId === 'string' ? sessionId : sessionId.toString();
      const params: InValue[] = [sessionIdStr as InValue];

      // Handle includeSystemMessages option (from string overload)
      if (options && options.includeSystemMessages === false) {
        sql += ' AND role != ?';
        params.push('system' as InValue);
      }

      sql += ' ORDER BY created_at ASC';

      if (options?.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit as InValue);
        
        if (options.offset) {
          sql += ' OFFSET ?';
          params.push(options.offset as InValue);
        }
      }

      const stmt = databaseService.db.prepare(sql);
      const result = stmt.all(params);
      const messages = result.map((row: any) => this.mapRowToMessage(row));
      
      // If sessionId is ChatId, return PaginatedResult
      if (typeof sessionId !== 'string') {
        // Get total count for pagination
        const countSql = 'SELECT COUNT(*) as total FROM messages WHERE session_id = ?';
        const countStmt = databaseService.db.prepare(countSql);
        const countResult = countStmt.get([sessionIdStr as InValue]);
        const totalCount = countResult ? (countResult as any).total as number : 0;
        
        const paginatedResult: PaginatedResult<Message> = {
          items: messages,
          total: totalCount,
          limit: options?.limit || 20,
          offset: options?.offset || 0,
          hasMore: (options?.offset || 0) + messages.length < totalCount
        };
        
        return { success: true, data: paginatedResult };
      }
      
      // If sessionId is string, return Message[]
      return { success: true, data: messages };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: typeof sessionId !== 'string' ? 
          { items: [], total: 0, limit: options?.limit || 20, offset: options?.offset || 0, hasMore: false } :
          []
      };
    }
  }

  async countBySessionId(sessionId: string): Promise<RepositoryResult<number>> {
    try {
      const stmt = databaseService.db.prepare(
        'SELECT COUNT(*) as total FROM messages WHERE session_id = ?'
      );
      const result = stmt.get([sessionId as InValue]);

      const total = result ? (result as any).total as number : 0;
      return { success: true, data: total };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: 0
      };
    }
  }

  async deleteBySessionId(sessionId: string | ChatId): Promise<RepositoryResult<number>> {
    try {
      const stmt = databaseService.db.prepare(
        'DELETE FROM messages WHERE session_id = ?'
      );
      const sessionIdStr = typeof sessionId === 'string' ? sessionId : sessionId.toString();
      const result = stmt.run([sessionIdStr as InValue]);

      return { success: true, data: result.meta.changes };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: 0
      };
    }
  }

  async count(filters?: Record<string, any>): Promise<RepositoryResult<number>> {
    try {
      const stmt = databaseService.db.prepare(
        'SELECT COUNT(*) as total FROM messages'
      );
      const result = stmt.get();

      const total = result ? (result as any).total as number : 0;
      return { success: true, data: total };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: 0
      };
    }
  }

  async save(message: Message): Promise<RepositoryResult<Message>> {
    try {
      const checkStmt = databaseService.db.prepare(
        'SELECT id FROM messages WHERE id = ?'
      );
      const result = checkStmt.get([message.getId() as InValue]);

      if (result) {
        // Update existing message
        const updateStmt = databaseService.db.prepare(
          'UPDATE messages SET content = ?, tool_calls = ? WHERE id = ?'
        );
        updateStmt.run([
          message.getContent().toString() as InValue,
          message.getToolCalls() ? JSON.stringify(message.getToolCalls()?.map(tc => ({ name: tc.name, arguments: tc.arguments, result: tc.result }))) : null as InValue,
          message.getId() as InValue
        ]);
      } else {
        // Insert new message
        const insertStmt = databaseService.db.prepare(
          'INSERT INTO messages (id, session_id, role, content, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        );
        insertStmt.run([
          message.getId() as InValue,
          'session-id-stub' as InValue, // TODO: Fix sessionId access
          message.getRole().toString() as InValue,
          message.getContent().toString() as InValue,
          message.getToolCalls() ? JSON.stringify(message.getToolCalls()?.map(tc => ({ name: tc.name, arguments: tc.arguments, result: tc.result }))) : null as InValue,
          message.getTimestamp().getTime() as InValue
        ]);
      }

      return { success: true, data: message };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: message
      };
    }
  }

  async delete(id: MessageId): Promise<RepositoryResult<boolean>> {
    try {
      const stmt = databaseService.db.prepare(
        'DELETE FROM messages WHERE id = ?'
      );
      const result = stmt.run([id.toString() as InValue]);
      const wasDeleted = result.meta.changes > 0;

      return { success: true, data: wasDeleted };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: undefined
      };
    }
  }

  async create(input: MessageCreateInput): Promise<RepositoryResult<Message>> {
    try {
      const message = Message.create({
        sessionId: input.sessionId.toString(),
        role: input.role,
        content: MessageParts.textOnly(input.content.toString()),
        modelId: 'default-model', // TODO: Add proper modelId
        toolCalls: input.toolCalls || []
      });

      return await this.save(message);
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {} as Message
      };
    }
  }

  async update(id: MessageId, updates: MessageUpdateInput): Promise<RepositoryResult<Message>> {
    try {
      const messageResult = await this.findById(id);
      if (!messageResult.success || !messageResult.data) {
        return { 
          success: false, 
          error: 'Message not found',
          data: {} as Message
        };
      }

      const message = messageResult.data;
      
      if (updates.content !== undefined) {
        message.updateContent(MessageParts.textOnly(updates.content.toString()));
      }
      
      if (updates.toolCalls !== undefined) {
        // This would require a method to update tool calls on Message entity
        // For now, we'll skip this update
      }

      return await this.save(message);
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {} as Message
      };
    }
  }

  async findBeforeMessage(sessionId: string, messageId: string, limit: number): Promise<RepositoryResult<Message[]>> {
    try {
      // First get the timestamp of the reference message
      const refStmt = databaseService.db.prepare(
        'SELECT created_at FROM messages WHERE id = ?'
      );
      const refResult = refStmt.get([messageId as InValue]);

      if (!refResult) {
        return { success: true, data: [] };
      }

      const refTimestamp = (refResult as any).created_at as number;

      // Get messages before this timestamp
      const stmt = databaseService.db.prepare(
        'SELECT * FROM messages WHERE session_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?'
      );
      const result = stmt.all([sessionId as InValue, refTimestamp as InValue, limit as InValue]);

      const messages = result.map((row: any) => this.mapRowToMessage(row));
      return { success: true, data: messages };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: []
      };
    }
  }

  async findAfterMessage(sessionId: string, messageId: string, limit: number): Promise<RepositoryResult<Message[]>> {
    try {
      // First get the timestamp of the reference message
      const refStmt = databaseService.db.prepare(
        'SELECT created_at FROM messages WHERE id = ?'
      );
      const refResult = refStmt.get([messageId as InValue]);

      if (!refResult) {
        return { success: true, data: [] };
      }

      const refTimestamp = (refResult as any).created_at as number;

      // Get messages after this timestamp
      const stmt = databaseService.db.prepare(
        'SELECT * FROM messages WHERE session_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?'
      );
      const result = stmt.all([sessionId as InValue, refTimestamp as InValue, limit as InValue]);

      const messages = result.map(row => this.mapRowToMessage(row as any));
      return { success: true, data: messages };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: []
      };
    }
  }

  // Note: Many of the MessageRepository methods are not fully implemented
  // as they require additional database schema changes or complex logic
  // For now, providing basic implementations that throw "not implemented" errors

  async findByRole(role: MessageRole, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>> {
    throw new Error('Method not implemented');
  }

  async searchByContent(query: string, filters?: MessageSearchFilters, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>> {
    try {
      let sql = 'SELECT * FROM messages WHERE content LIKE ?';
      const params: InValue[] = [`%${query}%` as InValue];

      if (filters?.sessionId) {
        sql += ' AND session_id = ?';
        params.push(filters.sessionId as InValue);
      }

      if (filters?.role) {
        sql += ' AND role = ?';
        params.push(filters.role as InValue);
      }

      sql += ' ORDER BY created_at DESC';

      if (options?.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit as InValue);
        
        if (options.offset) {
          sql += ' OFFSET ?';
          params.push(options.offset as InValue);
        }
      }

      const stmt = databaseService.db.prepare(sql);
      const result = stmt.all(params);
      const messages = result.map(row => this.mapRowToMessage(row as any));
      
      // Get total count for pagination
      const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').split(' ORDER BY')[0];
      const countStmt = databaseService.db.prepare(countSql);
      const countParams = params.slice(0, options?.limit ? -2 : params.length);
      const countResult = countStmt.get(countParams);
      const totalCount = countResult ? (countResult as any).total as number : 0;
      
      const paginatedResult: PaginatedResult<Message> = {
        items: messages,
        total: totalCount,
        limit: options?.limit || 20,
        offset: options?.offset || 0,
        hasMore: (options?.offset || 0) + messages.length < totalCount
      };

      return { success: true, data: paginatedResult };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: { items: [], total: 0, hasMore: false, limit: options?.limit || 20, offset: options?.offset || 0 }
      };
    }
  }

  async findWithToolCalls(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>> {
    throw new Error('Method not implemented');
  }

  async findRecent(limit?: number): Promise<RepositoryResult<Message[]>> {
    try {
      const stmt = databaseService.db.prepare(
        'SELECT * FROM messages ORDER BY created_at DESC LIMIT ?'
      );
      const result = stmt.all([(limit || 20) as InValue]);

      const messages = result.map(row => this.mapRowToMessage(row as any));
      return { success: true, data: messages };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: []
      };
    }
  }

  async findByIdWithContext(id: MessageId): Promise<RepositoryResult<MessageWithContext | null>> {
    throw new Error('Method not implemented');
  }

  async getConversationThread(sessionId: ChatId, options?: QueryOptions): Promise<RepositoryResult<ConversationThread>> {
    throw new Error('Method not implemented');
  }

  async findFirstInSession(sessionId: ChatId): Promise<RepositoryResult<Message | null>> {
    try {
      const stmt = databaseService.db.prepare(
        'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 1'
      );
      const result = stmt.get([sessionId.toString() as InValue]);

      if (!result) {
        return { success: true, data: null };
      }

      const message = this.mapRowToMessage(result as any);
      return { success: true, data: message };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: null
      };
    }
  }

  async findLastInSession(sessionId: ChatId): Promise<RepositoryResult<Message | null>> {
    try {
      const stmt = databaseService.db.prepare(
        'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 1'
      );
      const result = stmt.get([sessionId.toString() as InValue]);

      if (!result) {
        return { success: true, data: null };
      }

      const message = this.mapRowToMessage(result as any);
      return { success: true, data: message };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: null
      };
    }
  }

  async countInSession(sessionId: ChatId): Promise<RepositoryResult<number>> {
    return this.countBySessionId(sessionId.toString());
  }

  // Stub implementations for remaining methods
  async findPendingProcessing(): Promise<RepositoryResult<Message[]>> {
    throw new Error('Method not implemented');
  }

  async bulkInsert(messages: MessageCreateInput[]): Promise<RepositoryResult<Message[]>> {
    throw new Error('Method not implemented');
  }

  async getStatistics(): Promise<RepositoryResult<MessageStatistics>> {
    throw new Error('Method not implemented');
  }

  async findSimilar(messageId: MessageId, limit?: number): Promise<RepositoryResult<Message[]>> {
    throw new Error('Method not implemented');
  }

  async findByToolCall(toolName: string, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>> {
    throw new Error('Method not implemented');
  }

  async exportFromSession(sessionId: ChatId, format?: 'json' | 'markdown' | 'text'): Promise<RepositoryResult<MessageExport>> {
    throw new Error('Method not implemented');
  }

  async importToSession(sessionId: ChatId, messages: MessageImport[]): Promise<RepositoryResult<Message[]>> {
    throw new Error('Method not implemented');
  }

  async findLongMessages(minLength: number, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>> {
    throw new Error('Method not implemented');
  }

  async findByKeywords(keywords: string[], options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>> {
    throw new Error('Method not implemented');
  }

  async getMessageChain(startMessageId: MessageId, direction: 'forward' | 'backward', limit?: number): Promise<RepositoryResult<Message[]>> {
    throw new Error('Method not implemented');
  }

  async deleteOlderThan(date: Date): Promise<RepositoryResult<number>> {
    throw new Error('Method not implemented');
  }

  async findOrphaned(): Promise<RepositoryResult<Message[]>> {
    throw new Error('Method not implemented');
  }

  async archive(messageIds: MessageId[]): Promise<RepositoryResult<void>> {
    throw new Error('Archive functionality not implemented in current schema');
  }

  async restore(messageIds: MessageId[]): Promise<RepositoryResult<void>> {
    throw new Error('Archive functionality not implemented in current schema');
  }

  async findArchived(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>> {
    throw new Error('Archive functionality not implemented in current schema');
  }

  async getConversationAnalytics(sessionId: ChatId): Promise<RepositoryResult<ConversationAnalytics>> {
    throw new Error('Method not implemented');
  }

  async findByDateRange(startDate: Date, endDate: Date, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>> {
    throw new Error('Method not implemented');
  }

  async updateToolCallResults(updates: Array<{ messageId: MessageId; toolName: string; result: any }>): Promise<RepositoryResult<void>> {
    throw new Error('Method not implemented');
  }

  // BaseRepository interface methods
  async findMany(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>> {
    try {
      let sql = 'SELECT * FROM messages';
      const params: InValue[] = [];

      if (options?.search?.query) {
        sql += ' WHERE content LIKE ?';
        params.push(`%${options.search.query}%` as InValue);
      }

      if (options?.sort) {
        sql += ` ORDER BY ${options.sort.field} ${options.sort.direction.toUpperCase()}`;
      } else {
        sql += ' ORDER BY created_at DESC';
      }

      if (options?.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit as InValue);
        
        if (options.offset) {
          sql += ' OFFSET ?';
          params.push(options.offset as InValue);
        }
      }

      const stmt = databaseService.db.prepare(sql);
      const result = stmt.all(params);
      const messages = result.map(row => this.mapRowToMessage(row as any));
      
      // Get total count
      const countSql = 'SELECT COUNT(*) as total FROM messages' + 
        (options?.search?.query ? ' WHERE content LIKE ?' : '');
      const countStmt = databaseService.db.prepare(countSql);
      const countParams = options?.search?.query ? [`%${options.search.query}%` as InValue] : [];
      const countResult = countStmt.get(countParams);
      const totalCount = countResult ? (countResult as any).total as number : 0;
      
      const paginatedResult: PaginatedResult<Message> = {
        items: messages,
        total: totalCount,
        limit: options?.limit || 20,
        offset: options?.offset || 0,
        hasMore: (options?.offset || 0) + messages.length < totalCount
      };

      return { success: true, data: paginatedResult };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: { items: [], total: 0, limit: options?.limit || 20, offset: options?.offset || 0, hasMore: false }
      };
    }
  }

  async exists(id: MessageId): Promise<RepositoryResult<boolean>> {
    try {
      const stmt = databaseService.db.prepare(
        'SELECT 1 FROM messages WHERE id = ? LIMIT 1'
      );
      const result = stmt.get([id.toString() as InValue]);
      
      return { success: true, data: !!result };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: false
      };
    }
  }

  // Helper method
  private mapRowToMessage(row: any): Message {
    const toolCallsJson = row.tool_calls || row[4];
    const toolCalls = toolCallsJson ? JSON.parse(toolCallsJson) : [];

    return Message.create({
      sessionId: row.session_id || row[1] || 'default-session',
      role: MessageRole.fromString(row.role || row[2] || 'user'),
      content: MessageParts.textOnly(row.content || row[3] || ''),
      modelId: 'default-model',
      toolCalls: toolCalls.map((tc: any) => new ToolCall(
        tc.name || '',
        tc.arguments || {},
        tc.result
      ))
    });
  }
}