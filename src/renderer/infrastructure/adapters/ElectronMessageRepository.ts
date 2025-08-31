import { MessageRepository } from '../../../domain/ports/secondary/MessageRepository';
import { Message } from '../../../domain/entities/Message';
import { MessageId } from '../../../domain/value-objects/MessageId';
import { MessageContent } from '../../../domain/value-objects/MessageContent';
import { RepositoryResult, QueryOptions } from '../../../domain/ports/secondary/BaseRepository';
import { ChatId } from '../../../domain/value-objects/ChatId';

export class ElectronMessageRepository implements MessageRepository {
  
  async save(message: Message): Promise<RepositoryResult<Message>> {
    const result = await window.levante.db.messages.create({
      session_id: message.getId(), // Using available method
      role: message.getRole().toString(),
      content: message.getContent().toString(),
      timestamp: message.getTimestamp(),
      metadata: {} // Default metadata
    });
    
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to save message',
        data: message
      };
    }
    
    return {
      success: true,
      data: this.mapToMessage(result.data)
    };
  }

  async findById(id: MessageId): Promise<RepositoryResult<Message | null>> {
    // Note: Current DB API doesn't have findById for messages
    // This would need to be added to the IPC handlers
    return {
      success: false,
      error: 'findById not implemented for messages in current IPC API',
      data: null
    };
  }

  async findAll(): Promise<Message[]> {
    // Note: Current DB API doesn't have findAll for messages without session
    // This would need to be added to the IPC handlers
    throw new Error('findAll not implemented for messages in current IPC API');
  }

  async delete(id: MessageId): Promise<RepositoryResult<boolean>> {
    // Note: Current DB API doesn't have delete for individual messages
    // This would need to be added to the IPC handlers
    return {
      success: false,
      error: 'delete not implemented for messages in current IPC API',
      data: false
    };
  }

  async findBySessionId(sessionId: string, options?: {
    limit?: number;
    offset?: number;
    includeSystemMessages?: boolean;
  }): Promise<RepositoryResult<Message[]>>;
  async findBySessionId(sessionId: ChatId, options?: QueryOptions): Promise<RepositoryResult<any>>;
  async findBySessionId(sessionId: string | ChatId, options?: any): Promise<RepositoryResult<Message[]>> {
    const sessionIdStr = typeof sessionId === 'string' ? sessionId : sessionId.toString();
    const result = await window.levante.db.messages.list({
      session_id: sessionIdStr,
      limit: options?.limit,
      offset: options?.offset,
      orderBy: options?.orderBy,
      orderDirection: options?.orderDirection
    });
    
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to find messages by session ID',
        data: []
      };
    }
    
    const messages = (result.data?.items || []).map(data => this.mapToMessage(data));
    return {
      success: true,
      data: messages
    };
  }

  async countBySessionId(sessionId: string): Promise<RepositoryResult<number>> {
    const result = await window.levante.db.messages.list({
      session_id: sessionId,
      limit: 0 // Just get count
    });
    
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to count messages by session ID',
        data: 0
      };
    }
    
    return {
      success: true,
      data: result.data?.totalCount || 0
    };
  }

  async deleteBySessionId(sessionId: string): Promise<boolean> {
    // Note: Current DB API doesn't have deleteBySessionId for messages
    // This would need to be added to the IPC handlers
    throw new Error('deleteBySessionId not implemented for messages in current IPC API');
  }


  async findBeforeMessage(sessionId: string, messageId: MessageId, limit: number): Promise<Message[]> {
    // This would require a specialized IPC handler
    throw new Error('findBeforeMessage not implemented in current IPC API');
  }

  async findAfterMessage(sessionId: string, messageId: MessageId, limit: number): Promise<Message[]> {
    // This would require a specialized IPC handler
    throw new Error('findAfterMessage not implemented in current IPC API');
  }

  async searchInSession(sessionId: string, query: string, options?: {
    limit?: number;
    offset?: number;
  }): Promise<Message[]> {
    const result = await window.levante.db.messages.search(query, sessionId, options?.limit);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to search messages in session');
    }
    
    return (result.data || []).map(data => this.mapToMessage(data));
  }

  async searchGlobal(query: string, options?: {
    limit?: number;
    offset?: number;
  }): Promise<Message[]> {
    const result = await window.levante.db.messages.search(query, undefined, options?.limit);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to search messages globally');
    }
    
    return (result.data || []).map(data => this.mapToMessage(data));
  }

  // BaseRepository interface methods
  async findMany(options?: QueryOptions): Promise<RepositoryResult<any>> {
    return {
      success: false,
      error: 'findMany not implemented for messages in current IPC API',
      data: { items: [], total: 0, limit: 20, offset: 0, hasMore: false }
    };
  }

  async exists(id: MessageId): Promise<RepositoryResult<boolean>> {
    return {
      success: false,
      error: 'exists not implemented for messages in current IPC API',
      data: false
    };
  }

  async count(filters?: Record<string, any>): Promise<RepositoryResult<number>> {
    return {
      success: false,
      error: 'count not implemented for messages in current IPC API',
      data: 0
    };
  }

  private mapToMessage(data: any): Message {
    return Message.create({
      id: new MessageId(data.id),
      sessionId: data.sessionId,
      role: data.role,
      content: new MessageContent(data.content),
      timestamp: new Date(data.timestamp),
      metadata: data.metadata || {}
    });
  }
}