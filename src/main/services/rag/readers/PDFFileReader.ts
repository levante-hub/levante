import { getLogger } from '../../logging';
import type { IFileReader } from './IFileReader';

const logger = getLogger();

/**
 * Reader for PDF files using pdf-parse library
 */
export class PDFFileReader implements IFileReader {
  getSupportedExtensions(): string[] {
    return ['pdf'];
  }

  async extractText(filePath: string): Promise<string> {
    logger.rag.debug('Starting PDF extraction', { filePath });

    try {
      // pdf-parse v2 exports a PDFParse class
      const { PDFParse } = require('pdf-parse');

      // Create parser instance with file path
      const parser = new PDFParse({ url: filePath });

      logger.rag.debug('PDF parser initialized, extracting text...', { filePath });

      // Extract text using getText() method
      const result = await parser.getText();

      // Clean up resources
      await parser.destroy();

      if (!result.text || result.text.trim().length === 0) {
        logger.rag.warn('PDF extraction produced empty text', {
          filePath,
          possibleCauses: [
            'PDF contains only images (OCR required)',
            'PDF is encrypted or password-protected',
            'PDF uses non-standard encoding'
          ]
        });
      }

      logger.rag.info('PDF text extracted successfully', {
        filePath,
        textLength: result.text.length,
        isEmpty: result.text.trim().length === 0
      });

      return result.text;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.rag.error('Failed to extract PDF text', {
        filePath,
        error: errorMessage,
        possibleCauses: [
          'PDF file is corrupted',
          'PDF is password-protected',
          'Unsupported PDF version',
          'pdf-parse library not installed'
        ]
      });

      throw new Error(`Failed to extract PDF text: ${errorMessage}`);
    }
  }
}
