-- Levante Database Schema
-- Current as of migration version 2
-- Database location: ~/levante/levante.db (SQLite)

-- Schema migration tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- Chat sessions: User conversation contexts
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,           -- Unique session identifier
  title TEXT,                    -- Optional session title
  model TEXT NOT NULL,           -- AI model used for this session
  folder_id TEXT,                -- Optional folder organization
  created_at INTEGER NOT NULL,   -- Unix timestamp
  updated_at INTEGER NOT NULL    -- Unix timestamp (updated on new messages)
);

-- Messages: Individual chat messages within sessions
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,                                          -- Unique message ID
  session_id TEXT NOT NULL,                                     -- References chat_sessions(id)
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')), -- Message sender
  content TEXT NOT NULL,                                        -- Message content
  tool_calls TEXT,                                              -- JSON string of tool invocations (optional)
  created_at INTEGER NOT NULL,                                  -- Unix timestamp
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_session_created
  ON messages(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_content_search
  ON messages(content);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated
  ON chat_sessions(updated_at DESC);

-- Note: Configuration data is stored outside the database:
-- - User preferences: ~/levante/ui-preferences.json (encrypted via electron-store)
-- - MCP server config: ~/levante/mcp.json
-- - Application logs: ~/levante/levante.log