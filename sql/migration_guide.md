# Database Migration Guide - Day 2

## Prerequisites

1. **TiDB Cloud Account**: Sign up at [TiDB Cloud](https://tidbcloud.com/)
2. **Create TiDB Serverless Cluster**: 
   - Choose "Serverless" tier for development
   - Note down connection details (host, port, username, password)
3. **Update Environment Variables**: Copy `.env.example` to `.env` and fill in your TiDB credentials

## Migration Steps

### Step 1: Install Dependencies
```bash
cd packages/backend
npm install
```

### Step 2: Configure Database URL
Update your `.env` file with the correct TiDB connection string:
```env
DATABASE_URL="mysql://[username]:[password]@[host]:[port]/disaster_db?sslaccept=strict"
```

### Step 3: Generate Prisma Client
```bash
npm run db:generate
```

### Step 4: Push Schema to TiDB
```bash
# Option 1: Use Prisma (recommended for development)
npm run db:push

# Option 2: Run SQL directly (if Prisma has issues with VECTOR type)
mysql -h [host] -P [port] -u [username] -p < ../../sql/schema.sql
```

### Step 5: Verify Migration
```bash
# Start the backend server
npm run dev

# Test health endpoint (should show database: connected)
curl http://localhost:4000/health
```

## Vector Index Setup

TiDB Cloud supports vector search with the following syntax:

```sql
-- Add vector columns (if not already present)
ALTER TABLE documents ADD COLUMN embedding VECTOR(1536);
ALTER TABLE resources ADD COLUMN embedding VECTOR(1536);

-- Create vector indexes
CREATE INDEX idx_documents_embedding ON documents(embedding) USING HNSW;
CREATE INDEX idx_resources_embedding ON resources(embedding) USING HNSW;
```

## Testing Queries

Run the test queries from `sql/test_queries.sql`:

```bash
# Connect to your TiDB instance
mysql -h [host] -P [port] -u [username] -p disaster_db

# Run test queries
source sql/test_queries.sql
```

## Expected Results

After successful migration, you should have:

1. **5 Tables Created**:
   - `alerts` - Disaster alerts with geolocation
   - `documents` - Content with vector embeddings
   - `resources` - Relief resources with capacity tracking
   - `action_audit` - Action logging
   - `work_queue` - Background task management

2. **Indexes Created**:
   - Full-text indexes on content fields
   - Vector indexes for semantic search
   - Geospatial indexes for location queries
   - Performance indexes on frequently queried fields

3. **Sample Data Inserted**:
   - 3 sample alerts (flood, wildfire, earthquake)
   - 3 sample documents (response protocols)
   - 3 sample resources (shelter, hospital, fire station)

## Troubleshooting

### Common Issues:

1. **Vector Type Not Supported**: 
   - Ensure you're using TiDB Cloud (not local MySQL)
   - Vector support requires TiDB v6.5+

2. **Connection Timeout**:
   - Check firewall settings
   - Verify connection string format
   - Ensure TiDB cluster is running

3. **Prisma Schema Sync Issues**:
   - Use `npm run db:push` instead of migrations for development
   - Vector types may need manual SQL execution

### Verification Commands:

```sql
-- Check tables exist
SHOW TABLES;

-- Check indexes
SHOW INDEX FROM documents;
SHOW INDEX FROM resources;

-- Verify sample data
SELECT COUNT(*) FROM alerts;
SELECT COUNT(*) FROM documents;
SELECT COUNT(*) FROM resources;

-- Test full-text search
SELECT * FROM documents WHERE MATCH(content) AGAINST('flood');
```

## Next Steps (Day 3)

Once migration is complete, you'll be ready for:
- Real-time data ingestion from APIs
- Vector embedding generation
- Hybrid search implementation
- LLM orchestration integration
