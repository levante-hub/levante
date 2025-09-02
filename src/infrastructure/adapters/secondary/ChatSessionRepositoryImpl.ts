import { ChatSessionRepositorySimple, RepositoryResult } from '../../../domain/ports/secondary/ChatSessionRepositorySimple';
import { ChatSession } from '../../../domain/entities/ChatSession';
import { chatService } from '../../../main/services/chatService';

export class ChatSessionRepositoryImpl implements ChatSessionRepositorySimple {
  async save(session: ChatSession): Promise<RepositoryResult<ChatSession>> {
    try {
      const input = {
        title: session.getTitle(),
        model: session.getModelId(),
        folder_id: session.getFolderId()
      };
      
      const result = await chatService.createSession(input);
      if (!result.success || !result.data) {
        return { success: false, data: {} as any, error: result.error };
      }
      
      return { 
        success: true, 
        data: ChatSession.fromDatabase(result.data) 
      };
    } catch (error) {
      return {
        success: false,
        data: {} as any,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async findById(id: string): Promise<RepositoryResult<ChatSession | null>> {
    try {
      const result = await chatService.getSession(id);
      if (!result.success) {
        return { success: false, data: {} as any, error: result.error };
      }
      
      return {
        success: true,
        data: result.data ? ChatSession.fromDatabase(result.data) : null
      };
    } catch (error) {
      return {
        success: false,
        data: {} as any,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async findAll(): Promise<RepositoryResult<ChatSession[]>> {
    try {
      const result = await chatService.getSessions();
      if (!result.success) {
        return { success: false, data: {} as any, error: result.error };
      }
      
      const sessions = result.data.items.map(ChatSession.fromDatabase);
      return { success: true, data: sessions };
    } catch (error) {
      return {
        success: false,
        data: {} as any,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async update(session: ChatSession): Promise<RepositoryResult<ChatSession>> {
    try {
      const input = {
        id: session.getId(),
        title: session.getTitle(),
        updated_at: Date.now()
      };
      
      const result = await chatService.updateSession(input);
      if (!result.success || !result.data) {
        return { success: false, data: {} as any, error: result.error };
      }
      
      return { 
        success: true, 
        data: ChatSession.fromDatabase(result.data) 
      };
    } catch (error) {
      return {
        success: false,
        data: {} as any,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async delete(id: string): Promise<RepositoryResult<boolean>> {
    try {
      const result = await chatService.deleteSession(id);
      return { 
        success: result.success, 
        data: result.data,
        error: result.error 
      };
    } catch (error) {
      return {
        success: false,
        data: {} as any,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async findByModelId(modelId: string): Promise<RepositoryResult<ChatSession[]>> {
    try {
      const result = await chatService.getSessions();
      if (!result.success) {
        return { success: false, data: {} as any, error: result.error };
      }
      
      const filteredSessions = result.data.items
        .filter(session => session.model === modelId)
        .map(ChatSession.fromDatabase);
      
      return { success: true, data: filteredSessions };
    } catch (error) {
      return {
        success: false,
        data: {} as any,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

}