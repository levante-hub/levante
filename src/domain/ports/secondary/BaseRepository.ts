export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

export interface SearchOptions {
  query?: string;
  filters?: Record<string, any>;
}

export interface QueryOptions extends PaginationOptions {
  sort?: SortOptions;
  search?: SearchOptions;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface RepositoryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface BaseRepository<T, TId> {
  /**
   * Find an entity by its unique identifier
   */
  findById(id: TId): Promise<RepositoryResult<T | null>>;

  /**
   * Find multiple entities with optional query parameters
   */
  findMany(options?: QueryOptions): Promise<RepositoryResult<PaginatedResult<T>>>;

  /**
   * Save a new entity or update an existing one
   */
  save(entity: T): Promise<RepositoryResult<T>>;

  /**
   * Delete an entity by its unique identifier
   */
  delete(id: TId): Promise<RepositoryResult<boolean>>;

  /**
   * Check if an entity exists by its unique identifier
   */
  exists(id: TId): Promise<RepositoryResult<boolean>>;

  /**
   * Count total entities with optional filters
   */
  count(filters?: Record<string, any>): Promise<RepositoryResult<number>>;
}

export interface TransactionalRepository {
  /**
   * Execute operations within a transaction
   */
  executeInTransaction<T>(operation: () => Promise<T>): Promise<RepositoryResult<T>>;
}

export abstract class BaseRepositoryError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class EntityNotFoundError extends BaseRepositoryError {
  constructor(entityName: string, id: string) {
    super(`${entityName} with ID '${id}' not found`, 'ENTITY_NOT_FOUND');
  }
}

export class DuplicateEntityError extends BaseRepositoryError {
  constructor(entityName: string, field: string, value: string) {
    super(`${entityName} with ${field} '${value}' already exists`, 'DUPLICATE_ENTITY');
  }
}

export class InvalidEntityError extends BaseRepositoryError {
  constructor(entityName: string, reason: string) {
    super(`Invalid ${entityName}: ${reason}`, 'INVALID_ENTITY');
  }
}

export class RepositoryConnectionError extends BaseRepositoryError {
  constructor(message: string) {
    super(`Repository connection error: ${message}`, 'CONNECTION_ERROR');
  }
}

export class TransactionError extends BaseRepositoryError {
  constructor(message: string) {
    super(`Transaction error: ${message}`, 'TRANSACTION_ERROR');
  }
}