-- Migration 0007: Add chunk_ids column to documents table
--
-- This migration adds a chunk_ids column to store the LanceDB chunk IDs
-- as a JSON array, allowing us to delete specific chunks when a document is removed.

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- Add chunk_ids column to store JSON array of chunk IDs
ALTER TABLE documents ADD COLUMN chunk_ids TEXT DEFAULT NULL;

-- Update schema version
UPDATE schema_version SET version = 7 WHERE id = 1;
INSERT OR IGNORE INTO schema_version (version) VALUES (7);

PRAGMA foreign_keys = ON;
COMMIT;

-- Column description:
-- - chunk_ids: JSON array of chunk IDs stored in LanceDB (e.g., '["doc_123_chunk_0", "doc_123_chunk_1"]')
