import { ipcRenderer } from 'electron';
import type { Document, GetDocumentsQuery } from '../../types/database';

/**
 * Upload document request
 */
export interface UploadDocumentRequest {
  filePath: string;
  filename: string;
}

/**
 * Query knowledge base request
 */
export interface QueryKnowledgeRequest {
  query: string;
  topK?: number;
}

/**
 * Document statistics
 */
export interface DocumentStats {
  totalDocuments: number;
  processingDocuments: number;
  indexedDocuments: number;
  failedDocuments: number;
  totalChunks: number;
}

/**
 * Document status update event
 */
export interface DocumentStatusUpdate {
  documentId: string;
  status: 'processing' | 'indexed' | 'failed';
  chunk_count?: number;
  error_message?: string;
}

/**
 * Documents API for preload
 */
export const documentsApi = {
  /**
   * Upload a document for RAG indexing
   */
  upload: (request: UploadDocumentRequest): Promise<{
    success: boolean;
    document?: Document;
    error?: string;
  }> => ipcRenderer.invoke('levante/documents/upload', request),

  /**
   * List documents with optional filtering
   */
  list: (query?: GetDocumentsQuery): Promise<{
    success: boolean;
    documents?: Document[];
    error?: string;
  }> => ipcRenderer.invoke('levante/documents/list', query),

  /**
   * Delete a document
   */
  delete: (documentId: string): Promise<{
    success: boolean;
    error?: string;
  }> => ipcRenderer.invoke('levante/documents/delete', documentId),

  /**
   * Delete all documents
   */
  deleteAll: (): Promise<{
    success: boolean;
    error?: string;
  }> => ipcRenderer.invoke('levante/documents/deleteAll'),

  /**
   * Get a single document by ID
   */
  get: (documentId: string): Promise<{
    success: boolean;
    document?: Document | null;
    error?: string;
  }> => ipcRenderer.invoke('levante/documents/get', documentId),

  /**
   * Query knowledge base (used by RAG tool)
   */
  query: (request: QueryKnowledgeRequest): Promise<{
    success: boolean;
    results?: string[];
    error?: string;
  }> => ipcRenderer.invoke('levante/documents/query', request),

  /**
   * Get document statistics
   */
  getStats: (): Promise<{
    success: boolean;
    stats?: DocumentStats;
    error?: string;
  }> => ipcRenderer.invoke('levante/documents/stats'),

  /**
   * Open native file picker dialog
   */
  pickFile: (): Promise<{
    success: boolean;
    filePath?: string;
    filename?: string;
    error?: string;
  }> => ipcRenderer.invoke('levante/documents/pickFile'),

  /**
   * Listen for document status updates
   */
  onStatusUpdate: (callback: (update: DocumentStatusUpdate) => void) => {
    const handler = (_event: any, update: DocumentStatusUpdate) => {
      callback(update);
    };
    ipcRenderer.on('levante/documents/status-update', handler);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('levante/documents/status-update', handler);
    };
  },
};
