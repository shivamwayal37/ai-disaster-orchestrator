# Disaster Alert Processing Workers

This repository contains the worker services for the AI Disaster Response Orchestrator. It includes:

1. **Ingestion Worker**: Processes incoming disaster alerts and adds them to the processing queue
2. **Embedding Worker**: Generates vector embeddings for alerts using Jina AI and stores them in TiDB
3. **Integration Tests**: End-to-end tests for the complete alert processing pipeline

## Features

- **Asynchronous Processing**: High-performance async architecture for handling thousands of alerts per second
- **Vector Search**: Jina AI-powered semantic search with 1024-dimensional embeddings
- **Reliable Queueing**: Redis-based message queue with retry and dead-letter handling
- **Scalable Architecture**: Horizontally scalable worker processes
- **Real-time Monitoring**: Built-in metrics and statistics collection
- **Comprehensive Testing**: Integration tests for all components

## 🚀 Quick Start

### Prerequisites

- Python 3.9+
- TiDB Cloud or self-hosted TiDB (v6.0+ for vector search)
- Redis 6.0+
- Jina AI API key (for embeddings)
- Node.js 18+ (for running tests)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ai-disaster-orchestrator.git
   cd ai-disaster-orchestrator/packages/workers
   ```

2. Set up Python environment:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On Unix/macOS:
   source venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables in `.env`:
   ```env
   # Database
   TIDB_HOST=your-tidb-host
   TIDB_PORT=4000
   TIDB_USER=your-username
   TIDB_PASSWORD=your-password
   TIDB_DATABASE=disaster_response
   
   # Redis
   REDIS_URL=redis://localhost:6379
   
   # Jina AI
   JINA_API_KEY=your-jina-api-key
   
   # Worker configuration
   EMBEDDING_BATCH_SIZE=10
   LOG_LEVEL=INFO
   ```

## 🛠️ Running the Workers

### Start the Embedding Worker

Process alerts from Redis and generate embeddings:

```bash
python embedding_worker.py \
  --queue alerts \
  --redis-url redis://localhost:6379 \
  --batch-size 10 \
  --log-level INFO
```

### Start the Ingestion Worker

Process incoming alerts and add them to the queue:

```bash
python ingest_worker.py \
  --redis-url redis://localhost:6379 \
  --log-level INFO
```

## 🧪 Running Tests

Run the integration tests:

```bash
pytest test_integration.py -v
```

Or run the test manually:

```bash
python test_integration.py
```

## 📊 Monitoring

View worker statistics in Redis:

```bash
redis-cli HGETALL disaster:stats
```

## 📝 Configuration Reference

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TIDB_HOST` | TiDB server host | - |
| `TIDB_PORT` | TiDB server port | 4000 |
| `TIDB_USER` | Database user | - |
| `TIDB_PASSWORD` | Database password | - |
| `TIDB_DATABASE` | Database name | disaster_response |
| `REDIS_URL` | Redis connection URL | redis://localhost:6379 |
| `JINA_API_KEY` | Jina AI API key | - |
| `EMBEDDING_BATCH_SIZE` | Number of alerts to process in parallel | 10 |
| `LOG_LEVEL` | Logging level (DEBUG, INFO, WARNING, ERROR) | INFO |

# Redis configuration
REDIS_URL=redis://localhost:6379/0

# Jina AI configuration
JINA_API_KEY=your-jina-api-key
JINA_MODEL=jina-embeddings-v3
JINA_BATCH_SIZE=20

# Worker configuration
WORKER_CONCURRENCY=4
WORKER_POLL_INTERVAL=0.1
WORKER_MAX_RETRIES=3

# Logging
LOG_LEVEL=INFO
```

## Usage

### Running the Worker

To start the worker in both alert and embedding processing mode:

```bash
python -m ingest --mode both
```

Available modes:
- `alerts`: Only process incoming alerts
- `embeddings`: Only process embedding tasks
- `both`: Process both alerts and embeddings (default)

### Command Line Options

```
usage: disaster-ingest [-h] [--mode {alerts,embeddings,both}] [--config CONFIG]

AI Disaster Response - Ingestion Worker

options:
  -h, --help            show this help message and exit
  --mode {alerts,embeddings,both}
                        Operation mode: process alerts, embeddings, or both
  --config CONFIG       Path to config file (default: use environment variables)
```

### Programmatic Usage

```python
from ingest.worker import run_worker
from ingest.config import get_config
import asyncio

async def main():
    config = get_config()
    await run_worker(config, mode='both')

if __name__ == "__main__":
    asyncio.run(main())
```

## Architecture

### Components

1. **Alert Consumer**
   - Listens for new alerts in Redis queue
   - Validates and stores alerts in TiDB
   - Creates embedding tasks for processing

2. **Embedding Worker**
   - Processes embedding tasks from Redis queue
   - Generates vector embeddings using Jina AI
   - Updates alerts with embeddings in TiDB

3. **Database Layer**
   - Manages TiDB connections and queries
   - Handles schema operations and migrations
   - Provides vector search capabilities

4. **Configuration**
   - Loads settings from environment variables
   - Validates required configuration
   - Provides type-safe access to settings

## Development

### Setting Up Development Environment

1. Install development dependencies:
   ```bash
   pip install -e ".[dev]"
   ```

2. Run tests:
   ```bash
   pytest tests/
   ```

3. Run with code coverage:
   ```bash
   pytest --cov=ingest tests/
   ```

### Code Style

This project uses `black` for code formatting and `flake8` for linting.

```bash
black src/
flake8 src/
```

## Deployment

### Docker

Build the Docker image:

```bash
docker build -t disaster-ingest-worker .
```

Run the container:

```bash
docker run -d --name ingest-worker \
  --env-file .env \
  disaster-ingest-worker
```

### Kubernetes

Example deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ingest-worker
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ingest-worker
  template:
    metadata:
      labels:
        app: ingest-worker
    spec:
      containers:
      - name: ingest-worker
        image: disaster-ingest-worker:latest
        envFrom:
        - secretRef:
            name: ingest-worker-secrets
        resources:
          limits:
            cpu: "1"
            memory: "512Mi"
        livenessProbe:
          exec:
            command: ["pgrep", "-f", "ingest"]
          initialDelaySeconds: 30
          periodSeconds: 10
```

## Monitoring

The worker outputs structured logs in JSON format when running in production mode. You can use tools like ELK Stack, Loki, or CloudWatch Logs to monitor and analyze the logs.

Key metrics to monitor:
- Number of alerts processed per minute
- Embedding generation latency
- Error rates
- Queue lengths

## License

MIT
