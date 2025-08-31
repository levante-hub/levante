import { RepositoryResult } from '../../domain/ports/secondary/BaseRepository';

/**
 * Utility functions for handling RepositoryResult types
 */
export class RepositoryUtils {
  /**
   * Extract data from RepositoryResult or throw error
   */
  static unwrap<T>(result: RepositoryResult<T>): T {
    if (!result.success) {
      throw new Error(result.error || 'Repository operation failed');
    }
    if (result.data === undefined) {
      throw new Error('Repository result data is undefined');
    }
    return result.data;
  }

  /**
   * Extract data from RepositoryResult or return null
   */
  static unwrapOrNull<T>(result: RepositoryResult<T | null>): T | null {
    if (!result.success) {
      return null;
    }
    return result.data ?? null;
  }

  /**
   * Extract data from RepositoryResult or return empty array
   */
  static unwrapOrEmpty<T>(result: RepositoryResult<T[]>): T[] {
    if (!result.success) {
      return [];
    }
    return result.data ?? [];
  }

  /**
   * Extract data from RepositoryResult or return default value
   */
  static unwrapOrDefault<T>(result: RepositoryResult<T>, defaultValue: T): T {
    if (!result.success) {
      return defaultValue;
    }
    return result.data ?? defaultValue;
  }

  /**
   * Check if repository operation was successful
   */
  static isSuccess<T>(result: RepositoryResult<T>): result is RepositoryResult<T> & { success: true } {
    return result.success;
  }

  /**
   * Check if repository operation failed
   */
  static isError<T>(result: RepositoryResult<T>): result is RepositoryResult<T> & { success: false } {
    return !result.success;
  }
}