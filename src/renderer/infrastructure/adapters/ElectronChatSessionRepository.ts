import { ChatSessionRepository } from '../../../domain/ports/secondary/ChatSessionRepository';
import { ChatSession } from '../../../domain/entities/ChatSession';
import { ChatId } from '../../../domain/value-objects/ChatId';

export class ElectronChatSessionRepository implements ChatSessionRepository {
  
  async save(chatSession: ChatSession): Promise<ChatSession> {
    const result = await window.levante.hexagonal.chatSessions.update(
      chatSession.getId(),
      {
        title: chatSession.getTitle(),
        modelId: chatSession.getModelId(),
        metadata: chatSession.getMetadata()
      }
    );
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to save chat session');
    }
    
    return this.mapToChatSession(result.data);
  }

  async findById(id: string): Promise<ChatSession | null> {
    const result = await window.levante.hexagonal.chatSessions.findById(id);
    
    if (!result.success) {
      if (result.error?.includes('not found')) {
        return null;
      }
      throw new Error(result.error || 'Failed to find chat session');
    }
    
    return result.data ? this.mapToChatSession(result.data) : null;
  }

  async findAll(options?: {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC';
  }): Promise<ChatSession[]> {
    const result = await window.levante.hexagonal.chatSessions.findAll(options);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to find chat sessions');
    }
    
    return (result.data || []).map(data => this.mapToChatSession(data));
  }

  async delete(id: string): Promise<boolean> {
    const result = await window.levante.hexagonal.chatSessions.delete(id);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to delete chat session');
    }
    
    return result.data || false;
  }

  async searchByTitle(query: string, options?: {
    limit?: number;
    offset?: number;
  }): Promise<ChatSession[]> {
    const result = await window.levante.hexagonal.chatSessions.search(query, options);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to search chat sessions');
    }
    
    return (result.data || []).map(data => this.mapToChatSession(data));
  }

  async create(title: string, modelId?: string, metadata?: Record<string, any>): Promise<ChatSession> {
    const result = await window.levante.hexagonal.chatSessions.create(title, modelId, metadata);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to create chat session');
    }
    
    return this.mapToChatSession(result.data);
  }

  async exportSessions(sessionIds?: string[]): Promise<any> {
    const result = await window.levante.hexagonal.chatSessions.export();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to export sessions');
    }
    
    return result.data;
  }

  async importSessions(data: any): Promise<ChatSession[]> {
    const result = await window.levante.hexagonal.chatSessions.import(data);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to import sessions');
    }
    
    return (result.data || []).map(data => this.mapToChatSession(data));
  }

  private mapToChatSession(data: any): ChatSession {
    return ChatSession.create({
      id: new ChatId(data.id),
      title: data.title,
      modelId: data.modelId,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      metadata: data.metadata || {}
    });
  }
}