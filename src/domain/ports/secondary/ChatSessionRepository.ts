import { ChatSession } from '../../entities/ChatSession';
import { ChatId } from '../../value-objects/ChatId';
import { FolderId } from '../../value-objects/FolderId';
import { ModelId } from '../../value-objects/ModelId';
import { BaseRepository, RepositoryResult, PaginatedResult, QueryOptions } from './BaseRepository';

export interface ChatSessionSearchFilters {
  folderId?: string | null;
  modelId?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  hasMessages?: boolean;
  titleContains?: string;
}

export interface ChatSessionCreateInput {
  title?: string;
  modelId: ModelId;
  folderId?: FolderId;
}

export interface ChatSessionUpdateInput {
  title?: string;
  folderId?: FolderId | null;
}

export interface ChatSessionWithStats extends ChatSession {
  messageCount: number;
  lastMessageAt: Date | null;
  totalContentLength: number;
}

export interface ChatSessionRepository extends BaseRepository<ChatSession, ChatId> {
  /**
   * Create a new chat session
   */
  create(input: ChatSessionCreateInput): Promise<RepositoryResult<ChatSession>>;

  /**
   * Update an existing chat session
   */
  update(id: ChatId, updates: ChatSessionUpdateInput): Promise<RepositoryResult<ChatSession>>;

  /**
   * Find chat sessions by folder
   */
  findByFolderId(folderId: FolderId | null, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSession>>>;

  /**
   * Find chat sessions by model
   */
  findByModelId(modelId: ModelId, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSession>>>;

  /**
   * Search chat sessions by title or content
   */
  search(query: string, filters?: ChatSessionSearchFilters, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSession>>>;

  /**
   * Find recent chat sessions
   */
  findRecent(limit?: number): Promise<RepositoryResult<ChatSession[]>>;

  /**
   * Find empty chat sessions (no messages)
   */
  findEmpty(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSession>>>;

  /**
   * Get session with message statistics
   */
  findByIdWithStats(id: ChatId): Promise<RepositoryResult<ChatSessionWithStats | null>>;

  /**
   * Find all sessions with statistics
   */
  findManyWithStats(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSessionWithStats>>>;

  /**
   * Update session's updated_at timestamp
   */
  touch(id: ChatId): Promise<RepositoryResult<void>>;

  /**
   * Generate a unique title for a session based on first message
   */
  generateTitle(sessionId: ChatId, firstMessage: string): Promise<RepositoryResult<string>>;

  /**
   * Bulk update sessions (for folder reorganization)
   */
  bulkUpdateFolder(sessionIds: ChatId[], folderId: FolderId | null): Promise<RepositoryResult<number>>;

  /**
   * Delete sessions older than specified date
   */
  deleteOlderThan(date: Date): Promise<RepositoryResult<number>>;

  /**
   * Get sessions statistics
   */
  getStatistics(): Promise<RepositoryResult<ChatSessionStatistics>>;

  /**
   * Archive/unarchive a session
   */
  archive(id: ChatId): Promise<RepositoryResult<void>>;
  unarchive(id: ChatId): Promise<RepositoryResult<void>>;

  /**
   * Find archived sessions
   */
  findArchived(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<ChatSession>>>;

  /**
   * Duplicate a session (without messages)
   */
  duplicate(id: ChatId, newTitle?: string): Promise<RepositoryResult<ChatSession>>;

  /**
   * Export session data
   */
  export(id: ChatId): Promise<RepositoryResult<ChatSessionExport>>;

  /**
   * Import session data
   */
  import(data: ChatSessionImport): Promise<RepositoryResult<ChatSession>>;

  /**
   * Find sessions that need title generation
   */
  findNeedingTitleGeneration(): Promise<RepositoryResult<ChatSession[]>>;

  /**
   * Update multiple sessions' model references (for model migration)
   */
  updateModelReferences(oldModelId: ModelId, newModelId: ModelId): Promise<RepositoryResult<number>>;
}

export interface ChatSessionStatistics {
  totalSessions: number;
  activeSessions: number;
  archivedSessions: number;
  emptySessions: number;
  sessionsByModel: Record<string, number>;
  sessionsByFolder: Record<string, number>;
  averageMessagesPerSession: number;
  oldestSession: Date | null;
  newestSession: Date | null;
  totalMessageCount: number;
}

export interface ChatSessionExport {
  session: {
    id: string;
    title: string;
    modelId: string;
    folderId?: string;
    createdAt: string;
    updatedAt: string;
  };
  metadata: {
    messageCount: number;
    exportedAt: string;
    exportVersion: string;
  };
}

export interface ChatSessionImport {
  session: {
    title: string;
    modelId: string;
    folderId?: string;
    createdAt?: string;
  };
  metadata?: {
    importedFrom?: string;
    originalId?: string;
  };
}