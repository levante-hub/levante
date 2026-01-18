import * as fs from 'fs/promises';
import { getLogger } from '../../logging';
import type { IFileReader } from './IFileReader';

const logger = getLogger();

/**
 * Reader for plain text and markdown files
 */
export class TextFileReader implements IFileReader {
  getSupportedExtensions(): string[] {
    return ['txt', 'md'];
  }

  async extractText(filePath: string): Promise<string> {
    try {
      logger.rag.debug('Reading text file', { filePath });

      const content = await fs.readFile(filePath, 'utf-8');

      logger.rag.debug('Text file read successfully', {
        filePath,
        contentLength: content.length,
        preview: content.substring(0, 100)
      });

      return content;
    } catch (error) {
      logger.rag.error('Error reading text file', {
        filePath,
        error: error instanceof Error ? error.message : error
      });
      throw new Error(`Failed to read text file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
