-- Migration 0006: Add documents table for RAG system
--
-- This migration creates the documents table to store metadata about uploaded
-- files for the RAG (Retrieval-Augmented Generation) system.
-- The actual document chunks and embeddings are stored in ChromaDB.

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('pdf', 'docx', 'txt', 'md', 'json')),
  file_size INTEGER NOT NULL CHECK(file_size > 0),
  status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'indexed', 'failed')),
  chunk_count INTEGER DEFAULT 0 CHECK(chunk_count >= 0),
  error_message TEXT DEFAULT NULL,
  uploaded_at INTEGER NOT NULL,
  indexed_at INTEGER DEFAULT NULL
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded ON documents(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(file_type);

-- Update schema version
UPDATE schema_version SET version = 6 WHERE id = 1;
INSERT OR IGNORE INTO schema_version (version) VALUES (6);

PRAGMA foreign_keys = ON;
COMMIT;

-- Documents table structure:
-- - id: Unique identifier for the document
-- - filename: Original filename (e.g., "report.pdf")
-- - filepath: Absolute path to stored file (e.g., "~/levante/documents/{id}/report.pdf")
-- - file_type: File extension/type (pdf, docx, txt, md, json)
-- - file_size: Size in bytes (for validation and display)
-- - status: Processing status (processing, indexed, failed)
-- - chunk_count: Number of chunks extracted from document
-- - error_message: Error details if status is 'failed'
-- - uploaded_at: Unix timestamp when uploaded
-- - indexed_at: Unix timestamp when indexing completed
