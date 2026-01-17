import * as fs from 'fs/promises';
import { getLogger } from '../../logging';
import type { IFileReader } from './IFileReader';

const logger = getLogger();

/**
 * Reader for JSON files
 * Converts JSON to formatted string representation
 */
export class JSONFileReader implements IFileReader {
  getSupportedExtensions(): string[] {
    return ['json'];
  }

  async extractText(filePath: string): Promise<string> {
    try {
      logger.rag.debug('Reading JSON file', { filePath });

      const content = await fs.readFile(filePath, 'utf-8');
      const json = JSON.parse(content);

      // Convert JSON to readable text representation
      const formattedText = JSON.stringify(json, null, 2);

      logger.rag.debug('JSON file read successfully', {
        filePath,
        contentLength: formattedText.length,
        preview: formattedText.substring(0, 100)
      });

      return formattedText;
    } catch (error) {
      logger.rag.error('Error reading JSON file', {
        filePath,
        error: error instanceof Error ? error.message : error
      });
      throw new Error(`Failed to read JSON file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
