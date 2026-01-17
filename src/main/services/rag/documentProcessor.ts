import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogger } from '../logging';
import type { DocumentFileType } from '../../../types/database';
import { FileReaderFactory } from './readers';

const logger = getLogger();

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes
const CHUNK_SIZE = 512; // tokens (approximate - we use characters as proxy)
const CHUNK_OVERLAP = 128; // tokens overlap between chunks

/**
 * Document chunk with metadata
 */
export interface DocumentChunk {
  text: string;
  metadata: {
    documentId: string;
    filename: string;
    chunkIndex: number;
    totalChunks?: number;
  };
}

// Initialize file readers on first use
let readersInitialized = false;

/**
 * DocumentProcessor service
 * Handles file validation, text extraction, and chunking for RAG system
 * Uses FileReaderFactory pattern from vectorstores.org
 */
export class DocumentProcessor {
  /**
   * Initialize file readers
   */
  private static ensureReadersInitialized(): void {
    if (!readersInitialized) {
      FileReaderFactory.initialize();
      readersInitialized = true;
    }
  }

  /**
   * Get list of supported file types
   */
  static getSupportedTypes(): DocumentFileType[] {
    this.ensureReadersInitialized();
    return FileReaderFactory.getSupportedExtensions() as DocumentFileType[];
  }

  /**
   * Validate file size against max limit (100MB)
   */
  static async validateFile(filePath: string, maxSize: number = MAX_FILE_SIZE): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);

      logger.rag.debug('Validating file', {
        filePath,
        size: stats.size,
        maxSize,
        sizeMB: (stats.size / 1024 / 1024).toFixed(2)
      });

      if (stats.size > maxSize) {
        logger.rag.warn('File exceeds size limit', {
          filePath,
          size: stats.size,
          maxSize,
          sizeMB: (stats.size / 1024 / 1024).toFixed(2),
          maxSizeMB: (maxSize / 1024 / 1024).toFixed(2)
        });
        return false;
      }

      if (stats.size === 0) {
        logger.rag.warn('File is empty', { filePath });
        return false;
      }

      return true;
    } catch (error) {
      logger.rag.error('Error validating file', {
        filePath,
        error: error instanceof Error ? error.message : error,
        possibleCauses: [
          'File does not exist',
          'No permission to read file',
          'File path is invalid'
        ]
      });
      return false;
    }
  }

  /**
   * Extract file type from filename
   */
  static getFileType(filename: string): DocumentFileType | null {
    this.ensureReadersInitialized();
    const ext = path.extname(filename).toLowerCase().slice(1);
    return FileReaderFactory.isSupported(ext) ? (ext as DocumentFileType) : null;
  }

  /**
   * Process document file and extract text chunks
   */
  static async processDocument(
    filePath: string,
    documentId: string,
    filename: string
  ): Promise<DocumentChunk[]> {
    const fileType = this.getFileType(filename);

    if (!fileType) {
      throw new Error(`Unsupported file type for file: ${filename}`);
    }

    logger.rag.info('Processing document', {
      documentId,
      filename,
      fileType,
      filePath
    });

    // Extract text based on file type
    const text = await this.extractText(filePath, fileType);

    // Chunk the text
    const chunks = this.chunkText(text, documentId, filename);

    logger.rag.info('Document processed successfully', {
      documentId,
      filename,
      chunkCount: chunks.length,
      textLength: text.length
    });

    return chunks;
  }

  /**
   * Extract text from file based on type using FileReaderFactory
   */
  private static async extractText(filePath: string, fileType: DocumentFileType): Promise<string> {
    this.ensureReadersInitialized();

    logger.rag.debug('Starting text extraction', {
      filePath,
      fileType
    });

    try {
      const reader = FileReaderFactory.getReader(fileType);

      if (!reader) {
        throw new Error(`No reader found for file type: ${fileType}`);
      }

      const extractedText = await reader.extractText(filePath);

      logger.rag.debug('Text extraction completed', {
        filePath,
        fileType,
        textLength: extractedText.length,
        preview: extractedText.substring(0, 100)
      });

      return extractedText;
    } catch (error) {
      logger.rag.error('Text extraction failed', {
        filePath,
        fileType,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Chunk text into overlapping segments
   * Uses character count as proxy for token count (roughly 4 chars = 1 token)
   */
  private static chunkText(text: string, documentId: string, filename: string): DocumentChunk[] {
    logger.rag.debug('Starting text chunking', {
      documentId,
      filename,
      textLength: text.length,
      chunkSize: CHUNK_SIZE,
      overlap: CHUNK_OVERLAP
    });

    const chunks: DocumentChunk[] = [];

    // Convert token counts to character counts (rough approximation: 1 token ≈ 4 characters)
    const chunkSizeChars = CHUNK_SIZE * 4;
    const overlapChars = CHUNK_OVERLAP * 4;

    let startIndex = 0;
    let chunkIndex = 0;

    while (startIndex < text.length) {
      const endIndex = Math.min(startIndex + chunkSizeChars, text.length);
      const chunkText = text.slice(startIndex, endIndex);

      chunks.push({
        text: chunkText,
        metadata: {
          documentId,
          filename,
          chunkIndex,
          totalChunks: undefined // Will be set after all chunks are created
        }
      });

      chunkIndex++;
      startIndex += chunkSizeChars - overlapChars;

      // Avoid infinite loop for very small texts
      if (startIndex >= text.length) break;
    }

    // Update totalChunks for all chunks
    const totalChunks = chunks.length;
    chunks.forEach(chunk => {
      chunk.metadata.totalChunks = totalChunks;
    });

    logger.rag.debug('Text chunked', {
      documentId,
      filename,
      textLength: text.length,
      chunkCount: totalChunks,
      chunkSizeChars,
      overlapChars
    });

    return chunks;
  }
}

export const documentProcessor = new DocumentProcessor();
