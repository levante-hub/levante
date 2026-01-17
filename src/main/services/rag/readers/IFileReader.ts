/**
 * Base interface for all file readers
 */
export interface IFileReader {
  /**
   * Extract text content from a file
   * @param filePath - Absolute path to the file
   * @returns Extracted text content
   */
  extractText(filePath: string): Promise<string>;

  /**
   * Get supported file extensions
   * @returns Array of supported extensions (e.g., ['txt', 'md'])
   */
  getSupportedExtensions(): string[];
}
