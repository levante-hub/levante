/**
 * Document IPC Handlers Module
 *
 * Handles all document-related IPC communication for RAG system:
 * - Document upload and processing (levante/documents/upload)
 * - Document listing with pagination (levante/documents/list)
 * - Document deletion (levante/documents/delete)
 * - Single document retrieval (levante/documents/get)
 * - Knowledge base querying (levante/documents/query)
 * - Document statistics (levante/documents/stats)
 */

import { ipcMain, IpcMainInvokeEvent, dialog } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogger } from '../services/logging';
import { documentService } from '../services/documentService';
import { directoryService } from '../services/directoryService';
import { DocumentProcessor } from '../services/rag/documentProcessor';
import type {
  Document,
  CreateDocumentInput,
  GetDocumentsQuery
} from '../../types/database';

const logger = getLogger();

/**
 * Upload request interface
 */
interface UploadDocumentRequest {
  filePath: string;
  filename: string;
}

/**
 * Query request interface
 */
interface QueryKnowledgeRequest {
  query: string;
  topK?: number;
}

/**
 * Register all document-related IPC handlers
 */
/**
 * Handle file picker dialog
 * Opens native Electron file dialog and returns selected file path
 */
async function handlePickFile(
  _event: IpcMainInvokeEvent
): Promise<{ success: boolean; filePath?: string; filename?: string; error?: string }> {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Documents',
          extensions: ['pdf', 'docx', 'txt', 'md', 'json']
        }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return {
        success: false,
        error: 'File selection canceled'
      };
    }

    const filePath = result.filePaths[0];
    const filename = path.basename(filePath);

    return {
      success: true,
      filePath,
      filename
    };
  } catch (error) {
    logger.rag.error('Failed to open file picker', {
      error: error instanceof Error ? error.message : error
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to open file picker'
    };
  }
}

export function setupDocumentHandlers(): void {
  ipcMain.handle('levante/documents/upload', handleUploadDocument);
  ipcMain.handle('levante/documents/list', handleListDocuments);
  ipcMain.handle('levante/documents/delete', handleDeleteDocument);
  ipcMain.handle('levante/documents/deleteAll', handleDeleteAllDocuments);
  ipcMain.handle('levante/documents/get', handleGetDocument);
  ipcMain.handle('levante/documents/query', handleQueryKnowledge);
  ipcMain.handle('levante/documents/stats', handleGetStats);
  ipcMain.handle('levante/documents/pickFile', handlePickFile);

  logger.rag.info('Document handlers registered successfully');
}

/**
 * Handle document upload
 * 1. Validate file (size, type)
 * 2. Copy to ~/levante/documents/{id}/
 * 3. Create database entry
 * 4. Trigger background ingestion
 */
