import { createClient, Client, InValue } from '@libsql/client';
import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { getLogger } from './logging';
import { directoryService } from './directoryService';

export class DatabaseService {
  private logger = getLogger();
  private client: Client | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = directoryService.getDatabasePath();
  }

  async initialize(): Promise<void> {
    try {
      // Ensure the directory exists
      await directoryService.ensureBaseDir();

      // Create the client
      this.client = createClient({
        url: `file:${this.dbPath}`
      });

      this.logger.database.info("Database initialized", { dbPath: this.dbPath });
      
      // Run migrations on initialization
      await this.runMigrations();
    } catch (error) {
      this.logger.database.error("Failed to initialize database", { 
        error: error instanceof Error ? error.message : error,
        dbPath: this.dbPath 
      });
      throw error;
    }
  }

  async execute(sql: string, params?: InValue[]) {
    if (!this.client) {
      throw new Error('Database not initialized');
    }

    const startTime = performance.now();
    const operation = this.getOperationType(sql);
    const table = this.getTableFromSql(sql);
    
    this.logger.database.debug("SQL execution", {
      operation,
      table,
      sql,
      params: params?.length ? params : 'none',
      timestamp: new Date().toISOString()
    });

    try {
      const result = await this.client.execute({
        sql,
        args: params || []
      });
      
      const duration = performance.now() - startTime;
      this.logger.database.debug("SQL execution success", {
        operation,
        table,
        duration: duration.toFixed(2) + 'ms',
        rowsAffected: result.rowsAffected,
        rowsReturned: result.rows.length,
        lastInsertRowid: result.lastInsertRowid
      });
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.logger.database.error("SQL execution failed", {
        operation,
        table,
        duration: duration.toFixed(2) + 'ms',
        error: error instanceof Error ? error.message : error,
        sql,
        params
      });
      throw error;
    }
  }

  async transaction(queries: Array<{ sql: string; args?: InValue[] }>) {
    if (!this.client) {
      throw new Error('Database not initialized');
    }

    const startTime = performance.now();
    const operations = queries.map(q => `${this.getOperationType(q.sql)}:${this.getTableFromSql(q.sql)}`).join(', ');
    
    this.logger.database.debug("Transaction started", {
      queryCount: queries.length,
      operations,
      timestamp: new Date().toISOString()
    });

    try {
      const results = await this.client.batch(queries);
      
      const duration = performance.now() - startTime;
      const totalRowsAffected = results.reduce((sum, result) => sum + (result.rowsAffected || 0), 0);
      
      this.logger.database.debug("Transaction success", {
        duration: duration.toFixed(2) + 'ms',
        operations: queries.length,
        totalRowsAffected,
        results: results.length
      });
      
      return results;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.logger.database.error("Transaction failed", {
        duration: duration.toFixed(2) + 'ms',
        error: error instanceof Error ? error.message : error,
        operations: queries.length,
        queries: queries.map(q => ({ sql: q.sql, paramsCount: q.args?.length || 0 }))
      });
      throw error;
    }
  }

  private async runMigrations(): Promise<void> {
    try {
      // Check if migrations table exists
      await this.execute(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL
        )
      `);

      // Get current schema version
      const currentVersion = await this.getCurrentSchemaVersion();
      this.logger.database.info("Database migration check", { currentSchemaVersion: currentVersion });

      // Apply migrations
      const migrations = this.getMigrations();
      
      for (const migration of migrations) {
        if (migration.version > currentVersion) {
          this.logger.database.info("Applying database migration", { 
            version: migration.version, 
            name: migration.name 
          });
          
          // Execute migration in transaction
          const migrationQueries = migration.queries.map(sql => ({ sql }));
          const versionQuery = {
            sql: 'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
            args: [migration.version as InValue, Date.now() as InValue]
          };
          
          await this.transaction([...migrationQueries, versionQuery]);
          
          this.logger.database.info("Database migration completed", { version: migration.version });
        }
      }
    } catch (error) {
      this.logger.database.error("Database migration failed", { 
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  private async getCurrentSchemaVersion(): Promise<number> {
    try {
      const result = await this.execute(
        'SELECT MAX(version) as version FROM schema_migrations'
      );
      
      const row = result.rows[0];
      return row && row[0] ? Number(row[0]) : 0;
    } catch (error) {
      // Table doesn't exist yet
      return 0;
    }
  }

  private getMigrations() {
    return [
      {
        version: 1,
        name: 'Initial schema',
        queries: [
          // Chat sessions
          `CREATE TABLE IF NOT EXISTS chat_sessions (
            id TEXT PRIMARY KEY,
            title TEXT,
            model TEXT NOT NULL,
            folder_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )`,

          // Messages
          `CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            tool_calls TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
          )`,

          // AI Providers
          `CREATE TABLE IF NOT EXISTS providers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            base_url TEXT,
            api_key_ref TEXT,
            enabled BOOLEAN DEFAULT true,
            created_at INTEGER NOT NULL
          )`,

          // AI Models
          `CREATE TABLE IF NOT EXISTS models (
            id TEXT PRIMARY KEY,
            provider_id TEXT NOT NULL,
            name TEXT NOT NULL,
            display_name TEXT,
            max_tokens INTEGER,
            supports_streaming BOOLEAN DEFAULT true,
            cost_per_token REAL,
            enabled BOOLEAN DEFAULT true,
            FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
          )`,

          // MCP Servers
          `CREATE TABLE IF NOT EXISTS mcp_servers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            command TEXT NOT NULL,
            args TEXT,
            env TEXT,
            enabled BOOLEAN DEFAULT true,
            created_at INTEGER NOT NULL
          )`,

          // MCP Tools
          `CREATE TABLE IF NOT EXISTS mcp_tools (
            id TEXT PRIMARY KEY,
            server_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            schema TEXT,
            enabled BOOLEAN DEFAULT true,
            consent_required BOOLEAN DEFAULT true,
            FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
          )`,

          // Application settings
          `CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            type TEXT DEFAULT 'string',
            updated_at INTEGER NOT NULL
          )`,

          // Create indexes
          `CREATE INDEX IF NOT EXISTS idx_messages_session_created
           ON messages(session_id, created_at)`,

          `CREATE INDEX IF NOT EXISTS idx_messages_content_search
           ON messages(content)`,

          `CREATE INDEX IF NOT EXISTS idx_models_provider_enabled
           ON models(provider_id, enabled)`,

          `CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated
           ON chat_sessions(updated_at DESC)`
        ]
      },
      {
        version: 2,
        name: 'Clean up unused tables',
        queries: [
          // Drop unused tables that are not being used by the application
          // These tables were created initially but the app evolved to use:
          // - electron-store for preferences (providers, models, settings)
          // - JSON config files for MCP configuration (mcp_servers, mcp_tools)

          // Disable foreign key constraints temporarily
          `PRAGMA foreign_keys = OFF`,

          // Drop unused MCP tables
          `DROP TABLE IF EXISTS mcp_tools`,
          `DROP TABLE IF EXISTS mcp_servers`,

          // Drop unused AI provider/model tables
          `DROP TABLE IF EXISTS models`,
          `DROP TABLE IF EXISTS providers`,

          // Drop unused settings table
          `DROP TABLE IF EXISTS settings`,

          // Drop related indexes that are no longer needed
          `DROP INDEX IF EXISTS idx_models_provider_enabled`,

          // Re-enable foreign key constraints
          `PRAGMA foreign_keys = ON`
        ]
      }
    ];
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.logger.database.info("Database connection closed");
    }
  }

  // Health check method
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.client) return false;
      
      const result = await this.execute('SELECT 1');
      return result.rows.length > 0;
      return true;
    } catch {
      return false;
    }
  }

  // Get database info
  getDatabaseInfo() {
    return {
      path: this.dbPath,
      isInitialized: this.client !== null,
      environment: process.env.NODE_ENV || 'development'
    };
  }

  // Helper methods for logging
  private getOperationType(sql: string): string {
    const normalizedSql = sql.trim().toUpperCase();
    if (normalizedSql.startsWith('SELECT')) return 'SELECT';
    if (normalizedSql.startsWith('INSERT')) return 'INSERT';
    if (normalizedSql.startsWith('UPDATE')) return 'UPDATE';
    if (normalizedSql.startsWith('DELETE')) return 'DELETE';
    if (normalizedSql.startsWith('CREATE')) return 'CREATE';
    if (normalizedSql.startsWith('DROP')) return 'DROP';
    if (normalizedSql.startsWith('ALTER')) return 'ALTER';
    return 'OTHER';
  }

  private getTableFromSql(sql: string): string {
    // Common patterns to extract table names
    const patterns = [
      /(?:FROM|INTO|UPDATE|TABLE)\s+([\w_]+)/i,
      /(?:JOIN)\s+([\w_]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = sql.match(pattern);
      if (match && match[1]) {
        return match[1].toLowerCase();
      }
    }
    
    return 'unknown';
  }
}

// Singleton instance
export const databaseService = new DatabaseService();