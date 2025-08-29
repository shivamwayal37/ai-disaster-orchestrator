# AI Disaster Response Orchestrator

Intelligent multi-step disaster response coordination system using TiDB Serverless with vector search and LLM orchestration.

## Architecture

```mermaid
flowchart LR
    A[APIs: Weather/Twitter/NASA] --> B[Ingestion Worker]
    B --> C[TiDB.live_incidents]
    C --> D[Embedding Worker]
    D --> E[TiDB: vector + full-text]
    F[Incident Trigger] --> G[LLM Orchestrator]
    G --> H[Vector + Full-text Retrieval]
    H --> I[LLM Plan Generation]
    I --> J[Route Planner Maps API]
    J --> K[Twilio SMS Notifier]
    E --> H
```

## Tech Stack

- **Frontend**: Next.js + Tailwind CSS (Vercel)
- **Backend**: Node.js + Express API Gateway
- **Workers**: Python ingestion & embedding workers
- **Database**: TiDB Serverless with vector + full-text search
- **Actions**: Google Maps API + Twilio SMS
- **Deployment**: Docker + GitHub Actions CI/CD

## Project Structure

```
ai-disaster-orchestrator/
├── packages/
│   ├── frontend/          # Next.js dashboard
│   ├── backend/           # Express API gateway
│   └── workers/           # Python ingestion & embedding
├── sql/                   # TiDB schema
├── .env.example          # Environment variables
├── docker-compose.yml    # Local development
└── README.md
```

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.11+
- Docker & Docker Compose
- TiDB Cloud account
- Kimi API key (from [Moonshot AI](https://platform.moonshot.cn/console/api-keys))

### Setup

1. **Clone and install dependencies**:

3. Install dependencies:
   ```bash
   npm install
   cd packages/backend && npm install
   cd ../../
   ```

4. **Set up TiDB database**:
```bash
# Run the SQL schema in your TiDB Cloud instance
mysql -h <tidb-host> -u <user> -p < sql/create_tables.sql
```

5. **Apply the Kimi embedding dimension update**:
   ```bash
   mysql -h your-tidb-host -u your-username -p < sql/migrations/20240829_update_embedding_dimensions.sql
   ```

### Running the Application

1. Start the database and services:
   ```bash
   docker-compose up -d
   ```

2. Run database migrations:
   ```bash
   cd packages/backend
   npx prisma migrate deploy
   ```

3. Start the backend server:
   ```bash
   npm run dev
   ```

4. In a separate terminal, start the embedding worker:
   ```bash
   cd packages/backend
   node src/workers/embeddingWorker.js
   ```

### Environment Variables

Copy `.env.example` to `.env` and configure:

- **TiDB**: Connection details from TiDB Cloud
- **OpenAI**: API key for LLM orchestration
- **Google Maps**: API key for route generation
- **Twilio**: SID, token, and phone number for SMS

## Core Features

### Multi-Step Agent Workflow

1. **Ingest**: Pull alerts from OpenWeather, Twitter, NASA
2. **Embed**: Generate vector embeddings for text and images
3. **Retrieve**: Hybrid search (vector + full-text) for similar incidents
4. **Reason**: LLM generates structured action plans
5. **Act**: Create routes and send SMS notifications

### API Endpoints

- `POST /api/incidents/ingest` - Ingest new incident
- `GET /api/incidents/:id` - Get incident details
- `POST /api/incidents/:id/plan` - Generate response plan
- `POST /api/incidents/:id/route` - Generate evacuation routes
- `POST /api/incidents/:id/notify` - Send SMS notifications

## Day 1 — Completed 

- [x] Created TiDB Cloud account and noted DB connection info
- [x] Initialized monorepo with npm workspaces
- [x] Scaffolded frontend (Next.js), backend (Express), and workers (Python)
- [x] Created `.env.example` with required secrets
- [x] Added initial SQL schema `sql/create_tables.sql`
- [x] Added Docker/Docker Compose skeleton
- [x] Added CI skeleton with GitHub Actions
- [x] Created comprehensive README

## Day 2 — Completed 

- [x] **Enhanced Database Schema**: Complete TiDB schema with vector + full-text support
- [x] **Prisma Integration**: Type-safe database client with migrations
- [x] **Vector Search Ready**: `VECTOR(768)` columns with HNSW indexes for semantic search
- [x] **Full-Text Search**: MySQL `MATCH() AGAINST()` indexes on content fields
- [x] **Search API Endpoints**: `/api/search/*` with hybrid, geospatial, and keyword search
- [x] **Sample Data**: Test documents (weather alerts, protocols, social media)
- [x] **Validation Scripts**: Automated tests for schema and search functionality
- [x] **Idempotent Migrations**: Re-runnable SQL scripts for TiDB deployment

## Database Schema (Day 2)

### Core Tables

**`documents`** - Content with vector embeddings
- `id` (BIGINT AUTO_INCREMENT) - Primary key
- `content` (TEXT) - Raw document content  
- `embedding` (VECTOR(768)) - Text embedding for semantic search
- `category` (VARCHAR) - document type (protocol, report, social_media)
- `metadata` (JSON) - Structured fields (source, severity, location)
- Full-text index: `MATCH(content) AGAINST('query')`
- Vector index: `HNSW` for similarity search

**`alerts`** - Disaster alerts with geolocation
**`resources`** - Relief centers, hospitals, shelters with capacity tracking

### Search Capabilities

- **Full-Text**: `MATCH() AGAINST()` with relevance scoring
- **Vector**: Semantic similarity using HNSW indexes  
- **Hybrid**: Weighted combination (α=0.6 text + 0.4 vector)
- **Geospatial**: Distance-based resource discovery

### Validation

Run database tests:
```bash
cd packages/backend
npm run db:test
```

## Next Steps (Day 3+)

1. **Real-time Ingestion**: OpenWeather/Twitter/NASA API integration
2. **Embedding Generation**: OpenAI/local model pipeline
3. **LLM Orchestration**: Structured plan generation with JSON schema
4. **Actions**: Google Maps routing + Twilio SMS integration

## Development

### Running Tests
```bash
npm test                    # All tests
npm run lint               # Linting
```

### Database Migrations
```bash
# Apply schema changes to TiDB
mysql -h <tidb-host> -u <user> -p < sql/create_tables.sql
```

### Python Workers
```bash
cd packages/workers
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
python ingest_worker.py
python embedding_worker.py
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Demo

Coming soon: <4 minute demo video showing end-to-end disaster response workflow.

---

**Built for TiDB Hackathon 2025** - Showcasing TiDB Serverless vector search in a real-world multi-step agent application.
