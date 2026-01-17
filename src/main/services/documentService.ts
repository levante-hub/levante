import { databaseService } from './databaseService';
import { getLogger } from './logging';
import type {
  Document,
  CreateDocumentInput,
  UpdateDocumentInput,
  GetDocumentsQuery,
  DocumentStatus
} from '../../types/database';

const logger = getLogger();

/**
 * DocumentService
 * Handles CRUD operations for documents in the RAG system
 */
export class DocumentService {
  /**
   * Create a new document record
   */
  async createDocument(input: CreateDocumentInput): Promise<Document> {
    try {
      const id = input.id || this.generateId();
      const now = Date.now();

      const document: Document = {
        id,
        filename: input.filename,
        filepath: input.filepath,
        file_type: input.file_type,
        file_size: input.file_size,
        status: input.status || 'processing',
        chunk_count: 0,
        error_message: null,
        uploaded_at: now,
        indexed_at: null
      };

      await databaseService.execute(
        `INSERT INTO documents (
          id, filename, filepath, file_type, file_size, status,
          chunk_count, error_message, uploaded_at, indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          document.id,
          document.filename,
          document.filepath,
          document.file_type,
          document.file_size,
          document.status,
          document.chunk_count,
          document.error_message ?? null,
          document.uploaded_at,
          document.indexed_at ?? null
        ]
      );

      logger.database.info('Document created', {
        documentId: document.id,
        filename: document.filename,
        fileType: document.file_type
      });

      return document;
    } catch (error) {
      logger.database.error('Failed to create document', {
        filename: input.filename,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Get a single document by ID
   */
  async getDocument(id: string): Promise<Document | null> {
    try {
      const result = await databaseService.execute(
        'SELECT * FROM documents WHERE id = ?',
        [id]
      );

      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0] as unknown as any;

      // Parse chunk_ids from JSON string to array
      const document: Document = {
        ...row,
        chunk_ids: row.chunk_ids ? JSON.parse(row.chunk_ids) : null
      };

      logger.database.debug('Document retrieved', {
        documentId: id,
        filename: document.filename
      });

      return document;
    } catch (error) {
      logger.database.error('Failed to get document', {
        documentId: id,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Get documents with optional filtering and pagination
   */
  async getDocuments(query?: GetDocumentsQuery): Promise<Document[]> {
    try {
      const limit = query?.limit || 50;
      const offset = query?.offset || 0;

      let sql = 'SELECT * FROM documents';
      const args: (string | number)[] = [];
      const whereClauses: string[] = [];

      // Add filters
      if (query?.status) {
        whereClauses.push('status = ?');
        args.push(query.status);
      }

      if (query?.file_type) {
        whereClauses.push('file_type = ?');
        args.push(query.file_type);
      }

      // Build query
      if (whereClauses.length > 0) {
        sql += ' WHERE ' + whereClauses.join(' AND ');
      }

      sql += ' ORDER BY uploaded_at DESC LIMIT ? OFFSET ?';
      args.push(limit, offset);

      const result = await databaseService.execute(sql, args);

      // Parse chunk_ids from JSON string to array for each document
      const documents = (result.rows || []).map((row: any) => ({
        ...row,
        chunk_ids: row.chunk_ids ? JSON.parse(row.chunk_ids) : null
      })) as Document[];

      logger.database.debug('Documents retrieved', {
        count: documents.length,
        filters: query
      });

      return documents;
    } catch (error) {
      logger.database.error('Failed to get documents', {
        query,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Update document fields
   */
  async updateDocument(id: string, updates: UpdateDocumentInput): Promise<void> {
    try {
      const updateFields: string[] = [];
      const args: (string | number | null)[] = [];

      if (updates.status !== undefined) {
        updateFields.push('status = ?');
        args.push(updates.status);
      }

      if (updates.chunk_count !== undefined) {
        updateFields.push('chunk_count = ?');
        args.push(updates.chunk_count);
      }

      if (updates.chunk_ids !== undefined) {
        updateFields.push('chunk_ids = ?');
        // Stringify array to JSON for storage
        args.push(updates.chunk_ids ? JSON.stringify(updates.chunk_ids) : null);
      }

      if (updates.error_message !== undefined) {
        updateFields.push('error_message = ?');
        args.push(updates.error_message);
      }

      if (updates.indexed_at !== undefined) {
        updateFields.push('indexed_at = ?');
        args.push(updates.indexed_at);
      }

      if (updateFields.length === 0) {
        logger.database.warn('No fields to update', { documentId: id });
        return;
      }

      args.push(id);

      await databaseService.execute(
        `UPDATE documents SET ${updateFields.join(', ')} WHERE id = ?`,
        args
      );

      logger.database.info('Document updated', {
        documentId: id,
        updates
      });
    } catch (error) {
      logger.database.error('Failed to update document', {
        documentId: id,
        updates,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Update document status
   * Convenience method for common status updates
   */
  async updateStatus(
    id: string,
    status: DocumentStatus,
    errorMessage?: string | null
  ): Promise<void> {
    const updates: UpdateDocumentInput = {
      id,
      status,
      error_message: errorMessage,
      indexed_at: status === 'indexed' ? Date.now() : undefined
    };

    await this.updateDocument(id, updates);
  }

  /**
   * Delete document from database
   */
  async deleteDocument(id: string): Promise<void> {
    try {
      await databaseService.execute(
        'DELETE FROM documents WHERE id = ?',
        [id]
      );

      logger.database.info('Document deleted', { documentId: id });
    } catch (error) {
      logger.database.error('Failed to delete document', {
        documentId: id,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Delete all documents from database
   */
  async deleteAllDocuments(): Promise<void> {
    try {
      await databaseService.execute('DELETE FROM documents');

      logger.database.info('All documents deleted from database');
    } catch (error) {
      logger.database.error('Failed to delete all documents', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Get document count by status
   */
  async getDocumentCount(status?: DocumentStatus): Promise<number> {
    try {
      let sql = 'SELECT COUNT(*) as count FROM documents';
      const args: string[] = [];

      if (status) {
        sql += ' WHERE status = ?';
        args.push(status);
      }

      const result = await databaseService.execute(sql, args);

      const count = result.rows && result.rows.length > 0
        ? (result.rows[0] as unknown as { count: number }).count
        : 0;

      return count;
    } catch (error) {
      logger.database.error('Failed to get document count', {
        status,
        error: error instanceof Error ? error.message : error
      });
      return 0;
    }
  }

  /**
   * Generate unique document ID
   */
  private generateId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Singleton instance
export const documentService = new DocumentService();
