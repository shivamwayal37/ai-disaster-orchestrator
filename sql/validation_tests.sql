-- Day 2 Validation Tests - TiDB Vector + Full-Text Search
-- Run these queries to verify the schema and search functionality

-- 1. Verify tables exist
SHOW TABLES LIKE '%documents%';
SHOW TABLES LIKE '%alerts%';
SHOW TABLES LIKE '%resources%';

-- 2. Check documents table structure
DESCRIBE documents;

-- 3. Verify indexes exist
SHOW INDEX FROM documents WHERE Key_name LIKE '%content%';
SHOW INDEX FROM documents WHERE Key_name LIKE '%embedding%';

-- 4. Insert sample test data
INSERT INTO documents (title, content, category, source_url, metadata) VALUES
('Weather Alert: Severe Flooding Expected', 
 'URGENT: National Weather Service issues severe flood warning for Riverdale District. Heavy rainfall expected to continue for next 6 hours. Residents in low-lying areas should evacuate immediately. Emergency shelters available at Community Center and High School.', 
 'report', 
 'https://weather.gov/alerts/flood-001',
 JSON_OBJECT('source', 'weather', 'severity', 4, 'location', 'Riverdale District', 'timestamp', NOW())),

('Twitter: Wildfire Evacuation Reports', 
 'Multiple reports from Pine Valley residents about wildfire smoke and mandatory evacuation orders. Highway 101 closed due to poor visibility. Red Cross shelter set up at Memorial Hospital parking lot. #WildfireAlert #Evacuation', 
 'social_media', 
 'https://twitter.com/emergency_alerts/status/123456',
 JSON_OBJECT('source', 'twitter', 'severity', 3, 'location', 'Pine Valley', 'hashtags', JSON_ARRAY('WildfireAlert', 'Evacuation'))),

('Emergency Response Protocol: Flood Management', 
 'Standard Operating Procedure for Flood Response: 1. Assess water levels and flow rates 2. Deploy sandbags to vulnerable areas 3. Coordinate evacuation of at-risk populations 4. Establish emergency shelters 5. Monitor weather conditions continuously 6. Communicate with utility companies regarding power safety', 
 'protocol', 
 'https://emergency.gov/protocols/flood-response.pdf',
 JSON_OBJECT('source', 'protocol', 'document_type', 'SOP', 'version', '2.1', 'last_updated', '2024-01-15'));

-- 5. Test Full-Text Search
SELECT 
  id,
  title,
  category,
  LEFT(content, 100) as content_preview,
  MATCH(content) AGAINST('flood evacuation emergency' IN NATURAL LANGUAGE MODE) as relevance_score
FROM documents 
WHERE MATCH(content) AGAINST('flood evacuation emergency' IN NATURAL LANGUAGE MODE)
ORDER BY relevance_score DESC;

-- 6. Test specific keyword searches
SELECT id, title, category FROM documents 
WHERE MATCH(content) AGAINST('flood' IN NATURAL LANGUAGE MODE);

SELECT id, title, category FROM documents 
WHERE MATCH(content) AGAINST('wildfire evacuation' IN NATURAL LANGUAGE MODE);

SELECT id, title, category FROM documents 
WHERE MATCH(content) AGAINST('emergency shelter' IN NATURAL LANGUAGE MODE);

-- 7. Test JSON metadata queries
SELECT 
  id, 
  title,
  JSON_EXTRACT(metadata, '$.source') as source,
  JSON_EXTRACT(metadata, '$.severity') as severity,
  JSON_EXTRACT(metadata, '$.location') as location
FROM documents
WHERE JSON_EXTRACT(metadata, '$.source') = 'weather';

-- 8. Vector search preparation (placeholder for when embeddings are added)
-- This will work once we add actual vector embeddings
/*
SELECT 
  id,
  title,
  category,
  VEC_COSINE_DISTANCE(embedding, CAST('[0.1,0.2,0.3,...]' AS VECTOR(768))) as similarity_score
FROM documents 
WHERE embedding IS NOT NULL
ORDER BY similarity_score ASC
LIMIT 5;
*/

-- 9. Verify sample data was inserted
SELECT COUNT(*) as total_documents FROM documents;
SELECT category, COUNT(*) as count FROM documents GROUP BY category;

-- 10. Test combined search (metadata + full-text)
SELECT 
  d.id,
  d.title,
  d.category,
  JSON_EXTRACT(d.metadata, '$.source') as source,
  JSON_EXTRACT(d.metadata, '$.severity') as severity,
  MATCH(d.content) AGAINST('emergency' IN NATURAL LANGUAGE MODE) as text_relevance
FROM documents d
WHERE MATCH(d.content) AGAINST('emergency' IN NATURAL LANGUAGE MODE)
   OR JSON_EXTRACT(d.metadata, '$.severity') >= 3
ORDER BY text_relevance DESC;
