import { ChatSessionPort, PaginatedResult, SessionSearchOptions, PaginationOptions, SessionUpdateData, SessionDeletionResult, SessionStats, SessionExport, SessionImport, SessionNotFoundError, SessionUpdateError, SessionDeletionError, InvalidSearchQueryError } from '../../domain/ports/primary/ChatSessionPort';
import { ChatSession } from '../../domain/entities/ChatSession';
import { ChatSessionRepository, ChatSessionSearchFilters } from '../../domain/ports/secondary/ChatSessionRepository';
import { MessageRepository } from '../../domain/ports/secondary/MessageRepository';
import { QueryOptions } from '../../domain/ports/secondary/BaseRepository';
import { ChatId } from '../../domain/value-objects/ChatId';
import { ModelId } from '../../domain/value-objects/ModelId';

export class ChatSessionService implements ChatSessionPort {
  constructor(
    private readonly sessionRepository: ChatSessionRepository,
    private readonly messageRepository: MessageRepository
  ) {}

  async listSessions(options?: PaginationOptions): Promise<PaginatedResult<ChatSession>> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const sortBy = options?.sortBy || 'updatedAt';
    const sortOrder = options?.sortOrder || 'desc';

    // Get sessions with pagination
    const sessionsResult = await this.sessionRepository.findWithPagination({
      limit,
      offset,
      sortBy,
      sortOrder
    });
    const sessions = sessionsResult.success && sessionsResult.data ? sessionsResult.data : [];

    // Get total count
    const totalCountResult = await this.sessionRepository.count();
    const totalCount = totalCountResult.success && totalCountResult.data ? totalCountResult.data : 0;

