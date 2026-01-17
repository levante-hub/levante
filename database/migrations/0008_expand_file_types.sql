-- Migration 0008: Remove file_type CHECK constraint
--
-- This migration removes the CHECK constraint on file_type column.
-- File type validation will be handled in application code via FileReaderFactory.
-- This allows adding new file types without requiring database migrations.
--
-- SQLite doesn't support ALTER TABLE to drop CHECK constraints,
-- so we need to recreate the table.

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- Create new documents table WITHOUT file_type CHECK constraint
CREATE TABLE documents_new (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK(file_size > 0),
  status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'indexed', 'failed')),
  chunk_count INTEGER DEFAULT 0 CHECK(chunk_count >= 0),
  chunk_ids TEXT DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  uploaded_at INTEGER NOT NULL,
  indexed_at INTEGER DEFAULT NULL
);

-- Copy data from old table to new table
INSERT INTO documents_new SELECT * FROM documents;

-- Drop old table
DROP TABLE documents;

-- Rename new table to original name
ALTER TABLE documents_new RENAME TO documents;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded ON documents(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(file_type);

-- Update schema version
UPDATE schema_version SET version = 8 WHERE id = 1;
INSERT OR IGNORE INTO schema_version (version) VALUES (8);

PRAGMA foreign_keys = ON;
COMMIT;

-- File type validation is now handled in application code:
-- - DocumentProcessor.getFileType() validates supported types
-- - FileReaderFactory.isSupported() checks if reader exists
-- - Frontend validation in knowledgeStore.ts
--
-- To add new file types, only code changes are needed:
-- 1. Create new FileReader class (e.g., ExcelFileReader)
-- 2. Register in FileReaderFactory
-- 3. Update frontend validation in knowledgeStore.ts
-- 4. Update TypeScript types in database.ts (optional for type safety)
-- NO database migration required!
