# Retrieval & Hybrid Search System - Day 4

Complete hybrid search and RAG system for disaster response with TiDB vector search and Kimi AI integration.

## Architecture

```
Query → Entity Extraction → Parallel Search → Context Preparation → RAG Generation
  ↓           ↓                ↓                    ↓                ↓
Input     Kimi API      Full-text + Vector     JSON Context      Kimi RAG
Query     Entities      TiDB Hybrid Search     Preparation       Response
```

## Core Components

### Search Services
- **`searchService.js`** - Hybrid search with full-text + vector similarity
- **`retrieverService.js`** - RAG orchestration and context preparation
- **`routes/retrieve.js`** - REST API endpoints for search and retrieval

### Search Methods

#### 1. Full-Text Search
```javascript
// Uses TiDB MATCH() AGAINST() with relevance scoring
const results = await fullTextSearch('flooding coastal areas', 10);
```

#### 2. Vector Similarity Search  
```javascript
// TiDB Vector Search with cosine distance
const results = await vectorSearch(queryEmbedding, 10);
```

#### 3. Hybrid Search (Recommended)
```javascript
// Weighted combination: 0.6 * vector + 0.4 * text
const results = await hybridSearch(query, embedding, {
  textWeight: 0.4,
  vectorWeight: 0.6,
  limit: 10
});
```

## API Endpoints

### POST /api/retrieve
Main RAG endpoint with full context retrieval and response generation.

```bash
curl -X POST http://localhost:3001/api/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Flooding in coastal region",
    "maxResults": 10,
    "textWeight": 0.4,
    "vectorWeight": 0.6,
    "includeProtocols": true,
    "location": "Mumbai"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "Flooding in coastal region",
    "extractedEntities": {
      "disaster_type": "flood",
      "severity": "moderate",
      "locations": ["coastal region"],
      "urgency": "immediate"
    },
    "retrievedContext": {
      "incidents": [...],
      "protocols": [...]
    },
    "ragResponse": "Based on similar flooding incidents...",
    "metadata": {
      "totalIncidents": 5,
      "totalProtocols": 3,
      "searchTime": 245,
      "ragTime": 1200,
      "totalTime": 1500
    }
  }
}
```

### POST /api/retrieve/search
Direct hybrid search without RAG generation.

```bash
curl -X POST http://localhost:3001/api/retrieve/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "earthquake urban area",
    "searchType": "hybrid",
    "limit": 5
  }'
```

### POST /api/retrieve/disaster
Disaster-specific context retrieval.

```bash
curl -X POST http://localhost:3001/api/retrieve/disaster \
  -H "Content-Type: application/json" \
  -d '{
    "disasterType": "cyclone",
    "location": "eastern coast"
  }'
```

### GET /api/retrieve/stats
Retrieval performance statistics.

```bash
curl http://localhost:3001/api/retrieve/stats?hours=24
```

### POST /api/retrieve/test
Run test scenarios for validation.

```bash
curl -X POST http://localhost:3001/api/retrieve/test
```

## Hybrid Scoring Algorithm

The system combines full-text and vector search results using weighted scoring:

```
hybridScore = (textWeight × textRelevance) + (vectorWeight × vectorSimilarity)
```

**Default Weights:**
- Text Weight: 0.4 (40%)
- Vector Weight: 0.6 (60%)

**Text Relevance Calculation:**
- Term frequency matching
- Content + title + summary search
- Confidence score boosting
- Normalized by query length

**Vector Similarity:**
- Cosine distance in TiDB: `VEC_COSINE_DISTANCE(embedding, query_vector)`
- Converted to similarity: `1 - cosine_distance`
- 768-dimensional embeddings (bge-large-en compatible)

## RAG Context Structure

```json
{
  "query_entities": {
    "disaster_type": "flood",
    "severity": "high", 
    "locations": ["Mumbai", "coastal areas"],
    "urgency": "immediate"
  },
  "similar_incidents": [
    {
      "id": 123,
      "title": "Mumbai Floods 2019",
      "summary": "Heavy rainfall caused widespread flooding...",
      "disaster_type": "flood",
      "severity": "high",
      "location": "Mumbai",
      "hybrid_score": 0.85,
      "date": "2019-07-15"
    }
  ],
  "relevant_protocols": [
    {
      "id": 456,
      "title": "Urban Flood Response Protocol",
      "summary": "Standard operating procedures for urban flooding...",
      "key_actions": [
        "Evacuate low-lying areas",
        "Deploy rescue boats",
        "Establish relief centers"
      ],
      "authority": "NDMA"
    }
  ]
}
```

## Performance Optimization

### Search Performance
- **Parallel Execution**: Full-text and vector searches run concurrently
- **Result Caching**: Frequently accessed documents cached in memory
- **Index Optimization**: Full-text indexes on content, title, summary
- **Vector Indexes**: HNSW indexes for fast similarity search

