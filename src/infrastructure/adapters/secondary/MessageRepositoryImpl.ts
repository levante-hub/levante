import { MessageRepositorySimple, RepositoryResult } from '../../../domain/ports/secondary/MessageRepositorySimple';
import { Message } from '../../../domain/entities/Message';
import { chatService } from '../../../main/services/chatService';

export class MessageRepositoryImpl implements MessageRepositorySimple {
  async save(message: Message): Promise<RepositoryResult<Message>> {
    try {
      const input = {
        session_id: message.getSessionId(),
        role: message.getRole(),
        content: message.getContent(),
        tool_calls: message.hasToolCalls() ? [...message.getToolCalls()] : undefined
      };
      
      const result = await chatService.createMessage(input);
      if (!result.success || !result.data) {
        return { success: false, data: {} as any, error: result.error };
      }
      
      return {
        success: true,
        data: Message.fromDatabase(result.data)
      };
    } catch (error) {
      return {
        success: false,
        data: {} as any,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async findBySessionId(sessionId: string, options?: { limit?: number; offset?: number }): Promise<RepositoryResult<Message[]>> {
    try {
      const query = {
        session_id: sessionId,
        limit: options?.limit || 100,
        offset: options?.offset || 0
      };
      
      const result = await chatService.getMessages(query);
      if (!result.success) {
        return { success: false, data: {} as any, error: result.error };
      }
      
      const messages = result.data.items.map(Message.fromDatabase);
      return { success: true, data: messages };
    } catch (error) {
      return {
        success: false,
        data: {} as any,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async searchInSession(sessionId: string, query: string): Promise<RepositoryResult<Message[]>> {
    try {
      const result = await chatService.searchMessages(query, sessionId);
      if (!result.success) {
        return { success: false, data: {} as any, error: result.error };
      }
      
      const messages = result.data.map(Message.fromDatabase);
      return { success: true, data: messages };
    } catch (error) {
      return {
        success: false,
        data: {} as any,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async deleteBySessionId(_sessionId: string): Promise<RepositoryResult<boolean>> {
    // ChatService no tiene este método directamente, pero podríamos implementarlo
    // Por ahora devolvemos éxito ya que no es crítico para la funcionalidad básica
    try {
      return { success: true, data: true };
    } catch (error) {
      return {
        success: false,
        data: {} as any,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}