    return {
      items: sessions,
      totalCount,
      hasMore: offset + sessions.length < totalCount,
      nextOffset: offset + sessions.length < totalCount ? offset + limit : undefined,
      currentPage: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(totalCount / limit)
    };
  }

  async deleteSession(sessionId: string, options?: { archive?: boolean }): Promise<SessionDeletionResult> {
    const sessionResult = await this.sessionRepository.findById(ChatId.fromString(sessionId));
    if (!sessionResult.success || !sessionResult.data) {
      throw new SessionNotFoundError(sessionId);
    }
    const session = sessionResult.data;

    try {
      // Get message count before deletion
      const messageCountResult = await this.messageRepository.countBySessionId(sessionId);
      const messageCount = messageCountResult.success && messageCountResult.data ? messageCountResult.data : 0;

      if (options?.archive) {
        // Archive instead of delete
        session.archive();
        await this.sessionRepository.save(session);
        
        return {
          success: true,
          sessionId,
          messageCount,
          archiveAvailable: false // Already archived
        };
      } else {
        // Delete messages first
        await this.messageRepository.deleteBySessionId(sessionId);
        
        // Delete session
        await this.sessionRepository.delete(ChatId.fromString(sessionId));
        
        return {
          success: true,
          sessionId,
          messageCount,
          archiveAvailable: true
        };
      }
    } catch (error) {
      throw new SessionDeletionError(
        sessionId, 
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async updateSession(sessionId: string, updates: SessionUpdateData): Promise<ChatSession> {
    const sessionResult = await this.sessionRepository.findById(ChatId.fromString(sessionId));
    if (!sessionResult.success || !sessionResult.data) {
      throw new SessionNotFoundError(sessionId);
    }
    const session = sessionResult.data;

    try {
      // Apply updates
      if (updates.title !== undefined) {
        session.setTitle(updates.title);
      }
      
      if (updates.archived !== undefined) {
        if (updates.archived) {
          session.archive();
        } else {
          session.unarchive();
        }
      }

      if (updates.starred !== undefined) {
        if (updates.starred) {
          session.star();
        } else {
          session.unstar();
        }
      }

      if (updates.folderId !== undefined) {
        session.setFolderId(updates.folderId);
      }

      if (updates.tags !== undefined) {
        session.setTags(updates.tags);
      }

      if (updates.metadata !== undefined) {
        session.setMetadata(updates.metadata);
      }

      const saveResult = await this.sessionRepository.save(session);
      if (!saveResult.success || !saveResult.data) {
        throw new Error('Failed to save session');
      }
      return saveResult.data;
    } catch (error) {
      throw new SessionUpdateError(
        sessionId, 
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<ChatSession> {
    return await this.updateSession(sessionId, { title });
  }

  async searchSessions(options: SessionSearchOptions): Promise<PaginatedResult<ChatSession>> {
    if (!options.query?.trim()) {
      throw new InvalidSearchQueryError(options.query || '');
    }

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    try {
      // Perform search
      const filters: ChatSessionSearchFilters = {
        modelId: options.modelFilter?.[0], // Take first model if multiple provided
        createdAfter: options.dateRange?.start,
        createdBefore: options.dateRange?.end
      };
      
      const queryOptions: QueryOptions = {
        limit,
        offset,
        sort: {
          field: options.sortBy || 'updatedAt',
          direction: options.sortOrder || 'desc'
        }
      };
      
      const sessionsResult = await this.sessionRepository.search(
        options.query,
        filters,
        queryOptions
      );
      const sessions = sessionsResult.success && sessionsResult.data ? sessionsResult.data.items : [];

      const total = sessionsResult.success && sessionsResult.data ? sessionsResult.data.total : 0;
      const hasMore = sessionsResult.success && sessionsResult.data ? sessionsResult.data.hasMore : false;

      return {
        items: sessions,
        totalCount: total,
        hasMore,
        nextOffset: hasMore ? offset + limit : undefined,
        currentPage: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw new InvalidSearchQueryError(
        `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getSession(sessionId: string): Promise<ChatSession> {
    const sessionResult = await this.sessionRepository.findById(ChatId.fromString(sessionId));
    if (!sessionResult.success || !sessionResult.data) {
      throw new SessionNotFoundError(sessionId);
    }
    return sessionResult.data;
  }

  async archiveSession(sessionId: string, archived: boolean): Promise<ChatSession> {
    return await this.updateSession(sessionId, { archived });
  }

  async starSession(sessionId: string, starred: boolean): Promise<ChatSession> {
    return await this.updateSession(sessionId, { starred });
  }

  async moveToFolder(sessionId: string, folderId?: string): Promise<ChatSession> {
    return await this.updateSession(sessionId, { folderId });
  }

  async duplicateSession(sessionId: string, title?: string): Promise<ChatSession> {
    const originalSession = await this.getSession(sessionId);
    
    // Create new session with copied metadata
    const newSession = ChatSession.create({
      title: title || `Copy of ${originalSession.getTitle()}`,
      modelId: originalSession.getModelId(),
      folderId: originalSession.getFolderId(),
      tags: [...originalSession.getTags()],
      metadata: { ...originalSession.getMetadata() }
    });

    const saveResult = await this.sessionRepository.save(newSession);
    if (!saveResult.success || !saveResult.data) {
      throw new Error('Failed to save duplicated session');
    }
    return saveResult.data;
  }

  async getSessionStats(): Promise<SessionStats> {
    const totalSessionsResult = await this.sessionRepository.count();
    const totalSessions = totalSessionsResult.success && totalSessionsResult.data ? totalSessionsResult.data : 0;
    
    const activeSessionsResult = await this.sessionRepository.count({ archived: false });
    const activeSessions = activeSessionsResult.success && activeSessionsResult.data ? activeSessionsResult.data : 0;
    
    const archivedSessions = totalSessions - activeSessions;
    
    // Get message statistics
    const totalMessagesResult = await this.messageRepository.count();
    const totalMessages = totalMessagesResult.success && totalMessagesResult.data ? totalMessagesResult.data : 0;
    const averageMessagesPerSession = totalSessions > 0 ? totalMessages / totalSessions : 0;

    // Get sessions by model
    const sessionsByModelResult = await this.sessionRepository.getModelUsageStats();
    const sessionsByModel = sessionsByModelResult.success && sessionsByModelResult.data ? sessionsByModelResult.data : [];

    // Get recent session counts
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const sessionsThisWeekResult = await this.sessionRepository.countByDateRange(weekAgo, now);
    const sessionsThisWeek = sessionsThisWeekResult.success && sessionsThisWeekResult.data ? sessionsThisWeekResult.data : 0;
    
    const sessionsThisMonthResult = await this.sessionRepository.countByDateRange(monthAgo, now);
    const sessionsThisMonth = sessionsThisMonthResult.success && sessionsThisMonthResult.data ? sessionsThisMonthResult.data : 0;

    return {
      totalSessions,
      activeSessions,
      archivedSessions,
      totalMessages,
      averageMessagesPerSession,
      sessionsByModel,
      sessionsThisWeek,
      sessionsThisMonth
    };
  }

  async bulkDeleteSessions(sessionIds: string[]): Promise<SessionDeletionResult[]> {
    const results: SessionDeletionResult[] = [];

    for (const sessionId of sessionIds) {
      try {
        const result = await this.deleteSession(sessionId);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          sessionId,
          messageCount: 0,
          archiveAvailable: false
        });
      }
    }

    return results;
  }

  async bulkArchiveSessions(sessionIds: string[], archived: boolean): Promise<ChatSession[]> {
    const results: ChatSession[] = [];

    for (const sessionId of sessionIds) {
      try {
        const session = await this.archiveSession(sessionId, archived);
        results.push(session);
      } catch (error) {
        console.error(`Failed to ${archived ? 'archive' : 'unarchive'} session ${sessionId}:`, error);
        // Continue with other sessions
      }
    }

    return results;
  }

  async exportSession(sessionId: string, format: 'json' | 'markdown' | 'txt' = 'json'): Promise<SessionExport> {
    const session = await this.getSession(sessionId);
    const messagesResult = await this.messageRepository.findBySessionId(ChatId.fromString(sessionId));
    const messages = messagesResult.success && messagesResult.data ? messagesResult.data.items : [];

    let data: string | object;
    let filename: string;

    switch (format) {
      case 'json':
        data = {
          session: {
            id: session.getId(),
            title: session.getTitle(),
            modelId: session.getModelId(),
            createdAt: session.getCreatedAt(),
            updatedAt: session.getUpdatedAt(),
            metadata: session.getMetadata()
          },
          messages: messages.map((m: any) => ({
            id: m.getId(),
            role: m.getRole().getValue(),
            content: m.getContent(),
            timestamp: m.getTimestamp(),
            toolCalls: m.getToolCalls()?.map((tc: any) => tc.toJSON()) || []
          }))
        };
        filename = `session_${sessionId}_${Date.now()}.json`;
        break;

      case 'markdown':
        const markdownLines = [
          `# ${session.getTitle()}`,
          '',
          `**Model:** ${session.getModelId()}`,
          `**Created:** ${session.getCreatedAt().toISOString()}`,
          `**Updated:** ${session.getUpdatedAt().toISOString()}`,
          '',
          '---',
          ''
        ];

        for (const message of messages) {
          markdownLines.push(`## ${message.getRole().toString().toUpperCase()}`);
          markdownLines.push('');
          markdownLines.push(message.getContent().toString());
          markdownLines.push('');
          
          if (message.getToolCalls()?.length) {
            markdownLines.push('**Tool Calls:**');
            for (const toolCall of message.getToolCalls()) {
              markdownLines.push(`- ${toolCall.name}: ${JSON.stringify(toolCall.arguments)}`);
            }
            markdownLines.push('');
          }
        }

        data = markdownLines.join('\n');
        filename = `session_${sessionId}_${Date.now()}.md`;
        break;

      case 'txt':
        const textLines = [
          `${session.getTitle()}`,
          `Model: ${session.getModelId()}`,
          `Created: ${session.getCreatedAt().toISOString()}`,
          `Updated: ${session.getUpdatedAt().toISOString()}`,
          '',
          '---',
          ''
        ];

        for (const message of messages) {
          textLines.push(`[${message.getRole().toString().toUpperCase()}]`);
          textLines.push(message.getContent().toString());
          textLines.push('');
        }

        data = textLines.join('\n');
        filename = `session_${sessionId}_${Date.now()}.txt`;
        break;

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    return {
      format,
      data,
      filename,
      size: typeof data === 'string' ? data.length : JSON.stringify(data).length,
      exportedAt: new Date()
    };
  }

  async importSession(importData: SessionImport): Promise<ChatSession> {
    try {
      let sessionData: any;
      let messagesData: any[];

      // Parse import data based on format
      if (typeof importData.data === 'string') {
        switch (importData.format) {
          case 'json':
            const parsed = JSON.parse(importData.data);
            sessionData = parsed.session;
            messagesData = parsed.messages || [];
            break;
          case 'markdown':
          case 'txt':
            // For now, throw error - would need more complex parsing
            throw new Error(`Import from ${importData.format} format not yet implemented`);
          default:
            throw new Error(`Unsupported import format: ${importData.format}`);
        }
      } else {
        sessionData = (importData.data as any).session;
        messagesData = (importData.data as any).messages || [];
      }

      // Create new session
      const session = ChatSession.create({
        title: sessionData.title,
        modelId: sessionData.modelId,
        metadata: sessionData.metadata
      });

      const savedSessionResult = await this.sessionRepository.save(session);
      if (!savedSessionResult.success || !savedSessionResult.data) {
        throw new Error('Failed to save imported session');
      }

      // Import messages if present
      if (messagesData.length > 0) {
        // This would need to be implemented in a MessageService
        // For now, just return the session
        console.log(`Would import ${messagesData.length} messages`);
      }

      return savedSessionResult.data;
    } catch (error) {
      throw new Error(`Failed to import session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}