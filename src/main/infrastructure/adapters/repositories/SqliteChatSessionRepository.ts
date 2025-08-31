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
import { ChatSession } from '../../../../domain/entities/ChatSession';
import { ChatId } from '../../../../domain/value-objects/ChatId';
import { FolderId } from '../../../../domain/value-objects/FolderId';
import { ModelId } from '../../../../domain/value-objects/ModelId';
import { 
  ChatSessionRepository, 
  ChatSessionCreateInput, 
  ChatSessionUpdateInput,
  ChatSessionWithStats,
  ChatSessionStatistics,
  ChatSessionExport,
  ChatSessionImport,
  ChatSessionSearchFilters
} from '../../../../domain/ports/secondary/ChatSessionRepository';
import { RepositoryResult, PaginatedResult, QueryOptions } from '../../../../domain/ports/secondary/BaseRepository';

export class SqliteChatSessionRepository implements ChatSessionRepository {
  
  async findById(id: ChatId): Promise<RepositoryResult<ChatSession | null>> {
    try {
      const stmt = databaseService.db.prepare('SELECT * FROM chat_sessions WHERE id = ?');
      const result = stmt.get([id.toString() as InValue]);
      if (!result) {
        return { success: true, data: null };
      }

      const session = this.mapRowToChatSession(result as any);
      return { success: true, data: session };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: null
      };
    }
  }

  async findAll(): Promise<RepositoryResult<ChatSession[]>> {
    try {
      const stmt = databaseService.db.prepare(
        'SELECT * FROM chat_sessions ORDER BY updated_at DESC'
      );
      const result = stmt.all();

      const sessions = result.map(row => this.mapRowToChatSession(row));
      return { success: true, data: sessions };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: []
      };
    }
  }

  async findMany(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSession>>> {
    try {
      const limit = options?.limit || 20;
      const offset = options?.offset || 0;
      const sortBy = options?.sort?.field || 'updatedAt';
      const sortOrder = options?.sort?.direction || 'desc';
      const orderColumn = this.mapSortColumn(sortBy);
      
      // Count total for pagination
      const countStmt = databaseService.db.prepare('SELECT COUNT(*) as total FROM chat_sessions');
      const countResult = countStmt.get();
      const totalCount = countResult ? countResult[0] as number : 0;

      // Get paginated results
      const stmt = databaseService.db.prepare(
        `SELECT * FROM chat_sessions ORDER BY ${orderColumn} ${sortOrder.toUpperCase()} LIMIT ? OFFSET ?`
      );
      const result = stmt.all([limit as InValue, offset as InValue]);
      const sessions = result.map(row => this.mapRowToChatSession(row));
      
      const paginatedResult: PaginatedResult<ChatSession> = {
        items: sessions,
        total: totalCount,
        limit,
        offset,
        hasMore: offset + sessions.length < totalCount
      };

      return { success: true, data: paginatedResult };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {
          items: [],
          total: 0,
          limit: options?.limit || 20,
          offset: options?.offset || 0,
          hasMore: false
        }
      };
    }
  }

  async exists(id: ChatId): Promise<RepositoryResult<boolean>> {
    try {
      const stmt = databaseService.db.prepare(
        'SELECT 1 FROM chat_sessions WHERE id = ? LIMIT 1'
      );
      const result = stmt.get([id.getValue() as InValue]);
      const exists = !!result;

      return { success: true, data: exists };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: false
      };
    }
  }

  async findWithPagination(options: {
    limit: number;
    offset: number;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  }): Promise<RepositoryResult<ChatSession[]>> {
    try {
      const { limit, offset, sortBy, sortOrder } = options;
      const orderColumn = this.mapSortColumn(sortBy);
      
      const stmt = databaseService.db.prepare(
        `SELECT * FROM chat_sessions ORDER BY ${orderColumn} ${sortOrder.toUpperCase()} LIMIT ? OFFSET ?`
      );
      const result = stmt.all([limit as InValue, offset as InValue]);

      const sessions = result.map(row => this.mapRowToChatSession(row));
      return { success: true, data: sessions };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: []
      };
    }
  }

  async save(session: ChatSession): Promise<RepositoryResult<ChatSession>> {
    try {
      const now = Date.now();
      
      const checkStmt = databaseService.db.prepare(
        'SELECT id FROM chat_sessions WHERE id = ?'
      );
      const existingResult = checkStmt.get([session.getId() as InValue]);

      if (existingResult) {
        // Update existing session
        const updateStmt = databaseService.db.prepare(
          'UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?'
        );
        updateStmt.run([
          session.getTitle() as InValue,
          now as InValue,
          session.getId() as InValue
        ]);
      } else {
        // Insert new session
        const insertStmt = databaseService.db.prepare(
          'INSERT INTO chat_sessions (id, title, model, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        );
        insertStmt.run([
          session.getId() as InValue,
          session.getTitle() as InValue,
          session.getModelId() as InValue,
          session.getFolderId() as InValue,
          session.getCreatedAt().getTime() as InValue,
          now as InValue
        ]);
      }

      return { success: true, data: session };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: session
      };
    }
  }

  async delete(id: ChatId): Promise<RepositoryResult<boolean>> {
    try {
      const stmt = databaseService.db.prepare(
        'DELETE FROM chat_sessions WHERE id = ?'
      );
      const result = stmt.run([id.getValue() as InValue]);
      const wasDeleted = result.meta.changes > 0;

      return { success: true, data: wasDeleted };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: false
      };
    }
  }

  async count(filters?: { archived?: boolean }): Promise<RepositoryResult<number>> {
    try {
      // Note: Archived functionality not implemented in current schema
      const stmt = databaseService.db.prepare(
        'SELECT COUNT(*) as total FROM chat_sessions'
      );
      const result = stmt.get();

      const total = result ? result[0] as number : 0;
      return { success: true, data: total };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: 0
      };
    }
  }

  async search(query: string, filters?: ChatSessionSearchFilters, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSession>>> {
    try {
      const limit = options?.limit || 20;
      const offset = options?.offset || 0;
      const sortBy = options?.sort?.field || 'updatedAt';
      const sortOrder = options?.sort?.direction || 'desc';
      const orderColumn = this.mapSortColumn(sortBy);
      
      let sql = 'SELECT * FROM chat_sessions WHERE title LIKE ?';
      const params: InValue[] = [`%${query}%` as InValue];

      // Apply filters if provided
      if (filters?.folderId !== undefined) {
        if (filters.folderId === null) {
          sql += ' AND folder_id IS NULL';
        } else {
          sql += ' AND folder_id = ?';
          params.push(filters.folderId as InValue);
        }
      }

      if (filters?.modelId) {
        sql += ' AND model = ?';
        params.push(filters.modelId as InValue);
      }

      if (filters?.createdAfter) {
        sql += ' AND created_at >= ?';
        params.push(filters.createdAfter.getTime() as InValue);
      }

      if (filters?.createdBefore) {
        sql += ' AND created_at <= ?';
        params.push(filters.createdBefore.getTime() as InValue);
      }

      if (filters?.titleContains) {
        sql += ' AND title LIKE ?';
        params.push(`%${filters.titleContains}%` as InValue);
      }

      // Count total for pagination
      const countSql = sql.replace('SELECT * FROM', 'SELECT COUNT(*) as total FROM');
      const countStmt = databaseService.db.prepare(countSql);
      const countResult = countStmt.get(params);
      const totalCount = countResult ? countResult[0] as number : 0;

      // Apply sorting and pagination
      sql += ` ORDER BY ${orderColumn} ${sortOrder.toUpperCase()} LIMIT ? OFFSET ?`;
      params.push(limit as InValue, offset as InValue);

      const stmt = databaseService.db.prepare(sql);
      const result = stmt.all(params);
      const sessions = result.map(row => this.mapRowToChatSession(row));
      
      const paginatedResult: PaginatedResult<ChatSession> = {
        items: sessions,
        total: totalCount,
        limit,
        offset,
        hasMore: offset + sessions.length < totalCount
      };

      return { success: true, data: paginatedResult };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {
          items: [],
          total: 0,
          limit: options?.limit || 20,
          offset: options?.offset || 0,
          hasMore: false
        }
      };
    }
  }

  async searchCount(options: {
    query: string;
    includeArchived: boolean;
    modelFilter?: string[];
    dateRange?: { start?: Date; end?: Date };
  }): Promise<RepositoryResult<number>> {
    try {
      const { query, modelFilter, dateRange } = options;
      
      let sql = 'SELECT COUNT(*) as total FROM chat_sessions WHERE title LIKE ?';
      const params: InValue[] = [`%${query}%` as InValue];

      if (modelFilter && modelFilter.length > 0) {
        const placeholders = modelFilter.map(() => '?').join(',');
        sql += ` AND model IN (${placeholders})`;
        params.push(...modelFilter.map(m => m as InValue));
      }

      if (dateRange?.start) {
        sql += ' AND created_at >= ?';
        params.push(dateRange.start.getTime() as InValue);
      }

      if (dateRange?.end) {
        sql += ' AND created_at <= ?';
        params.push(dateRange.end.getTime() as InValue);
      }

      const stmt = databaseService.db.prepare(sql);
      const result = stmt.get(params);
      const total = result ? result[0] as number : 0;
      
      return { success: true, data: total };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: 0
      };
    }
  }

  async getModelUsageStats(): Promise<RepositoryResult<Array<{ modelId: string; count: number }>>> {
    try {
      const stmt = databaseService.db.prepare(
        'SELECT model as modelId, COUNT(*) as count FROM chat_sessions GROUP BY model ORDER BY count DESC'
      );
      const result = stmt.all();

      const stats = result.map(row => ({
        modelId: row[0] as string,
        count: row[1] as number
      }));

      return { success: true, data: stats };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: []
      };
    }
  }

  async countByDateRange(startDate: Date, endDate: Date): Promise<RepositoryResult<number>> {
    try {
      const stmt = databaseService.db.prepare(
        'SELECT COUNT(*) as total FROM chat_sessions WHERE created_at BETWEEN ? AND ?'
      );
      const result = stmt.get([startDate.getTime() as InValue, endDate.getTime() as InValue]);

      const total = result ? result[0] as number : 0;
      return { success: true, data: total };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: 0
      };
    }
  }

  // Additional methods from ChatSessionRepository interface
  async create(input: ChatSessionCreateInput): Promise<RepositoryResult<ChatSession>> {
    try {
      const session = ChatSession.create({
        title: input.title,
        modelId: input.modelId.getValue(),
        folderId: input.folderId?.getValue()
      });

      return await this.save(session);
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {} as ChatSession
      };
    }
  }

  async update(id: ChatId, updates: ChatSessionUpdateInput): Promise<RepositoryResult<ChatSession>> {
    try {
      const sessionResult = await this.findById(id);
      if (!sessionResult.success || !sessionResult.data) {
        return { 
          success: false, 
          error: 'Session not found',
          data: {} as ChatSession
        };
      }

      const session = sessionResult.data;
      
      if (updates.title !== undefined) {
        session.setTitle(updates.title);
      }
      
      if (updates.folderId !== undefined) {
        session.setFolderId(updates.folderId?.getValue());
      }

      return await this.save(session);
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {} as ChatSession
      };
    }
  }

  // Note: Many of the ChatSessionRepository methods are not fully implemented
  // as they require additional database schema changes or complex logic
  // For now, providing basic implementations that throw "not implemented" errors

  async findByFolderId(folderId: FolderId | null, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSession>>> {
    throw new Error('Method not implemented');
  }

  async findByModelId(modelId: ModelId, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSession>>> {
    throw new Error('Method not implemented');
  }

  async findRecent(limit?: number): Promise<RepositoryResult<ChatSession[]>> {
    try {
      const stmt = databaseService.db.prepare(
        'SELECT * FROM chat_sessions ORDER BY updated_at DESC LIMIT ?'
      );
      const result = stmt.all([(limit || 10) as InValue]);

      const sessions = result.map(row => this.mapRowToChatSession(row));
      return { success: true, data: sessions };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: []
      };
    }
  }

  async findEmpty(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSession>>> {
    throw new Error('Method not implemented');
  }

  async findByIdWithStats(id: ChatId): Promise<RepositoryResult<ChatSessionWithStats | null>> {
    throw new Error('Method not implemented');
  }

  async findManyWithStats(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSessionWithStats>>> {
    throw new Error('Method not implemented');
  }

  async touch(id: ChatId): Promise<RepositoryResult<void>> {
    try {
      const stmt = databaseService.db.prepare(
        'UPDATE chat_sessions SET updated_at = ? WHERE id = ?'
      );
      stmt.run([Date.now() as InValue, id.getValue() as InValue]);

      return { success: true, data: undefined };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        data: undefined
      };
    }
  }

  async generateTitle(sessionId: ChatId, firstMessage: string): Promise<RepositoryResult<string>> {
    // Simple title generation based on first message
    const truncated = firstMessage.length > 50 ? 
      firstMessage.substring(0, 50) + '...' : 
      firstMessage;
    
    const title = truncated.trim() || 'New Conversation';
    return { success: true, data: title };
  }

  async bulkUpdateFolder(sessionIds: ChatId[], folderId: FolderId | null): Promise<RepositoryResult<number>> {
    throw new Error('Method not implemented');
  }

  async deleteOlderThan(date: Date): Promise<RepositoryResult<number>> {
    throw new Error('Method not implemented');
  }

  async getStatistics(): Promise<RepositoryResult<ChatSessionStatistics>> {
    throw new Error('Method not implemented');
  }

  async archive(id: ChatId): Promise<RepositoryResult<void>> {
    throw new Error('Archive functionality not implemented in current schema');
  }

  async unarchive(id: ChatId): Promise<RepositoryResult<void>> {
    throw new Error('Archive functionality not implemented in current schema');
  }

  async findArchived(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSession>>> {
    throw new Error('Archive functionality not implemented in current schema');
  }

  async duplicate(id: ChatId, newTitle?: string): Promise<RepositoryResult<ChatSession>> {
    throw new Error('Method not implemented');
  }

  async export(id: ChatId): Promise<RepositoryResult<ChatSessionExport>> {
    throw new Error('Method not implemented');
  }

  async import(data: ChatSessionImport): Promise<RepositoryResult<ChatSession>> {
    throw new Error('Method not implemented');
  }

  async findNeedingTitleGeneration(): Promise<RepositoryResult<ChatSession[]>> {
    throw new Error('Method not implemented');
  }

  async updateModelReferences(oldModelId: ModelId, newModelId: ModelId): Promise<RepositoryResult<number>> {
    throw new Error('Method not implemented');
  }

  // Helper methods
  private mapRowToChatSession(row: any[]): ChatSession {
    return new ChatSession(
      row[0] as string,        // id
      row[1] as string,        // title
      row[2] as string,        // model
      new Date(row[4] as number), // created_at
      new Date(row[5] as number), // updated_at
      row[3] as string         // folder_id
    );
  }

  private mapSortColumn(sortBy: string): string {
    switch (sortBy) {
      case 'createdAt':
        return 'created_at';
      case 'updatedAt':
        return 'updated_at';
      case 'title':
        return 'title';
      default:
        return 'updated_at';
    }
  }
}