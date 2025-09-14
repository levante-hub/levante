## Database Migrations — Levante

### Strategy
- `schema_migrations` table for versioning (new system).
- Numbered files `0001_*.sql` applied in order.
- Idempotent where possible (`IF NOT EXISTS`).
- Migrations defined both as files (documentation) and in code (`databaseService.ts`).

### Application
On app start, `runMigrations()`:
- Read current version from `schema_migrations`.
- Execute new migrations in a transaction.
- Record completion in `schema_migrations`.

### Migration History

#### 0001_init.sql - Initial Schema
Creates the complete initial database schema including all tables (chat, providers, models, MCP, settings).

#### 0002_cleanup_unused_tables.sql - Schema Cleanup
Removes unused tables that are no longer utilized by the application:
- **Removed**: `providers`, `models`, `settings` (now handled via electron-store preferences)
- **Removed**: `mcp_servers`, `mcp_tools` (now handled via JSON config files)
- **Kept**: `chat_sessions`, `messages` (core chat functionality)
- **Kept**: `schema_migrations` (migration tracking)

After migration 0002, the database only contains chat-related data, with configuration managed through other mechanisms.

Reference engine: [Turso](https://turso.tech/).


