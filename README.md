# 🚨 AI Disaster Response Orchestrator

> **TiDB Hackathon 2025 Submission** - Intelligent multi-step disaster response coordination system powered by TiDB Serverless vector search and LLM orchestration.

[![Demo](https://img.shields.io/badge/🎥_Demo-Watch_Video-red?style=for-the-badge)](https://your-demo-link.com)
[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-Try_Now-blue?style=for-the-badge)](https://your-deployment-url.com)
[![Documentation](https://img.shields.io/badge/📚_Docs-Read_More-green?style=for-the-badge)](./docs/)

## 🎯 **What This Does**

**End-to-End Automated Disaster Response**: From alert ingestion to action plan execution in under 15 seconds.

1. **🔍 Ingests** disaster alerts from multiple sources (weather APIs, social media, satellites)
2. **🧠 Processes** with AI to extract entities and assess severity  
3. **📊 Searches** similar historical incidents using TiDB vector + full-text search
4. **🤖 Generates** structured response plans with LLM orchestration
5. **🚀 Executes** actions: evacuation routes (Google Maps) + mass SMS (Twilio)

## 🏗️ **System Architecture**

```mermaid
flowchart TB
    subgraph "Data Sources"
        A1[🌤️ OpenWeather API]
        A2[🐦 Twitter API]  
        A3[🛰️ NASA FIRMS]
        A4[📋 Emergency Protocols]
    end
    
    subgraph "Ingestion Layer"
        B[🔄 Multi-Source Ingestion Worker]
    end
    
    subgraph "TiDB Serverless"
        C1[📊 Alerts Table + Vector Index]
        C2[📚 Documents + Full-Text Search]
        C3[🏥 Resources + Geospatial Index]
    end
    
    subgraph "AI Processing"
        D1[🧠 Kimi AI - Entity Extraction]
        D2[🔍 Hybrid Search Engine]
        D3[🤖 OpenAI - Response Planning]
    end
    
    subgraph "Action Layer"
        E1[🗺️ Google Maps - Routing]
        E2[📱 Twilio - Mass SMS]
        E3[📡 Real-time Dashboard]
    end
    
    A1 & A2 & A3 & A4 --> B
    B --> C1 & C2 & C3
    C1 & C2 & C3 --> D2
    D1 --> C1
    D2 --> D3
    D3 --> E1 & E2 & E3
```

## 🚀 **Quick Start** (5 minutes to demo)

### Option 1: One-Command Docker Setup
```bash
git clone https://github.com/your-username/ai-disaster-orchestrator.git
cd ai-disaster-orchestrator
cp .env.example .env
# Edit .env with your API keys (see setup guide below)
npm run demo:start
```

### Option 2: Development Setup
```bash
git clone https://github.com/your-username/ai-disaster-orchestrator.git
cd ai-disaster-orchestrator
npm install
npm run setup:dev
npm run dev
```

🌐 **Frontend**: http://localhost:3000  
🔧 **Backend API**: http://localhost:3001  
📊 **Health Check**: http://localhost:3001/api/health

## 🛠️ **Tech Stack**

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | Next.js 15 + Tailwind CSS | Real-time dashboard with SSE streaming |
| **Backend** | Node.js + Express + Prisma | REST API with rate limiting & validation |
| **Database** | **TiDB Serverless** | Vector search + full-text + geospatial |
| **AI Services** | Kimi AI + OpenAI | Entity extraction + response planning |
| **Actions** | Google Maps + Twilio | Route optimization + mass notifications |
| **Deployment** | Docker + Vercel + Railway | Containerized multi-service deployment |

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
