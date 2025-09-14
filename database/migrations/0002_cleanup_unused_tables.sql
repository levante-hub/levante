-- Migration 0002: Clean up unused tables
--
-- This migration removes database tables that are not being used by the application.
-- The application has evolved to use different storage mechanisms:
-- - electron-store for preferences (providers, models, settings)
-- - JSON config files for MCP configuration (mcp_servers, mcp_tools)
--
-- Only chat-related data (chat_sessions, messages) remains in the database.

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- Drop unused MCP tables (now handled via JSON config files)
DROP TABLE IF EXISTS mcp_tools;
DROP TABLE IF EXISTS mcp_servers;

-- Drop unused AI provider/model tables (now handled via electron-store preferences)
DROP TABLE IF EXISTS models;
DROP TABLE IF EXISTS providers;

-- Drop unused settings table (now handled via electron-store preferences)
DROP TABLE IF EXISTS settings;

-- Drop related indexes that are no longer needed
DROP INDEX IF EXISTS idx_models_provider_enabled;

-- Update schema version
UPDATE schema_version SET version = 2 WHERE id = 1;
INSERT OR IGNORE INTO schema_version (version) VALUES (2);

PRAGMA foreign_keys = ON;
COMMIT;

-- After this migration, the database only contains:
-- - schema_version (migration tracking)
-- - chat_sessions (chat session data)
-- - messages (chat message data)
-- - schema_migrations (new migration system tracking)