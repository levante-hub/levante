import { Message } from '../../entities/Message';

export interface RepositoryResult<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface MessageRepositorySimple {
  save(message: Message): Promise<RepositoryResult<Message>>;
  findBySessionId(sessionId: string, options?: { limit?: number; offset?: number }): Promise<RepositoryResult<Message[]>>;
  searchInSession(sessionId: string, query: string): Promise<RepositoryResult<Message[]>>;
  deleteBySessionId(sessionId: string): Promise<RepositoryResult<boolean>>;
}