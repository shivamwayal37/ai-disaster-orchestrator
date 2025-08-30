-- Add vector indexes for similarity search
-- Using HNSW (Hierarchical Navigable Small World) for approximate nearest neighbor search

-- Add index for alerts table
ALTER TABLE alerts 
  ADD VECTOR INDEX idx_alerts_embedding (embedding) 
  USING HNSW
  WITH (m = 16, ef_construction = 64);

-- Add index for documents table
ALTER TABLE documents 
  ADD VECTOR INDEX idx_documents_embedding (embedding) 
  USING HNSW
  WITH (m = 16, ef_construction = 64);

-- Add index for resources table
ALTER TABLE resources 
  ADD VECTOR INDEX idx_resources_embedding (embedding) 
  USING HNSW
  WITH (m = 16, ef_construction = 64);

-- Add index for document image embeddings
ALTER TABLE documents 
  ADD VECTOR INDEX idx_documents_image_embedding (image_embedding) 
  USING HNSW
  WITH (m = 16, ef_construction = 64);

-- Add full-text search indexes
CREATE FULLTEXT INDEX idx_alerts_ft ON alerts(title, description);
CREATE FULLTEXT INDEX idx_documents_ft ON documents(title, content);
CREATE FULLTEXT INDEX idx_resources_ft ON resources(name, description);

-- Add spatial index for location-based queries
ALTER TABLE alerts ADD SPATIAL INDEX idx_alerts_location (location);
ALTER TABLE resources ADD SPATIAL INDEX idx_resources_location (location);

-- Add composite indexes for common query patterns
CREATE INDEX idx_alerts_severity_effective ON alerts(severity, effective);
CREATE INDEX idx_documents_category_type ON documents(category, type);
CREATE INDEX idx_resources_category_status ON resources(category, status);
