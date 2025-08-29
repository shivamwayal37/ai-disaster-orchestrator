-- Migration to update embedding dimensions for Kimi API (1024 dimensions)
-- This script is idempotent and can be run multiple times

-- Drop existing indexes that might be using the old embedding column
ALTER TABLE documents 
  DROP INDEX IF EXISTS idx_documents_embedding;

-- Modify the embedding column to use 1024 dimensions for Kimi
ALTER TABLE documents 
  MODIFY COLUMN embedding VECTOR(1024) COMMENT 'Text embedding for semantic search using Kimi API';

-- Recreate the vector index with the new dimensions
CREATE INDEX IF NOT EXISTS idx_documents_embedding 
  ON documents(embedding) 
  VECTOR 
  COMMENT 'Vector index for semantic search with Kimi embeddings';

-- Update the migration log
INSERT INTO schema_migrations (version, description, applied_at) 
VALUES ('2024082901', 'Updated embedding dimensions to 1024 for Kimi API', NOW())
ON DUPLICATE KEY UPDATE applied_at = NOW();

-- Verify the changes
SELECT 
  TABLE_NAME, 
  COLUMN_NAME, 
  COLUMN_TYPE, 
  COLUMN_COMMENT 
FROM 
  INFORMATION_SCHEMA.COLUMNS 
WHERE 
  TABLE_SCHEMA = 'disaster_db' 
  AND COLUMN_NAME = 'embedding';