async function handleUploadDocument(
  event: IpcMainInvokeEvent,
  request: UploadDocumentRequest
): Promise<{ success: boolean; document?: Document; error?: string }> {
  try {
    logger.rag.info('Document upload request received', {
      filename: request.filename,
      sourcePath: request.filePath
    });

    // Validate file type
    const fileType = DocumentProcessor.getFileType(request.filename);
    if (!fileType) {
      return {
        success: false,
        error: `Unsupported file type: ${path.extname(request.filename)}`
      };
    }

    // Validate file size (100MB limit)
    const isValid = await DocumentProcessor.validateFile(request.filePath);
    if (!isValid) {
      return {
        success: false,
        error: 'File exceeds maximum size limit (100MB)'
      };
    }

    // Get file stats for metadata
    const stats = await fs.stat(request.filePath);

    // Generate document ID
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Create document directory
    const documentsPath = directoryService.getDocumentsPath();
    await directoryService.ensureSubdir('documents');
    const documentDir = path.join(documentsPath, documentId);
    await fs.mkdir(documentDir, { recursive: true });

    // Copy file to document directory
    const destinationPath = path.join(documentDir, request.filename);
    await fs.copyFile(request.filePath, destinationPath);

    logger.rag.info('File copied to documents directory', {
      documentId,
      destinationPath
    });

    // Create document record in database
    const input: CreateDocumentInput = {
      id: documentId,
      filename: request.filename,
      filepath: destinationPath,
      file_type: fileType,
      file_size: stats.size,
      status: 'processing'
    };

    const document = await documentService.createDocument(input);

    logger.rag.info('Document record created', {
      documentId: document.id,
      filename: document.filename
    });

    // Trigger background ingestion (async, don't wait)
    setImmediate(async () => {
      try {
        logger.rag.info('Starting document ingestion', {
          documentId,
          filename: request.filename
        });

        // Dynamic import to avoid circular dependencies
        const { ragService } = await import('../services/ragService');

        // Ensure RAG service is initialized
        if (!ragService.isReady()) {
          await ragService.initialize();
        }

        // Ingest document into LanceDB
        const { chunkCount, chunkIds } = await ragService.ingestDocument(
          destinationPath,
          documentId,
          request.filename
        );

        // Update document status to indexed
        await documentService.updateStatus(documentId, 'indexed');
        await documentService.updateDocument(documentId, {
          id: documentId,
          chunk_count: chunkCount,
          chunk_ids: chunkIds
        });

        logger.rag.info('Document ingestion completed successfully', {
          documentId,
          chunkCount
        });

        // Notify renderer of status update
        event.sender.send('levante/documents/status-update', {
          documentId,
          status: 'indexed',
          chunk_count: chunkCount
        });
      } catch (error) {
        logger.rag.error('Document ingestion failed', {
          documentId,
          error: error instanceof Error ? error.message : error
        });

        // Update document status to failed
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await documentService.updateStatus(documentId, 'failed', errorMessage);

        // Notify renderer of failure
        event.sender.send('levante/documents/status-update', {
          documentId,
          status: 'failed',
          error_message: errorMessage
        });
      }
    });

    return {
      success: true,
      document
    };
  } catch (error) {
    logger.rag.error('Document upload failed', {
      filename: request.filename,
      error: error instanceof Error ? error.message : error
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload document'
    };
  }
}

/**
 * Handle list documents request
 * Returns paginated list of documents with optional filtering
 */
async function handleListDocuments(
  _event: IpcMainInvokeEvent,
  query?: GetDocumentsQuery
): Promise<{ success: boolean; documents?: Document[]; error?: string }> {
  try {
    logger.rag.debug('List documents request received', { query });

    const documents = await documentService.getDocuments(query);

    logger.rag.debug('Documents retrieved', {
      count: documents.length
    });

    return {
      success: true,
      documents
    };
  } catch (error) {
    logger.rag.error('Failed to list documents', {
      error: error instanceof Error ? error.message : error
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list documents'
    };
  }
}

/**
 * Handle delete document request
 * Removes document from database, ChromaDB, and filesystem
 */
async function handleDeleteDocument(
  _event: IpcMainInvokeEvent,
  documentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.rag.info('Delete document request received', { documentId });

    // Dynamic import to avoid circular dependencies
    const { ragService } = await import('../services/ragService');

    // Get document metadata
    const document = await documentService.getDocument(documentId);
    if (!document) {
      return {
        success: false,
        error: 'Document not found'
      };
    }

    // Delete from LanceDB (if indexed and has chunk IDs)
    if (document.status === 'indexed' && document.chunk_ids && document.chunk_ids.length > 0 && ragService.isReady()) {
      try {
        await ragService.deleteDocument(document.chunk_ids);
        logger.rag.info('Document chunks removed from LanceDB', {
          documentId,
          chunkCount: document.chunk_ids.length
        });
      } catch (error) {
        logger.rag.warn('Failed to remove document chunks from LanceDB', {
          documentId,
          error: error instanceof Error ? error.message : error
        });
        // Continue with deletion even if LanceDB fails
      }
    }

    // Delete from filesystem
    const documentDir = path.dirname(document.filepath);
    try {
      await fs.rm(documentDir, { recursive: true, force: true });
      logger.rag.info('Document directory removed', {
        documentId,
        path: documentDir
      });
    } catch (error) {
      logger.rag.warn('Failed to remove document directory', {
        documentId,
        path: documentDir,
        error: error instanceof Error ? error.message : error
      });
      // Continue with deletion even if filesystem fails
    }

    // Delete from database
    await documentService.deleteDocument(documentId);

    logger.rag.info('Document deleted successfully', { documentId });

    return { success: true };
  } catch (error) {
    logger.rag.error('Failed to delete document', {
      documentId,
      error: error instanceof Error ? error.message : error
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete document'
    };
  }
}

/**
 * Handle get document request
 * Returns single document metadata
 */
async function handleGetDocument(
  _event: IpcMainInvokeEvent,
  documentId: string
): Promise<{ success: boolean; document?: Document | null; error?: string }> {
  try {
    logger.rag.debug('Get document request received', { documentId });

    const document = await documentService.getDocument(documentId);

    return {
      success: true,
      document
    };
  } catch (error) {
    logger.rag.error('Failed to get document', {
      documentId,
      error: error instanceof Error ? error.message : error
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get document'
    };
  }
}

/**
 * Handle query knowledge base request
 * Used by RAG tool during chat
 */
async function handleQueryKnowledge(
  _event: IpcMainInvokeEvent,
  request: QueryKnowledgeRequest
): Promise<{ success: boolean; results?: string[]; error?: string }> {
  try {
    logger.rag.debug('Query knowledge request received', {
      query: request.query.substring(0, 100),
      topK: request.topK
    });

    // Dynamic import to avoid circular dependencies
    const { ragService } = await import('../services/ragService');

    // Ensure RAG service is initialized
    if (!ragService.isReady()) {
      await ragService.initialize();
    }

    const results = await ragService.queryKnowledge(
      request.query,
      request.topK || 5
    );

    logger.rag.debug('Knowledge query completed', {
      resultCount: results.length
    });

    return {
      success: true,
      results
    };
  } catch (error) {
    logger.rag.error('Knowledge query failed', {
      query: request.query.substring(0, 100),
      error: error instanceof Error ? error.message : error
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to query knowledge base'
    };
  }
}

/**
 * Handle delete all documents request
 * Removes all documents from database, LanceDB, and filesystem
 */
async function handleDeleteAllDocuments(
  _event: IpcMainInvokeEvent
): Promise<{ success: boolean; error?: string }> {
  try {
    logger.rag.info('Delete all documents request received');

    // Dynamic import to avoid circular dependencies
    const { ragService } = await import('../services/ragService');

    // Get all documents
    const documents = await documentService.getDocuments();

    if (documents.length === 0) {
      logger.rag.info('No documents to delete');
      return { success: true };
    }

    // Delete from LanceDB (clear all chunks)
    if (ragService.isReady()) {
      try {
        await ragService.clearAllDocuments();
        logger.rag.info('All documents removed from LanceDB');
      } catch (error) {
        logger.rag.warn('Failed to clear LanceDB', {
          error: error instanceof Error ? error.message : error
        });
        // Continue with deletion even if LanceDB fails
      }
    }

    // Delete from filesystem
    for (const document of documents) {
      const documentDir = path.dirname(document.filepath);
      try {
        await fs.rm(documentDir, { recursive: true, force: true });
        logger.rag.info('Document directory removed', {
          documentId: document.id,
          path: documentDir
        });
      } catch (error) {
        logger.rag.warn('Failed to remove document directory', {
          documentId: document.id,
          path: documentDir,
          error: error instanceof Error ? error.message : error
        });
        // Continue with deletion even if filesystem fails
      }
    }

    // Delete all from database
    await documentService.deleteAllDocuments();

    logger.rag.info('All documents deleted successfully', {
      count: documents.length
    });

    return { success: true };
  } catch (error) {
    logger.rag.error('Failed to delete all documents', {
      error: error instanceof Error ? error.message : error
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete all documents'
    };
  }
}

/**
 * Handle get stats request
 * Returns document and chunk statistics
 */
async function handleGetStats(
  _event: IpcMainInvokeEvent
): Promise<{
  success: boolean;
  stats?: {
    totalDocuments: number;
    processingDocuments: number;
    indexedDocuments: number;
    failedDocuments: number;
    totalChunks: number;
  };
  error?: string;
}> {
  try {
    logger.rag.debug('Get stats request received');

    // Dynamic import to avoid circular dependencies
    const { ragService } = await import('../services/ragService');

    const [total, processing, indexed, failed] = await Promise.all([
      documentService.getDocumentCount(),
      documentService.getDocumentCount('processing'),
      documentService.getDocumentCount('indexed'),
      documentService.getDocumentCount('failed')
    ]);

    // Get total chunks from RAG service
    let totalChunks = 0;
    if (ragService.isReady()) {
      const ragStats = await ragService.getStats();
      totalChunks = ragStats.totalChunks;
    }

    const stats = {
      totalDocuments: total,
      processingDocuments: processing,
      indexedDocuments: indexed,
      failedDocuments: failed,
      totalChunks
    };

    logger.rag.debug('Stats retrieved', stats);

    return {
      success: true,
      stats
    };
  } catch (error) {
    logger.rag.error('Failed to get stats', {
      error: error instanceof Error ? error.message : error
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stats'
    };
  }
}
