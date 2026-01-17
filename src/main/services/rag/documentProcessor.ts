import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogger } from '../logging';
import type { DocumentFileType } from '../../../types/database';

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

/**
 * Supported file types for document processing
 */
const SUPPORTED_FILE_TYPES: DocumentFileType[] = ['pdf', 'docx', 'txt', 'md', 'json'];

/**
 * DocumentProcessor service
 * Handles file validation, text extraction, and chunking for RAG system
 */
export class DocumentProcessor {
  /**
   * Get list of supported file types
   */
  static getSupportedTypes(): DocumentFileType[] {
    return [...SUPPORTED_FILE_TYPES];
  }

  /**
   * Validate file size against max limit (100MB)
   */
  static async validateFile(filePath: string, maxSize: number = MAX_FILE_SIZE): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > maxSize) {
        logger.core.warn('File exceeds size limit', {
          filePath,
          size: stats.size,
          maxSize
        });
        return false;
      }
      return true;
    } catch (error) {
      logger.core.error('Error validating file', {
        filePath,
        error: error instanceof Error ? error.message : error
      });
      return false;
    }
  }

  /**
   * Extract file type from filename
   */
  static getFileType(filename: string): DocumentFileType | null {
    const ext = path.extname(filename).toLowerCase().slice(1) as DocumentFileType;
    return SUPPORTED_FILE_TYPES.includes(ext) ? ext : null;
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

    logger.core.info('Processing document', {
      documentId,
      filename,
      fileType,
      filePath
    });

    // Extract text based on file type
    const text = await this.extractText(filePath, fileType);

    // Chunk the text
    const chunks = this.chunkText(text, documentId, filename);

    logger.core.info('Document processed successfully', {
      documentId,
      filename,
      chunkCount: chunks.length,
      textLength: text.length
    });

    return chunks;
  }

  /**
   * Extract text from file based on type
   */
  private static async extractText(filePath: string, fileType: DocumentFileType): Promise<string> {
    switch (fileType) {
      case 'txt':
      case 'md':
        return await this.extractTextFile(filePath);

      case 'json':
        return await this.extractJsonFile(filePath);

      case 'pdf':
        return await this.extractPdfFile(filePath);

      case 'docx':
        return await this.extractDocxFile(filePath);

      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  /**
   * Extract text from plain text or markdown file
   */
  private static async extractTextFile(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      logger.core.error('Error reading text file', {
        filePath,
        error: error instanceof Error ? error.message : error
      });
      throw new Error(`Failed to read text file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from JSON file
   */
  private static async extractJsonFile(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const json = JSON.parse(content);
      // Convert JSON to readable text representation
      return JSON.stringify(json, null, 2);
    } catch (error) {
      logger.core.error('Error reading JSON file', {
        filePath,
        error: error instanceof Error ? error.message : error
      });
      throw new Error(`Failed to read JSON file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from PDF file
   * TODO: Implement PDF extraction using pdf-parse library
   */
  private static async extractPdfFile(_filePath: string): Promise<string> {
    // Placeholder - needs pdf-parse library
    // For now, throw error to indicate not implemented
    throw new Error('PDF extraction not yet implemented. Please install pdf-parse library.');
  }

  /**
   * Extract text from DOCX file
   * TODO: Implement DOCX extraction using mammoth library
   */
  private static async extractDocxFile(_filePath: string): Promise<string> {
    // Placeholder - needs mammoth library
    // For now, throw error to indicate not implemented
    throw new Error('DOCX extraction not yet implemented. Please install mammoth library.');
  }

  /**
   * Chunk text into overlapping segments
   * Uses character count as proxy for token count (roughly 4 chars = 1 token)
   */
  private static chunkText(text: string, documentId: string, filename: string): DocumentChunk[] {
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

    logger.core.debug('Text chunked', {
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
