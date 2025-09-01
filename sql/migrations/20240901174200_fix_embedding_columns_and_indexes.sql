-- Migration to fix embedding column types and add vector indexes
-- This migration corrects the column types for embeddings in 'resources' and 'documents' tables
-- and adds the necessary vector indexes with cosine distance and on-demand columnar replicas.

-- Step 1: Modify column types from LONGBLOB to VECTOR

ALTER TABLE resources
  MODIFY COLUMN embedding VECTOR(1024);

ALTER TABLE documents
  MODIFY COLUMN embedding VECTOR(1024);

-- Note: Assuming image embeddings should also be 1024 dimensions. Adjust if different.
ALTER TABLE documents
  MODIFY COLUMN image_embedding VECTOR(1024);

-- Step 2: Add vector indexes with cosine distance and auto columnar replica

ALTER TABLE resources
  ADD VECTOR INDEX idx_resources_embedding ((VEC_COSINE_DISTANCE(embedding)))
  USING HNSW
  ADD_COLUMNAR_REPLICA_ON_DEMAND;

ALTER TABLE documents
  ADD VECTOR INDEX idx_documents_embedding ((VEC_COSINE_DISTANCE(embedding)))
  USING HNSW
  ADD_COLUMNAR_REPLICA_ON_DEMAND;

ALTER TABLE documents
  ADD VECTOR INDEX idx_documents_image_embedding ((VEC_COSINE_DISTANCE(image_embedding)))
  USING HNSW
  ADD_COLUMNAR_REPLICA_ON_DEMAND;

-- Verification (run these manually after applying the migration)
-- SHOW CREATE TABLE resources;
-- SHOW CREATE TABLE documents;
