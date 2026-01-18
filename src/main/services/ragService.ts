import * as lancedb from '@lancedb/lancedb';
import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import { directoryService } from './directoryService';
import { DocumentProcessor, type DocumentChunk } from './rag/documentProcessor';
import { getLogger } from './logging';

const logger = getLogger();

const DEFAULT_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const TABLE_NAME = 'levante_knowledge';
const DEFAULT_TOP_K = 5;

/**
 * RAGService
 * Core service for Retrieval-Augmented Generation
 * Handles document ingestion, embedding generation, and knowledge retrieval
 */
export class RAGService {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private embedder: FeatureExtractionPipeline | null = null;
  private vectorDbPath: string;
  private isInitialized = false;

  constructor() {
    this.vectorDbPath = directoryService.getSubdirPath('lancedb');
  }

  /**
   * Initialize RAG service with LanceDB and HuggingFace embeddings
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.rag.debug('RAG service already initialized');
      return;
    }

    try {
      logger.rag.info('Initializing RAG service...', {
        vectorDbPath: this.vectorDbPath
      });

      // Ensure LanceDB directory exists
      await directoryService.ensureSubdir('lancedb');

      // Initialize LanceDB connection
      this.db = await lancedb.connect(this.vectorDbPath);

      logger.rag.info('LanceDB connection initialized', {
        path: this.vectorDbPath
      });

      // Initialize HuggingFace embedder
      logger.rag.info('Loading embedding model...', {
        model: DEFAULT_EMBEDDING_MODEL,
        note: 'First-time download may take several minutes (~100MB)'
      });

      try {
        this.embedder = await pipeline(
          'feature-extraction',
          DEFAULT_EMBEDDING_MODEL
        );

        logger.rag.info('Embedding model loaded successfully', {
          model: DEFAULT_EMBEDDING_MODEL
        });
      } catch (error) {
        logger.rag.error('Failed to load embedding model', {
          model: DEFAULT_EMBEDDING_MODEL,
          error: error instanceof Error ? error.message : error,
          possibleCauses: [
            'No internet connection',
            'Insufficient disk space',
            'Model download interrupted',
            'Hugging Face CDN unavailable'
          ]
        });
        throw new Error(`Failed to load embedding model: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Create or open table
      try {
        const tableNames = await this.db.tableNames();

        if (tableNames.includes(TABLE_NAME)) {
          // Table exists, open it
          this.table = await this.db.openTable(TABLE_NAME);
          logger.rag.info('Using existing LanceDB table', {
            table: TABLE_NAME
          });
        } else {
          // Table doesn't exist, we'll create it on first document ingestion
          logger.rag.info('LanceDB table will be created on first document', {
            table: TABLE_NAME
          });
        }
      } catch (error) {
        logger.rag.error('Failed to check/open table', {
          table: TABLE_NAME,
          error: error instanceof Error ? error.message : error
        });
        // Don't throw - table will be created on first document
      }

      this.isInitialized = true;
      logger.rag.info('RAG service initialized successfully');
    } catch (error) {
      logger.rag.error('Failed to initialize RAG service', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Check if RAG service is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.db !== null && this.embedder !== null;
  }

  /**
   * Ingest document into LanceDB
   * 1. Process document to extract text chunks
   * 2. Generate embeddings for each chunk
   * 3. Store in LanceDB
   * Returns: { chunkCount, chunkIds }
   */
  async ingestDocument(
    filePath: string,
    documentId: string,
    filename: string
  ): Promise<{ chunkCount: number; chunkIds: string[] }> {
    if (!this.isReady()) {
      throw new Error('RAG service not initialized. Call initialize() first.');
    }

    try {
      logger.rag.info('Ingesting document', {
        documentId,
        filename,
        filePath
      });

      // Process document to extract chunks
      const chunks = await DocumentProcessor.processDocument(filePath, documentId, filename);

      logger.rag.info('Document chunked', {
        documentId,
        chunkCount: chunks.length
      });

      // Generate embeddings and store in LanceDB
      const chunkIds = await this.addChunksToIndex(chunks, documentId);

      logger.rag.info('Document ingested successfully', {
        documentId,
        chunkCount: chunks.length,
        chunkIds: chunkIds.length
      });

      return {
        chunkCount: chunks.length,
        chunkIds
      };
    } catch (error) {
      logger.rag.error('Failed to ingest document', {
        documentId,
        filename,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Query knowledge base for relevant information
   */
  async queryKnowledge(question: string, topK: number = DEFAULT_TOP_K): Promise<string[]> {
    if (!this.isReady()) {
      throw new Error('RAG service not initialized. Call initialize() first.');
    }

    if (!this.table) {
      logger.rag.warn('No table available for querying');
      return [];
    }

    try {
      logger.rag.info('Querying knowledge base', {
        question: question.substring(0, 100), // Log first 100 chars
        topK
      });

      // Generate embedding for question
      const questionEmbedding = await this.generateEmbedding(question);

      // Query LanceDB
      const results = await this.table
        .search(questionEmbedding)
        .limit(topK)
        .toArray();

      // Extract text from results
      const texts = results.map((row: any) => row.text);

      logger.rag.info('Knowledge query completed', {
        question: question.substring(0, 100),
        resultCount: texts.length
      });

      return texts.filter((text): text is string => text !== null && text !== undefined);
    } catch (error) {
      logger.rag.error('Failed to query knowledge', {
        question: question.substring(0, 100),
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Delete document from LanceDB using specific chunk IDs
   */
  async deleteDocument(chunkIds: string[]): Promise<void> {
    if (!this.isReady()) {
      throw new Error('RAG service not initialized. Call initialize() first.');
    }

    if (!this.table) {
      logger.rag.warn('No table available for deletion');
      return;
    }

    if (!chunkIds || chunkIds.length === 0) {
      logger.rag.warn('No chunk IDs provided for deletion');
      return;
    }

    try {
      logger.rag.info('Deleting chunks from LanceDB', {
        chunkCount: chunkIds.length
      });

      // Delete each chunk by its specific ID
      // Build an IN clause for efficient deletion
      const idsString = chunkIds.map(id => `'${id}'`).join(', ');
      await this.table.delete(`id IN (${idsString})`);

      logger.rag.info('Chunks deleted from LanceDB', {
        deletedCount: chunkIds.length
      });
    } catch (error) {
      logger.rag.error('Failed to delete chunks from LanceDB', {
        chunkCount: chunkIds.length,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Clear all documents from LanceDB
   * Drops the entire table and reinitializes
   */
  async clearAllDocuments(): Promise<void> {
    if (!this.isReady()) {
      throw new Error('RAG service not initialized. Call initialize() first.');
    }

    if (!this.db) {
      logger.rag.warn('No database connection available');
      return;
    }

    try {
      logger.rag.info('Clearing all documents from LanceDB');

      // Drop the table if it exists
      if (this.table) {
        const tableNames = await this.db.tableNames();
        if (tableNames.includes(TABLE_NAME)) {
          await this.db.dropTable(TABLE_NAME);
          logger.rag.info('LanceDB table dropped', { table: TABLE_NAME });
        }
      }

      // Reset table reference
      this.table = null;

      logger.rag.info('All documents cleared from LanceDB');
    } catch (error) {
      logger.rag.error('Failed to clear all documents from LanceDB', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Get RAG statistics
   */
  async getStats(): Promise<{ totalChunks: number }> {
    if (!this.isReady() || !this.table) {
      return { totalChunks: 0 };
    }

    try {
      const count = await this.table.countRows();

      return { totalChunks: count };
    } catch (error) {
      logger.rag.error('Failed to get RAG stats', {
        error: error instanceof Error ? error.message : error
      });
      return { totalChunks: 0 };
    }
  }

  /**
   * Generate embedding for text using HuggingFace model
   * @private
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embedder) {
      throw new Error('Embedder not initialized');
    }

    try {
      // Generate embedding using transformers.js
      const output = await this.embedder(text, {
        pooling: 'mean',
        normalize: true,
      });

      // Convert tensor to array
      const embedding = Array.from(output.data) as number[];

      return embedding;
    } catch (error) {
      logger.rag.error('Failed to generate embedding', {
        textLength: text.length,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Add document chunks to LanceDB
   * Returns array of chunk IDs
   * @private
   */
  private async addChunksToIndex(chunks: DocumentChunk[], documentId: string): Promise<string[]> {
    if (!this.db || !this.embedder) {
      throw new Error('RAG service not properly initialized');
    }

    try {
      // Process all chunks and generate embeddings
      logger.rag.info('Generating embeddings for chunks', {
        documentId,
        chunkCount: chunks.length,
        estimatedTime: `~${Math.ceil(chunks.length * 0.5)}s`
      });

      const records = [];
      const chunkIds: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        try {
          const embedding = await this.generateEmbedding(chunk.text);
          const chunkId = `${documentId}_chunk_${chunk.metadata.chunkIndex}`;

          chunkIds.push(chunkId);

          records.push({
            id: chunkId,
            vector: embedding,
            text: chunk.text,
            documentId: chunk.metadata.documentId,
            filename: chunk.metadata.filename,
            chunkIndex: chunk.metadata.chunkIndex,
            totalChunks: chunk.metadata.totalChunks || chunks.length,
          });

          // Log progress for large documents (every 10 chunks)
          if (chunks.length > 20 && (i + 1) % 10 === 0) {
            logger.rag.debug('Embedding progress', {
              documentId,
              processed: i + 1,
              total: chunks.length,
              progress: `${Math.round(((i + 1) / chunks.length) * 100)}%`
            });
          }
        } catch (error) {
          logger.rag.error('Failed to generate embedding for chunk', {
            documentId,
            chunkIndex: chunk.metadata.chunkIndex,
            chunkTextPreview: chunk.text.substring(0, 100),
            error: error instanceof Error ? error.message : error
          });
          throw error;
        }
      }

      // Create table if it doesn't exist, or add to existing table
      if (!this.table) {
        logger.rag.info('Creating LanceDB table', {
          table: TABLE_NAME,
          initialRecords: records.length
        });

        this.table = await this.db.createTable(TABLE_NAME, records);
      } else {
        logger.rag.info('Adding records to existing table', {
          table: TABLE_NAME,
          recordCount: records.length
        });

        await this.table.add(records);
      }

      logger.rag.info('All chunks added to LanceDB', {
        documentId,
        totalChunks: chunks.length
      });

      return chunkIds;
    } catch (error) {
      logger.rag.error('Failed to add chunks to LanceDB', {
        documentId,
        chunkCount: chunks.length,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }
}

// Singleton instance
export const ragService = new RAGService();