### Expected Response Times
- **Full-text Search**: 50-100ms
- **Vector Search**: 100-200ms  
- **Hybrid Search**: 150-250ms
- **RAG Generation**: 800-1500ms
- **Total Retrieval**: 1000-2000ms

### Scaling Considerations
- **Connection Pooling**: Database connection reuse
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Memory Management**: Large result set pagination
- **Error Recovery**: Graceful fallbacks for API failures

## Testing & Validation

### Run Complete Test Suite
```bash
node src/tests/test-retrieval.js
```

### Individual Test Components
```bash
# Test query retrieval
node src/tests/test-retrieval.js queries

# Test hybrid scoring
node src/tests/test-retrieval.js scoring

# Test logging system
node src/tests/test-retrieval.js logging

# Test database setup
node src/tests/test-retrieval.js database
```

### Expected Test Results
- **Query Success Rate**: >90%
- **Average Response Time**: <2000ms
- **Hybrid vs Text-only**: 15-25% relevance improvement
- **Hybrid vs Vector-only**: 10-20% relevance improvement

## Monitoring & Analytics

### Retrieval Logs
All retrieval operations logged to `action_audit` table:
```sql
SELECT * FROM action_audit 
WHERE action = 'RETRIEVE_RAG' 
ORDER BY created_at DESC;
```

### Performance Metrics
- Query frequency analysis
- Response time distributions  
- Success/failure rates
- Popular disaster types
- Geographic query patterns

### Health Checks
```bash
# Server health
curl http://localhost:3001/health

# Retrieval stats
curl http://localhost:3001/api/retrieve/stats

# Test scenarios
curl -X POST http://localhost:3001/api/retrieve/test
```

## Configuration

### Environment Variables
```bash
# TiDB Connection (inherited from Day 2)
DATABASE_URL="mysql://user:pass@host:port/db"

# Kimi API (inherited from Day 3)
KIMI_API_KEY="your_kimi_key"
KIMI_BASE_URL="https://api.moonshot.cn/v1"

# Server Configuration
PORT=3001
NODE_ENV=production
FRONTEND_URL=http://localhost:3000
```

### Search Tuning
```javascript
// Adjust hybrid weights based on use case
const options = {
  textWeight: 0.3,    // Reduce for better semantic matching
  vectorWeight: 0.7,  // Increase for concept similarity
  minTextScore: 0.1,  // Filter low-relevance text matches
  minVectorScore: 0.2 // Filter distant vector matches
};
```

## Integration Examples

### Basic Retrieval
```javascript
const { retrieveAndGenerate } = require('./services/retrieverService');

const result = await retrieveAndGenerate('Cyclone approaching coast', {
  maxResults: 5,
  includeProtocols: true,
  location: 'Odisha'
});

console.log(result.ragResponse);
```

### Custom Search
```javascript
const { hybridSearch } = require('./services/searchService');

const results = await hybridSearch(query, embedding, {
  textWeight: 0.5,
  vectorWeight: 0.5,
  category: 'report' // Only search incident reports
});
```

### Protocol Lookup
```javascript
const { searchProtocols } = require('./services/searchService');

const protocols = await searchProtocols('earthquake', 'Delhi', 3);
```

## Troubleshooting

### Common Issues

**No Search Results**
- Check if documents exist: `SELECT COUNT(*) FROM Document`
- Verify full-text indexes: `SHOW INDEX FROM Document`
- Test with simpler queries

**Vector Search Fails**
- Confirm embeddings exist: `SELECT COUNT(*) FROM Document WHERE embedding IS NOT NULL`
- Check vector index: `SHOW INDEX FROM Document WHERE Key_name LIKE '%embedding%'`
- Validate embedding dimensions (should be 768)

**RAG Generation Errors**
- Verify Kimi API key in environment
- Check API rate limits and quotas
- Review context size (max ~8K tokens)

**Slow Performance**
- Monitor database connection pool
- Check TiDB cluster performance
- Review query complexity and result sizes

### Debug Mode
```bash
# Enable detailed logging
DEBUG=* node src/app.js

# Test specific components
node src/tests/test-retrieval.js database
```

## Next Steps

1. **Real Embeddings**: Replace mock embeddings with actual embedding service
2. **Advanced RAG**: Multi-step reasoning and chain-of-thought prompting
3. **Caching Layer**: Redis cache for frequent queries
4. **Real-time Updates**: WebSocket notifications for new incidents
5. **Analytics Dashboard**: Query analytics and performance monitoring

## API Documentation

Complete OpenAPI/Swagger documentation available at `/api/docs` when server is running.

Example queries and responses in `examples/` directory.
