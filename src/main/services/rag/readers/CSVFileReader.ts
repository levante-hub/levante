import * as fs from 'fs/promises';
import { getLogger } from '../../logging';
import type { IFileReader } from './IFileReader';

const logger = getLogger();

/**
 * Reader for CSV files
 * Converts CSV to readable text format with column headers
 */
export class CSVFileReader implements IFileReader {
  getSupportedExtensions(): string[] {
    return ['csv'];
  }

  async extractText(filePath: string): Promise<string> {
    try {
      logger.rag.debug('Reading CSV file', { filePath });

      const content = await fs.readFile(filePath, 'utf-8');

      // Simple CSV parsing (doesn't handle complex quoted fields)
      const lines = content.split('\n').filter(line => line.trim().length > 0);

      if (lines.length === 0) {
        logger.rag.warn('CSV file is empty', { filePath });
        return '';
      }

      // First line as headers
      const headers = lines[0].split(',').map(h => h.trim());

      // Convert CSV to readable format
      const formattedLines: string[] = [];
      formattedLines.push(`CSV Data from ${filePath.split('/').pop()}`);
      formattedLines.push(`Columns: ${headers.join(', ')}`);
      formattedLines.push('');

      // Add each row as "Column: Value" pairs
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        formattedLines.push(`Row ${i}:`);

        headers.forEach((header, idx) => {
          if (values[idx]) {
            formattedLines.push(`  ${header}: ${values[idx]}`);
          }
        });

        formattedLines.push('');
      }

      const formattedText = formattedLines.join('\n');

      logger.rag.debug('CSV file read successfully', {
        filePath,
        rowCount: lines.length - 1,
        columnCount: headers.length,
        contentLength: formattedText.length
      });

      return formattedText;
    } catch (error) {
      logger.rag.error('Error reading CSV file', {
        filePath,
        error: error instanceof Error ? error.message : error
      });
      throw new Error(`Failed to read CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
