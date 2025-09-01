import { ChatSession } from '../../entities/ChatSession';

export interface RepositoryResult<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface ChatSessionRepositorySimple {
  save(session: ChatSession): Promise<RepositoryResult<ChatSession>>;
  findById(id: string): Promise<RepositoryResult<ChatSession | null>>;
  findAll(): Promise<RepositoryResult<ChatSession[]>>;
  update(session: ChatSession): Promise<RepositoryResult<ChatSession>>;
  delete(id: string): Promise<RepositoryResult<boolean>>;
  findByModelId(modelId: string): Promise<RepositoryResult<ChatSession[]>>;
}