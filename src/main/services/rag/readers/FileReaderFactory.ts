import { getLogger } from '../../logging';
import type { IFileReader } from './IFileReader';
import { TextFileReader } from './TextFileReader';
import { JSONFileReader } from './JSONFileReader';
import { PDFFileReader } from './PDFFileReader';
import { DOCXFileReader } from './DOCXFileReader';
import { CSVFileReader } from './CSVFileReader';
import { HTMLFileReader } from './HTMLFileReader';

const logger = getLogger();

/**
 * Factory for creating appropriate file readers based on file extension
 * Follows the vectorstores.org pattern with fileExtToReader mapping
 */
export class FileReaderFactory {
  private static readers: Map<string, IFileReader> = new Map();

  /**
   * Initialize all readers
   */
  static initialize(): void {
    logger.rag.debug('Initializing file readers');

    const readers: IFileReader[] = [
      new TextFileReader(),
      new JSONFileReader(),
      new PDFFileReader(),
      new DOCXFileReader(),
      new CSVFileReader(),
      new HTMLFileReader()
    ];

    // Build extension to reader mapping
    for (const reader of readers) {
      const extensions = reader.getSupportedExtensions();
      for (const ext of extensions) {
        this.readers.set(ext.toLowerCase(), reader);
        logger.rag.debug('Registered reader for extension', {
          extension: ext,
          readerType: reader.constructor.name
        });
      }
    }

    logger.rag.info('File readers initialized', {
      supportedExtensions: Array.from(this.readers.keys())
    });
  }

  /**
   * Get reader for a specific file extension
   * @param extension - File extension (e.g., 'pdf', 'txt')
   * @returns Reader instance or null if not supported
   */
  static getReader(extension: string): IFileReader | null {
    if (this.readers.size === 0) {
      this.initialize();
    }

    const reader = this.readers.get(extension.toLowerCase());

    if (!reader) {
      logger.rag.warn('No reader found for extension', { extension });
      return null;
    }

    return reader;
  }

  /**
   * Get all supported file extensions
   * @returns Array of supported extensions
   */
  static getSupportedExtensions(): string[] {
    if (this.readers.size === 0) {
      this.initialize();
    }

    return Array.from(this.readers.keys());
  }

  /**
   * Check if a file extension is supported
   * @param extension - File extension to check
   * @returns True if supported, false otherwise
   */
  static isSupported(extension: string): boolean {
    if (this.readers.size === 0) {
      this.initialize();
    }

    return this.readers.has(extension.toLowerCase());
  }
}
