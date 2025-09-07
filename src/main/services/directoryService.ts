import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { Stats } from 'fs';
import { getLogger } from './logging';

export class DirectoryService {
  private _logger?: ReturnType<typeof getLogger>;
  private readonly baseDir: string;

  constructor() {
    this.baseDir = path.join(os.homedir(), 'levante');
    // Don't initialize logger in constructor to avoid circular dependency
  }

  private get logger() {
    if (!this._logger) {
      this._logger = getLogger();
      // Log initialization on first use
      this._logger.core.debug("DirectoryService initialized", { 
        baseDir: this.baseDir,
        platform: process.platform 
      });
    }
    return this._logger;
  }

  /**
   * Get the base Levante directory path
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Get a file path within the Levante directory
   */
  getFilePath(fileName: string): string {
    const filePath = path.join(this.baseDir, fileName);
    // Don't log here to avoid circular dependency with FileTransport
    return filePath;
  }

  /**
   * Get a subdirectory path within the Levante directory
   */
  getSubdirPath(subdirName: string): string {
    const subdirPath = path.join(this.baseDir, subdirName);
    // Don't log here to avoid circular dependency with FileTransport
    return subdirPath;
  }

  /**
   * Ensure the base Levante directory exists
   */
  async ensureBaseDir(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      this.logger.core.debug("Base directory ensured", { baseDir: this.baseDir });
    } catch (error) {
      this.logger.core.error("Failed to create base directory", { 
        baseDir: this.baseDir,
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  /**
   * Ensure a subdirectory within Levante exists
   */
  async ensureSubdir(subdirName: string): Promise<string> {
    const subdirPath = this.getSubdirPath(subdirName);
    try {
      await fs.mkdir(subdirPath, { recursive: true });
      this.logger.core.debug("Subdirectory ensured", { 
        subdirName, 
        subdirPath 
      });
      return subdirPath;
    } catch (error) {
      this.logger.core.error("Failed to create subdirectory", { 
        subdirName,
        subdirPath,
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  /**
   * Check if a file exists in the Levante directory
   */
  async fileExists(fileName: string): Promise<boolean> {
    const filePath = this.getFilePath(fileName);
    try {
      await fs.access(filePath);
      this.logger.core.debug("File exists", { fileName, filePath });
      return true;
    } catch {
      this.logger.core.debug("File does not exist", { fileName, filePath });
      return false;
    }
  }

  /**
   * List all files in the Levante directory
   */
  async listFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.baseDir);
      this.logger.core.debug("Listed files in base directory", { 
        fileCount: files.length,
        files: files.slice(0, 10) // Log first 10 files to avoid spam
      });
      return files;
    } catch (error) {
      this.logger.core.error("Failed to list files", { 
        baseDir: this.baseDir,
        error: error instanceof Error ? error.message : error 
      });
      return [];
    }
  }

  /**
   * Get file stats for debugging
   */
  async getFileStats(fileName: string): Promise<Stats | null> {
    const filePath = this.getFilePath(fileName);
    try {
      const stats = await fs.stat(filePath);
      this.logger.core.debug("Retrieved file stats", { 
        fileName,
        filePath,
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime
      });
      return stats;
    } catch (error) {
      this.logger.core.debug("Failed to get file stats", { 
        fileName,
        filePath,
        error: error instanceof Error ? error.message : error 
      });
      return null;
    }
  }

  /**
   * Get directory info for debugging
   */
  async getDirectoryInfo(): Promise<{
    baseDir: string;
    exists: boolean;
    files: string[];
    totalFiles: number;
  }> {
    const files = await this.listFiles();
    const info = {
      baseDir: this.baseDir,
      exists: files.length > 0 || await this.directoryExists(),
      files,
      totalFiles: files.length
    };
    
    this.logger.core.info("Directory info requested", info);
    return info;
  }

  /**
   * Check if the base directory exists
   */
  private async directoryExists(): Promise<boolean> {
    try {
      await fs.access(this.baseDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Common file paths used by the application
   */
  static readonly FILES = {
    DATABASE: 'levante.db',
    PREFERENCES: 'ui-preferences.json',
    MCP_CONFIG: 'mcp.json',
    LOGS: 'levante.log',
    MEMORY: 'memory.json',
    USER_PROFILE: 'user-profile.json'
  } as const;

  /**
   * Get predefined file paths
   */
  getDatabasePath(): string { return this.getFilePath(DirectoryService.FILES.DATABASE); }
  getPreferencesPath(): string { return this.getFilePath(DirectoryService.FILES.PREFERENCES); }
  getMcpConfigPath(): string { return this.getFilePath(DirectoryService.FILES.MCP_CONFIG); }
  getLogsPath(): string { return this.getFilePath(DirectoryService.FILES.LOGS); }
  getMemoryPath(): string { return this.getFilePath(DirectoryService.FILES.MEMORY); }
  getUserProfilePath(): string { return this.getFilePath(DirectoryService.FILES.USER_PROFILE); }
}

// Singleton instance
export const directoryService = new DirectoryService();