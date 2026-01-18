import * as fs from 'fs/promises';
import { getLogger } from '../../logging';
import type { IFileReader } from './IFileReader';

const logger = getLogger();

/**
 * Reader for HTML files
 * Strips HTML tags and extracts text content
 */
export class HTMLFileReader implements IFileReader {
  getSupportedExtensions(): string[] {
    return ['html', 'htm'];
  }

  async extractText(filePath: string): Promise<string> {
    try {
      logger.rag.debug('Reading HTML file', { filePath });

      const content = await fs.readFile(filePath, 'utf-8');

      // Simple HTML tag stripping (not a full parser)
      // Remove script and style tags with their content
      let text = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

      // Remove HTML tags
      text = text.replace(/<[^>]+>/g, ' ');

      // Decode common HTML entities
      text = text.replace(/&nbsp;/g, ' ');
      text = text.replace(/&amp;/g, '&');
      text = text.replace(/&lt;/g, '<');
      text = text.replace(/&gt;/g, '>');
      text = text.replace(/&quot;/g, '"');
      text = text.replace(/&#39;/g, "'");

      // Clean up whitespace
      text = text.replace(/\s+/g, ' ').trim();

      if (text.length === 0) {
        logger.rag.warn('HTML extraction produced empty text', {
          filePath,
          originalLength: content.length
        });
      }

      logger.rag.debug('HTML file read successfully', {
        filePath,
        originalLength: content.length,
        extractedLength: text.length,
        preview: text.substring(0, 100)
      });

      return text;
    } catch (error) {
      logger.rag.error('Error reading HTML file', {
        filePath,
        error: error instanceof Error ? error.message : error
      });
      throw new Error(`Failed to read HTML file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
