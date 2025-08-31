import { ChatSession } from '../../entities/ChatSession';

// Input types for the port
export interface SessionSearchOptions {
  query?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'messageCount';
  sortOrder?: 'asc' | 'desc';
  includeArchived?: boolean;
  modelFilter?: string[];
  dateRange?: {
    start?: Date;
    end?: Date;
  };
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'messageCount';
  sortOrder?: 'asc' | 'desc';
}

export interface SessionUpdateData {
  title?: string;
  archived?: boolean;
  starred?: boolean;
  folderId?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

// Output types for responses
export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
  nextOffset?: number;
  currentPage?: number;
  totalPages?: number;
}

export interface SessionDeletionResult {
  success: boolean;
  sessionId: string;
  messageCount: number;
  archiveAvailable: boolean;
}

export interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  archivedSessions: number;
  totalMessages: number;
  averageMessagesPerSession: number;
  sessionsByModel: Array<{ modelId: string; count: number }>;
  sessionsThisWeek: number;
  sessionsThisMonth: number;
}

// Error types specific to session operations
export abstract class ChatSessionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class SessionNotFoundError extends ChatSessionError {
  constructor(sessionId: string) {
    super(`Chat session ${sessionId} not found`, 'SESSION_NOT_FOUND', false);
  }
}

export class SessionUpdateError extends ChatSessionError {
  constructor(sessionId: string, reason: string) {
    super(`Failed to update session ${sessionId}: ${reason}`, 'SESSION_UPDATE_ERROR', true);
  }
}

export class SessionDeletionError extends ChatSessionError {
  constructor(sessionId: string, reason: string) {
    super(`Failed to delete session ${sessionId}: ${reason}`, 'SESSION_DELETION_ERROR', true);
  }
}

export class InvalidSearchQueryError extends ChatSessionError {
  constructor(query: string) {
    super(`Invalid search query: ${query}`, 'INVALID_SEARCH_QUERY', false);
  }
}

export class SessionAccessError extends ChatSessionError {
  constructor(sessionId: string) {
    super(`Access denied to session ${sessionId}`, 'SESSION_ACCESS_ERROR', false);
  }
}

// Main port interface
export interface ChatSessionPort {
  /**
   * List sessions with optional filtering and pagination
   */
  listSessions(options?: PaginationOptions): Promise<PaginatedResult<ChatSession>>;

  /**
   * Delete a session and all its messages
   */
  deleteSession(sessionId: string, options?: { archive?: boolean }): Promise<SessionDeletionResult>;

  /**
   * Update session metadata (title, archived status, etc.)
   */
  updateSession(sessionId: string, updates: SessionUpdateData): Promise<ChatSession>;

  /**
   * Update only the session title
   */
  updateSessionTitle(sessionId: string, title: string): Promise<ChatSession>;

  /**
   * Search sessions by content, title, or metadata
   */
  searchSessions(options: SessionSearchOptions): Promise<PaginatedResult<ChatSession>>;

  /**
   * Get a specific session by ID
   */
  getSession(sessionId: string): Promise<ChatSession>;

  /**
   * Archive/unarchive a session
   */
  archiveSession(sessionId: string, archived: boolean): Promise<ChatSession>;

  /**
   * Star/unstar a session for quick access
   */
  starSession(sessionId: string, starred: boolean): Promise<ChatSession>;

  /**
   * Organize session into folders
   */
  moveToFolder(sessionId: string, folderId?: string): Promise<ChatSession>;

  /**
   * Duplicate a session (without messages)
   */
  duplicateSession(sessionId: string, title?: string): Promise<ChatSession>;

  /**
   * Get session statistics
   */
  getSessionStats(): Promise<SessionStats>;

  /**
   * Bulk operations on multiple sessions
   */
  bulkDeleteSessions(sessionIds: string[]): Promise<SessionDeletionResult[]>;

  /**
   * Bulk archive/unarchive sessions
   */
  bulkArchiveSessions(sessionIds: string[], archived: boolean): Promise<ChatSession[]>;

  /**
   * Export session data
   */
  exportSession(sessionId: string, format?: 'json' | 'markdown' | 'txt'): Promise<SessionExport>;

  /**
   * Import session data
   */
  importSession(data: SessionImport): Promise<ChatSession>;
}

// Supporting types for session operations
export interface SessionFolder {
  id: string;
  name: string;
  description?: string;
  color?: string;
  sessionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionExport {
  format: 'json' | 'markdown' | 'txt';
  data: string | object;
  filename: string;
  size: number;
  exportedAt: Date;
}

export interface SessionImport {
  format: 'json' | 'markdown' | 'txt';
  data: string | object;
  mergeStrategy?: 'replace' | 'merge' | 'append';
  preserveIds?: boolean;
}

// Events emitted by session operations
export interface SessionEvent {
  type: SessionEventType;
  sessionId?: string;
  timestamp: Date;
  data?: any;
}

export type SessionEventType = 
  | 'session_created'
  | 'session_updated'
  | 'session_deleted'
  | 'session_archived'
  | 'session_starred'
  | 'session_moved'
  | 'sessions_searched'
  | 'bulk_operation_completed'
  | 'session_exported'
  | 'session_imported';

// Configuration for session management
export interface SessionManagementConfig {
  autoArchiveAfterDays?: number;
  maxSessionsPerUser?: number;
  enableFullTextSearch: boolean;
  allowBulkOperations: boolean;
  searchIndexEnabled: boolean;
  exportFormats: ('json' | 'markdown' | 'txt')[];
  backupEnabled: boolean;
  backupRetentionDays: number;
}

// Validation rules for session operations
export interface SessionValidationRules {
  titleMinLength: number;
  titleMaxLength: number;
  maxTagsPerSession: number;
  tagMaxLength: number;
  allowedMetadataKeys: string[];
  maxMetadataSize: number;
  folderNameMaxLength: number;
  maxSessionsPerFolder?: number;
}