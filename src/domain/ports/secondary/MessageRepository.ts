import { Message } from '../../entities/Message';
import { MessageId } from '../../value-objects/MessageId';
import { ChatId } from '../../value-objects/ChatId';
import { MessageRole } from '../../value-objects/MessageRole';
import { MessageContent } from '../../value-objects/MessageContent';
import { ToolCall } from '../../value-objects/ToolCall';
import { BaseRepository, RepositoryResult, PaginatedResult, QueryOptions } from './BaseRepository';

export interface MessageSearchFilters {
  sessionId?: string;
  role?: 'user' | 'assistant' | 'system';
  hasToolCalls?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
  contentContains?: string;
  minContentLength?: number;
  maxContentLength?: number;
}

export interface MessageCreateInput {
  sessionId: ChatId;
  role: MessageRole;
  content: MessageContent;
  toolCalls?: ToolCall[];
}

export interface MessageUpdateInput {
  content?: MessageContent;
  toolCalls?: ToolCall[];
}

export interface MessageWithContext extends Message {
  sessionTitle: string;
  previousMessage: Message | null;
  nextMessage: Message | null;
}

export interface MessageStatistics {
  totalMessages: number;
  messagesByRole: Record<string, number>;
  messagesWithToolCalls: number;
  averageContentLength: number;
  totalContentLength: number;
  oldestMessage: Date | null;
  newestMessage: Date | null;
  messagesInLast24Hours: number;
  messagesInLastWeek: number;
  messagesInLastMonth: number;
}

export interface ConversationThread {
  sessionId: string;
  messages: Message[];
  totalMessages: number;
  startedAt: Date;
  lastActivity: Date;
}

export interface MessageRepository extends BaseRepository<Message, MessageId> {
  /**
   * Create a new message
   */
  create(input: MessageCreateInput): Promise<RepositoryResult<Message>>;

  /**
   * Update an existing message
   */
  update(id: MessageId, updates: MessageUpdateInput): Promise<RepositoryResult<Message>>;

  /**
   * Find messages by session ID with pagination
   */
  findBySessionId(sessionId: ChatId, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>>;

  /**
   * Find messages by role across all sessions
   */
  findByRole(role: MessageRole, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>>;

  /**
   * Search messages by content
   */
  searchByContent(query: string, filters?: MessageSearchFilters, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>>;

  /**
   * Find messages with tool calls
   */
  findWithToolCalls(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>>;

  /**
   * Find recent messages across all sessions
   */
  findRecent(limit?: number): Promise<RepositoryResult<Message[]>>;

  /**
   * Get message with context (previous/next messages)
   */
  findByIdWithContext(id: MessageId): Promise<RepositoryResult<MessageWithContext | null>>;

  /**
   * Get conversation thread for a session
   */
  getConversationThread(sessionId: ChatId, options?: QueryOptions): Promise<RepositoryResult<ConversationThread>>;

  /**
   * Get first message in a session
   */
  findFirstInSession(sessionId: ChatId): Promise<RepositoryResult<Message | null>>;

  /**
   * Get last message in a session
   */
  findLastInSession(sessionId: ChatId): Promise<RepositoryResult<Message | null>>;

  /**
   * Count messages in a session
   */
  countInSession(sessionId: ChatId): Promise<RepositoryResult<number>>;

  /**
   * Delete all messages in a session
   */
  deleteBySessionId(sessionId: ChatId): Promise<RepositoryResult<number>>;

  /**
   * Find messages that need processing (streaming completion, etc.)
   */
  findPendingProcessing(): Promise<RepositoryResult<Message[]>>;

  /**
   * Bulk insert messages (for import/migration)
   */
  bulkInsert(messages: MessageCreateInput[]): Promise<RepositoryResult<Message[]>>;

  /**
   * Get messages statistics
   */
  getStatistics(): Promise<RepositoryResult<MessageStatistics>>;

  /**
   * Find similar messages by content
   */
  findSimilar(messageId: MessageId, limit?: number): Promise<RepositoryResult<Message[]>>;

  /**
   * Get messages with specific tool calls
   */
  findByToolCall(toolName: string, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>>;

  /**
   * Export messages from a session
   */
  exportFromSession(sessionId: ChatId, format?: 'json' | 'markdown' | 'text'): Promise<RepositoryResult<MessageExport>>;

  /**
   * Import messages to a session
   */
  importToSession(sessionId: ChatId, messages: MessageImport[]): Promise<RepositoryResult<Message[]>>;

  /**
   * Find long messages that might need truncation
   */
  findLongMessages(minLength: number, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>>;

  /**
   * Find messages containing specific keywords
   */
  findByKeywords(keywords: string[], options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>>;

  /**
   * Get message chain (conversation flow)
   */
  getMessageChain(startMessageId: MessageId, direction: 'forward' | 'backward', limit?: number): Promise<RepositoryResult<Message[]>>;

  /**
   * Delete messages older than specified date
   */
  deleteOlderThan(date: Date): Promise<RepositoryResult<number>>;

  /**
   * Find orphaned messages (messages without valid session)
   */
  findOrphaned(): Promise<RepositoryResult<Message[]>>;

  /**
   * Archive messages (soft delete with retention)
   */
  archive(messageIds: MessageId[]): Promise<RepositoryResult<void>>;

  /**
   * Restore archived messages
   */
  restore(messageIds: MessageId[]): Promise<RepositoryResult<void>>;

  /**
   * Find archived messages
   */
  findArchived(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>>;

  /**
   * Get conversation analytics for a session
   */
  getConversationAnalytics(sessionId: ChatId): Promise<RepositoryResult<ConversationAnalytics>>;

  /**
   * Find messages by date range
   */
  findByDateRange(startDate: Date, endDate: Date, options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<Message>>>;

  /**
   * Update tool call results in batch
   */
  updateToolCallResults(updates: Array<{ messageId: MessageId; toolName: string; result: any }>): Promise<RepositoryResult<void>>;
}

export interface MessageExport {
  format: 'json' | 'markdown' | 'text';
  sessionId: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    toolCalls?: any[];
    createdAt: string;
  }>;
  metadata: {
    totalMessages: number;
    exportedAt: string;
    exportVersion: string;
  };
}

export interface MessageImport {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: any[];
  createdAt?: string;
  metadata?: {
    originalId?: string;
    importSource?: string;
  };
}

export interface ConversationAnalytics {
  sessionId: string;
  totalMessages: number;
  messagesByRole: Record<string, number>;
  averageMessageLength: number;
  totalTokensEstimate: number;
  conversationDuration: number; // in milliseconds
  toolCallsUsed: string[];
  topicKeywords: string[];
  sentimentScore?: number;
  engagementLevel: 'low' | 'medium' | 'high';
}