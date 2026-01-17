import { ChromaClient } from 'chromadb';
import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import { directoryService } from './directoryService';
import { DocumentProcessor, type DocumentChunk } from './rag/documentProcessor';
import { getLogger } from './logging';

const logger = getLogger();

const DEFAULT_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const COLLECTION_NAME = 'levante_knowledge';
const DEFAULT_TOP_K = 5;

/**
 * RAGService
 * Core service for Retrieval-Augmented Generation
 * Handles document ingestion, embedding generation, and knowledge retrieval
 */
export class RAGService {
  private chromaClient: ChromaClient | null = null;
  private embedder: FeatureExtractionPipeline | null = null;
  private chromaDbPath: string;
  private isInitialized = false;

  constructor() {
    this.chromaDbPath = directoryService.getChromaDbPath();
  }

  /**
   * Initialize RAG service with ChromaDB and HuggingFace embeddings
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.core.debug('RAG service already initialized');
      return;
    }

    try {
      logger.core.info('Initializing RAG service...', {
        chromaDbPath: this.chromaDbPath
      });

      // Ensure ChromaDB directory exists
      await directoryService.ensureSubdir('chromadb');

      // Initialize ChromaDB client
      this.chromaClient = new ChromaClient({
        path: this.chromaDbPath,
      });

      logger.core.info('ChromaDB client initialized', {
        path: this.chromaDbPath
      });

      // Initialize HuggingFace embedder
      logger.core.info('Loading embedding model...', {
        model: DEFAULT_EMBEDDING_MODEL
      });

      this.embedder = await pipeline(
        'feature-extraction',
        DEFAULT_EMBEDDING_MODEL
      );

      logger.core.info('Embedding model loaded successfully');

      // Create or get collection
      try {
        await this.chromaClient.createCollection({
          name: COLLECTION_NAME,
        });
        logger.core.info('Created new ChromaDB collection', {
          collection: COLLECTION_NAME
        });
      } catch (error) {
        // Collection might already exist, try to get it
        try {
          await this.chromaClient.getCollection({
            name: COLLECTION_NAME,
          });
          logger.core.info('Using existing ChromaDB collection', {
            collection: COLLECTION_NAME
          });
        } catch (getError) {
          logger.core.error('Failed to create or get collection', {
            collection: COLLECTION_NAME,
            error: getError instanceof Error ? getError.message : getError
          });
          throw getError;
        }
      }

      this.isInitialized = true;
      logger.core.info('RAG service initialized successfully');
    } catch (error) {
      logger.core.error('Failed to initialize RAG service', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Check if RAG service is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.chromaClient !== null && this.embedder !== null;
  }

  /**
   * Ingest document into ChromaDB
   * 1. Process document to extract text chunks
   * 2. Generate embeddings for each chunk
   * 3. Store in ChromaDB
   */
  async ingestDocument(filePath: string, documentId: string, filename: string): Promise<number> {
    if (!this.isReady()) {
      throw new Error('RAG service not initialized. Call initialize() first.');
    }

    try {
      logger.core.info('Ingesting document', {
        documentId,
        filename,
        filePath
      });

      // Process document to extract chunks
      const chunks = await DocumentProcessor.processDocument(filePath, documentId, filename);

      logger.core.info('Document chunked', {
        documentId,
        chunkCount: chunks.length
      });

      // Generate embeddings and store in ChromaDB
      await this.addChunksToIndex(chunks, documentId);

      logger.core.info('Document ingested successfully', {
        documentId,
        chunkCount: chunks.length
      });

      return chunks.length;
    } catch (error) {
      logger.core.error('Failed to ingest document', {
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

    try {
      logger.core.info('Querying knowledge base', {
        question: question.substring(0, 100), // Log first 100 chars
        topK
      });

      // Generate embedding for question
      const questionEmbedding = await this.generateEmbedding(question);

      // Query ChromaDB
      const collection = await this.chromaClient!.getCollection({
        name: COLLECTION_NAME,
      });

      const results = await collection.query({
        queryEmbeddings: [questionEmbedding],
        nResults: topK,
      });

      // Extract text from results
      const texts = results.documents[0] || [];

      logger.core.info('Knowledge query completed', {
        question: question.substring(0, 100),
        resultCount: texts.length
      });

      return texts.filter((text): text is string => text !== null);
    } catch (error) {
      logger.core.error('Failed to query knowledge', {
        question: question.substring(0, 100),
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Delete document from ChromaDB
   */
  async deleteDocument(documentId: string): Promise<void> {
    if (!this.isReady()) {
      throw new Error('RAG service not initialized. Call initialize() first.');
    }

    try {
      logger.core.info('Deleting document from ChromaDB', {
        documentId
      });

      const collection = await this.chromaClient!.getCollection({
        name: COLLECTION_NAME,
      });

      // Delete all chunks for this document
      // ChromaDB delete by filter
      await collection.delete({
        where: { documentId },
      });

      logger.core.info('Document deleted from ChromaDB', {
        documentId
      });
    } catch (error) {
      logger.core.error('Failed to delete document from ChromaDB', {
        documentId,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Get RAG statistics
   */
  async getStats(): Promise<{ totalChunks: number }> {
    if (!this.isReady()) {
      return { totalChunks: 0 };
    }

    try {
      const collection = await this.chromaClient!.getCollection({
        name: COLLECTION_NAME,
      });

      const count = await collection.count();

      return { totalChunks: count };
    } catch (error) {
      logger.core.error('Failed to get RAG stats', {
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
      logger.core.error('Failed to generate embedding', {
        textLength: text.length,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Add document chunks to ChromaDB
   * @private
   */
  private async addChunksToIndex(chunks: DocumentChunk[], documentId: string): Promise<void> {
    if (!this.chromaClient || !this.embedder) {
      throw new Error('RAG service not properly initialized');
    }

    try {
      const collection = await this.chromaClient.getCollection({
        name: COLLECTION_NAME,
      });

      // Process chunks in batches to avoid memory issues
      const BATCH_SIZE = 10;

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);

        logger.core.debug('Processing chunk batch', {
          documentId,
          batchStart: i,
          batchSize: batch.length
        });

        // Generate embeddings for batch
        const embeddings: number[][] = [];
        for (const chunk of batch) {
          const embedding = await this.generateEmbedding(chunk.text);
          embeddings.push(embedding);
        }

        // Add to collection
        await collection.add({
          ids: batch.map(chunk => `${documentId}_chunk_${chunk.metadata.chunkIndex}`),
          embeddings,
          documents: batch.map(chunk => chunk.text),
          metadatas: batch.map(chunk => ({
            documentId: chunk.metadata.documentId,
            filename: chunk.metadata.filename,
            chunkIndex: chunk.metadata.chunkIndex,
            totalChunks: chunk.metadata.totalChunks || chunks.length,
          })),
        });

        logger.core.debug('Batch added to ChromaDB', {
          documentId,
          batchStart: i,
          batchSize: batch.length
        });
      }

      logger.core.info('All chunks added to ChromaDB', {
        documentId,
        totalChunks: chunks.length
      });
    } catch (error) {
      logger.core.error('Failed to add chunks to ChromaDB', {
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
