import { 
  ChatSessionRepository,
  ChatSessionCreateInput,
  ChatSessionUpdateInput,
  ChatSessionWithStats,
  ChatSessionStatistics,
  ChatSessionExport,
  ChatSessionImport,
  ChatSessionSearchFilters
} from '../../../domain/ports/secondary/ChatSessionRepository';
import { ChatSession } from '../../../domain/entities/ChatSession';
import { ChatId } from '../../../domain/value-objects/ChatId';
import { FolderId } from '../../../domain/value-objects/FolderId';
import { ModelId } from '../../../domain/value-objects/ModelId';
import { RepositoryResult, PaginatedResult, QueryOptions } from '../../../domain/ports/secondary/BaseRepository';

/**
 * Renderer Process adapter that implements ChatSessionRepository
 * by communicating with Main Process via IPC
 */
export class ElectronChatSessionAdapter implements ChatSessionRepository {

  async findById(id: ChatId): Promise<RepositoryResult<ChatSession | null>> {
    try {
      const result = await window.levante.db.sessions.get(id.getValue());
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: null
        };
      }

      const session = result.data ? this.mapDataToChatSession(result.data) : null;
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
      const result = await window.levante.db.sessions.list();
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: []
        };
      }

      const sessions = result.data.items?.map((item: any) => this.mapDataToChatSession(item)) || [];
      return { success: true, data: sessions };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: []
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
      const result = await window.levante.db.sessions.list(options);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: []
        };
      }

      const sessions = result.data.items?.map((item: any) => this.mapDataToChatSession(item)) || [];
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
      // Determine if this is an update or create based on session data
      const sessionData = {
        title: session.getTitle(),
        folderId: session.getFolderId()
      };

      const result = await window.levante.db.sessions.update({
        id: session.getId(),
        ...sessionData
      });
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: session
        };
      }

      const updatedSession = this.mapDataToChatSession(result.data);
      return { success: true, data: updatedSession };
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
      const result = await window.levante.db.sessions.delete(id.getValue());
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: false
        };
      }

      return { success: true, data: true };
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
      const result = await window.levante.db.sessions.list();
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: 0
        };
      }

      const count = result.data?.total || 0;
        
      return { success: true, data: count };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: 0
      };
    }
  }

  async search(query: string, filters?: any, options?: any): Promise<RepositoryResult<any>> {
    try {
      const result = await window.levante.db.sessions.list();
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: []
        };
      }

      const sessions = result.data.items?.map((item: any) => this.mapDataToChatSession(item)) || [];
      return { success: true, data: sessions };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: []
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
      const result = await window.levante.db.sessions.list();
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: 0
        };
      }

      return { success: true, data: result.data.total || 0 };
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
      const result = await window.levante.db.sessions.list();
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: []
        };
      }

      const stats: Array<{ modelId: string; count: number }> = [];

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
      const result = await window.levante.db.sessions.list({
        limit: 0,
        offset: 0
      });
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: 0
        };
      }

      return { success: true, data: result.data.total || 0 };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: 0
      };
    }
  }

  // Additional ChatSessionRepository methods - most delegate to Main Process via IPC

  async create(input: ChatSessionCreateInput): Promise<RepositoryResult<ChatSession>> {
    // This would typically create via IPC, for now use save
    const session = ChatSession.create({
      title: input.title,
      modelId: input.modelId.getValue(),
      folderId: input.folderId?.getValue()
    });
    
    return this.save(session);
  }

  async update(id: ChatId, updates: ChatSessionUpdateInput): Promise<RepositoryResult<ChatSession>> {
    try {
      const result = await window.levante.db.sessions.update({
        id: id.getValue(),
        title: updates.title,
        folder_id: updates.folderId?.getValue()
      });
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: {} as ChatSession
        };
      }

      const session = this.mapDataToChatSession(result.data);
      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {} as ChatSession
      };
    }
  }

  // Stub implementations for remaining methods
  async findByFolderId(folderId: FolderId | null, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSession>>> {
    throw new Error('Method not implemented');
  }

  async findByModelId(modelId: ModelId, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSession>>> {
    throw new Error('Method not implemented');
  }

  async findRecent(limit?: number): Promise<RepositoryResult<ChatSession[]>> {
    return this.findWithPagination({ limit: limit || 10, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' });
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
    throw new Error('Method not implemented');
  }

  async generateTitle(sessionId: ChatId, firstMessage: string): Promise<RepositoryResult<string>> {
    throw new Error('Method not implemented');
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
    try {
      const result = await window.levante.db.sessions.update({
        id: id.getValue(),
        archived: true
      } as any);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: undefined
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: undefined
      };
    }
  }

  async unarchive(id: ChatId): Promise<RepositoryResult<void>> {
    try {
      const result = await window.levante.db.sessions.update({
        id: id.getValue(),
        archived: false
      } as any);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: undefined
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: undefined
      };
    }
  }

  async findArchived(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSession>>> {
    throw new Error('Method not implemented');
  }

  async duplicate(id: ChatId, newTitle?: string): Promise<RepositoryResult<ChatSession>> {
    try {
      const originalResult = await window.levante.db.sessions.get(id.getValue());
      if (!originalResult.success || !originalResult.data) {
        return {
          success: false,
          error: 'Original session not found',
          data: {} as ChatSession
        };
      }
      
      const result = await window.levante.db.sessions.create({
        title: newTitle || originalResult.data.title + ' (Copy)',
        model: originalResult.data.model,
        folder_id: originalResult.data.folder_id
      });
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: {} as ChatSession
        };
      }

      const session = this.mapDataToChatSession(result.data);
      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {} as ChatSession
      };
    }
  }

  async export(id: ChatId): Promise<RepositoryResult<ChatSessionExport>> {
    try {
      const result = await window.levante.db.sessions.get(id.getValue());
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: {} as ChatSessionExport
        };
      }

      if (!result.data) {
        return {
          success: false,
          error: 'Session not found',
          data: {} as ChatSessionExport
        };
      }
      
      return {
        success: true,
        data: result.data as unknown as ChatSessionExport
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {} as ChatSessionExport
      };
    }
  }

  async import(data: ChatSessionImport): Promise<RepositoryResult<ChatSession>> {
    try {
      const result = await window.levante.db.sessions.create({
        title: (data as any).title || 'Imported Session',
        model: (data as any).modelId || 'default-model',
        folder_id: (data as any).folderId
      });
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: {} as ChatSession
        };
      }

      const session = this.mapDataToChatSession(result.data);
      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {} as ChatSession
      };
    }
  }

  async findNeedingTitleGeneration(): Promise<RepositoryResult<ChatSession[]>> {
    throw new Error('Method not implemented');
  }

  async updateModelReferences(oldModelId: ModelId, newModelId: ModelId): Promise<RepositoryResult<number>> {
    throw new Error('Method not implemented');
  }

  // BaseRepository interface methods
  async findMany(options?: any): Promise<RepositoryResult<any>> {
    return this.findAll();
  }

  async exists(id: ChatId): Promise<RepositoryResult<boolean>> {
    try {
      const result = await this.findById(id);
      return {
        success: true,
        data: result.success && result.data !== null
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: false
      };
    }
  }

  // Helper method to convert IPC data to ChatSession entity
  private mapDataToChatSession(data: any): ChatSession {
    return new ChatSession(
      data.id,
      data.title,
      data.modelId,
      new Date(data.createdAt),
      new Date(data.updatedAt),
      data.folderId
    );
  }
}