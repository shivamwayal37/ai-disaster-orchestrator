-- Prisma migration: Fix embedding column types to VECTOR(1024) and add vector indexes
-- Applies to existing tables: documents, resources

-- Ensure we are in the correct database
-- Adjust if your DATABASE_URL points elsewhere
-- USE `disaster_db`;

-- 1) Convert BLOB embeddings to VECTOR(1024)
ALTER TABLE resources
  MODIFY COLUMN embedding VECTOR(1024);

ALTER TABLE documents
  MODIFY COLUMN embedding VECTOR(1024);

ALTER TABLE documents
  MODIFY COLUMN image_embedding VECTOR(1024);

-- 2) Add vector indexes with cosine distance and on-demand columnar replica
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
