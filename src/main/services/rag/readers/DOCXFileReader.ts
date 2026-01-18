import { getLogger } from '../../logging';
import type { IFileReader } from './IFileReader';

const logger = getLogger();

/**
 * Reader for DOCX files using mammoth library
 * TODO: Implement DOCX extraction when mammoth library is installed
 */
export class DOCXFileReader implements IFileReader {
  getSupportedExtensions(): string[] {
    return ['docx'];
  }

  async extractText(filePath: string): Promise<string> {
    logger.rag.debug('Attempting DOCX extraction', { filePath });

    // Placeholder - needs mammoth library
    // For now, throw error to indicate not implemented
    logger.rag.error('DOCX extraction not yet implemented', {
      filePath,
      requiredLibrary: 'mammoth',
      installCommand: 'pnpm add mammoth'
    });

    throw new Error('DOCX extraction not yet implemented. Please install mammoth library.');
  }
}
