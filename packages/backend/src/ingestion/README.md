# Data Ingestion Pipeline - Day 3

Complete ingestion system for multi-source disaster alerts with Kimi AI processing and TiDB storage.

## Architecture

```
Mock Feeds → Normalize → Kimi AI → TiDB + Queue Embeddings
    ↓           ↓          ↓           ↓
Weather     Common     Summary    Documents
Twitter     Schema     Entities   + Alerts
Satellite              Extract    + Work Queue
Protocols
```

## Components

### Core Services
- **`normalize.js`** - Converts raw data to common schema
- **`kimiClient.js`** - AI summarization and entity extraction
- **`dbInsert.js`** - Database insertion with embedding queue
- **`orchestrator.js`** - Pipeline coordination and scheduling

### Source Ingestors
- **`weatherIngest.js`** - Weather alerts (15min intervals)
- **`twitterIngest.js`** - Social media alerts (5min intervals)  
- **`satelliteIngest.js`** - Satellite data (30min intervals)
- **`protocolIngest.js`** - Emergency protocols (6hr intervals)

## Quick Start

### 1. Setup Environment
```bash
# Copy and configure environment
cp .env.example .env
# Add your TiDB and Kimi API credentials
```

### 2. Database Setup
```bash
# Run migrations
npm run db:migrate

# Test database connection
npm run db:test
```

### 3. Manual Pipeline Test
```bash
# Test complete pipeline
node src/ingestion/test-pipeline.js full

# Test individual source
node src/ingestion/test-pipeline.js source weather
```

### 4. Run Ingestion

#### One-time Manual Run
```bash
# All sources
node src/ingestion/orchestrator.js run

# Single source
node src/ingestion/orchestrator.js run weather
node src/ingestion/orchestrator.js run twitter
node src/ingestion/orchestrator.js run satellite
node src/ingestion/orchestrator.js run protocol
```

#### Scheduled Ingestion
```bash
# Start scheduler (runs in background)
node src/ingestion/orchestrator.js start

# Check scheduler status
node src/ingestion/orchestrator.js status
```

## Data Flow

### 1. Raw Data Sources
- **Weather**: JSON alerts with event details
- **Twitter**: Social media posts with location/hashtags
- **Satellite**: GeoJSON features with coordinates
- **Protocols**: Emergency response documents

### 2. Normalization
All sources converted to common schema:
```javascript
{
  id: "unique_id",
  source: "weather|twitter|satellite|protocol", 
  timestamp: "2024-01-01T00:00:00Z",
  text: "Alert content...",
  location: { lat: 40.7128, lng: -74.0060 },
  meta: { /* source-specific metadata */ }
}
```

### 3. Kimi AI Processing
- **Summarization**: Concise actionable summaries
- **Entity Extraction**: Disaster type, severity, locations, urgency, key actions
- **Fallback**: Heuristic processing if API fails

### 4. Database Storage
- **Documents**: Full-text searchable content with embeddings
- **Alerts**: Real-time alerts with geolocation
- **Work Queue**: Embedding generation tasks
- **Action Audit**: Ingestion run logs

## Monitoring

### Pipeline Logs
```bash
# View recent ingestion logs
node -e "
const { prisma } = require('./src/db');
prisma.actionAudit.findMany({
  where: { action: { startsWith: 'INGEST_' } },
  orderBy: { createdAt: 'desc' },
  take: 10
}).then(logs => console.log(JSON.stringify(logs, null, 2)));
"
```

### Database Stats
```bash
# Check insertion counts
node -e "
const { prisma } = require('./src/db');
Promise.all([
  prisma.document.count(),
  prisma.alert.count(),
  prisma.workQueue.count()
]).then(([docs, alerts, queue]) => 
  console.log({ documents: docs, alerts, workQueue: queue })
);
"
```

## Configuration

### Environment Variables
```bash
# TiDB Connection
TIDB_HOST=gateway01.us-west-2.prod.aws.tidbcloud.com
TIDB_PORT=4000
TIDB_USER=your_user
TIDB_PASSWORD=your_password
TIDB_DATABASE=your_database
DATABASE_URL="mysql://user:pass@host:port/db"

# Kimi API
KIMI_API_KEY=your_kimi_key
KIMI_BASE_URL=https://api.moonshot.cn/v1
```

### Scheduling Intervals
- Weather: Every 15 minutes
- Twitter: Every 5 minutes  
- Satellite: Every 30 minutes
- Protocols: Every 6 hours

## Error Handling

### Graceful Degradation
- Kimi API failures → Fallback heuristics
- Database errors → Logged but don't stop pipeline
- Individual source failures → Other sources continue

### Retry Logic
- Network timeouts: 3 retries with exponential backoff
- Rate limits: Respect API limits with delays
- Database conflicts: Retry with jitter

## Performance

### Expected Throughput
- Weather: ~10 alerts per run
- Twitter: ~20 alerts per run
- Satellite: ~5 alerts per run  
- Protocols: ~3 documents per run

### Optimization
- Parallel processing within sources
- Batch database insertions
- Async embedding queue
- Connection pooling

## Troubleshooting

### Common Issues

**Database Connection Fails**
```bash
# Test connection
node scripts/test-db.js
```

**Kimi API Errors**
- Check API key in `.env`
- Verify rate limits not exceeded
- Review fallback processing logs

**No Data Ingested**
- Check mock feeds return data
- Verify normalization doesn't filter all records
- Check database permissions

**High Error Rates**
- Review logs for specific error patterns
- Check data source format changes
- Verify schema compatibility

### Debug Mode
```bash
# Enable debug logging
DEBUG=* node src/ingestion/orchestrator.js run
```

## Next Steps

1. **Real Data Sources**: Replace mock feeds with actual APIs
2. **Message Queue**: Add Redis/Kafka for scalable task processing  
3. **Monitoring**: Add Prometheus metrics and health checks
4. **Alerting**: Set up failure notifications
5. **Performance**: Optimize for higher throughput

## API Integration

### Weather APIs
- OpenWeatherMap API
- National Weather Service
- NOAA alerts

### Social Media APIs  
- Twitter API v2
- Reddit API
- Facebook Graph API

### Satellite APIs
- NASA FIRMS
- Copernicus Emergency Management
- USGS Earthquake feeds
