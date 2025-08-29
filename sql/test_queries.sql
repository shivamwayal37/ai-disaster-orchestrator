-- Test Queries for TiDB Vector + Full-Text Search
-- Day 2 Verification Scripts

-- 1. Test Full-Text Search on Documents
-- Keyword search for disaster-related content
SELECT 
  id, 
  title, 
  category,
  MATCH(content) AGAINST('flood OR earthquake OR wildfire' IN NATURAL LANGUAGE MODE) as relevance_score
FROM documents 
WHERE MATCH(content) AGAINST('flood OR earthquake OR wildfire' IN NATURAL LANGUAGE MODE)
ORDER BY relevance_score DESC;

-- 2. Test Full-Text Search on Resources
-- Find shelters and hospitals by keyword
SELECT 
  id,
  name,
  type,
  city,
  MATCH(name, description, address) AGAINST('shelter hospital emergency' IN NATURAL LANGUAGE MODE) as relevance_score
FROM resources 
WHERE MATCH(name, description, address) AGAINST('shelter hospital emergency' IN NATURAL LANGUAGE MODE)
ORDER BY relevance_score DESC;

-- 3. Test Vector Similarity Search (Mock)
-- Note: Replace with actual vector once embeddings are generated
-- This is a placeholder query structure for vector search
SELECT 
  id,
  title,
  category,
  -- VEC_COSINE_DISTANCE(embedding, CAST('[0.1,0.2,0.3,...]' AS VECTOR(1536))) as distance
  'vector_distance_placeholder' as distance
FROM documents 
WHERE embedding IS NOT NULL
-- ORDER BY distance ASC
LIMIT 5;

-- 4. Hybrid Search Example (Full-Text + Vector)
-- Combine keyword relevance with semantic similarity
SELECT 
  d.id,
  d.title,
  d.category,
  MATCH(d.content) AGAINST('emergency response protocol' IN NATURAL LANGUAGE MODE) as text_score,
  -- VEC_COSINE_DISTANCE(d.embedding, CAST('[...]' AS VECTOR(1536))) as vector_score,
  'hybrid_score_placeholder' as hybrid_score
FROM documents d
WHERE MATCH(d.content) AGAINST('emergency response protocol' IN NATURAL LANGUAGE MODE)
   OR d.embedding IS NOT NULL
ORDER BY text_score DESC
LIMIT 10;

-- 5. Geospatial Queries
-- Find resources within 50km of incident location
SELECT 
  r.id,
  r.name,
  r.type,
  r.city,
  ST_Distance_Sphere(
    POINT(r.longitude, r.latitude),
    POINT(56.78, 12.34)  -- Example incident coordinates
  ) / 1000 as distance_km
FROM resources r
WHERE r.is_active = TRUE
HAVING distance_km <= 50
ORDER BY distance_km ASC;

-- 6. Complex Query: Find Best Resources for Specific Alert
-- Combine alert type, location, and resource capabilities
SELECT 
  a.title as alert_title,
  a.alert_type,
  r.name as resource_name,
  r.type as resource_type,
  r.city,
  ST_Distance_Sphere(
    POINT(r.longitude, r.latitude),
    POINT(a.longitude, a.latitude)
  ) / 1000 as distance_km,
  r.capacity,
  r.current_load,
  (r.capacity - COALESCE(r.current_load, 0)) as available_capacity
FROM alerts a
CROSS JOIN resources r
WHERE a.is_active = TRUE
  AND r.is_active = TRUE
  AND ST_Distance_Sphere(
    POINT(r.longitude, r.latitude),
    POINT(a.longitude, a.latitude)
  ) / 1000 <= 100  -- Within 100km
  AND JSON_CONTAINS(r.disaster_types, JSON_QUOTE(a.alert_type))
ORDER BY a.id, distance_km ASC;

-- 7. Verify Indexes
SHOW INDEX FROM documents;
SHOW INDEX FROM resources;
SHOW INDEX FROM alerts;

-- 8. Performance Test Queries
-- Check query execution plans
EXPLAIN SELECT * FROM documents WHERE MATCH(content) AGAINST('flood emergency');
EXPLAIN SELECT * FROM resources WHERE latitude BETWEEN 12.0 AND 13.0 AND longitude BETWEEN 56.0 AND 57.0;

-- 9. Data Validation
-- Check data integrity and completeness
SELECT 
  'alerts' as table_name,
  COUNT(*) as total_rows,
  COUNT(DISTINCT alert_type) as unique_types,
  AVG(severity) as avg_severity
FROM alerts
UNION ALL
SELECT 
  'documents' as table_name,
  COUNT(*) as total_rows,
  COUNT(DISTINCT category) as unique_categories,
  AVG(confidence) as avg_confidence
FROM documents
UNION ALL
SELECT 
  'resources' as table_name,
  COUNT(*) as total_rows,
  COUNT(DISTINCT type) as unique_types,
  AVG(capacity) as avg_capacity
FROM resources;
