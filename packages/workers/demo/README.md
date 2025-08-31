# Ingestion Worker Demo

This directory contains a demo script to test the end-to-end flow of the ingestion worker.

## Prerequisites

1. Python 3.8+
2. Redis server running (default: localhost:6379)
3. TiDB database with the disaster response schema
4. Jina AI API key

## Setup

1. Install the required dependencies:
   ```bash
   pip install -r requirements-demo.txt
   ```

2. Create a `.env` file in the `packages/workers` directory with the following variables:
   ```env
   # Database configuration
   TIDB_HOST=your-tidb-host
   TIDB_PORT=4000
   TIDB_USER=your-username
   TIDB_PASSWORD=your-password
   TIDB_DATABASE=disaster_response

   # Redis configuration
   REDIS_URL=redis://localhost:6379/0

   # Jina AI configuration
   JINA_API_KEY=your-jina-api-key
   ```

## Running the Demo

1. Start the ingestion worker in one terminal:
   ```bash
   # From the project root
   cd packages/workers
   python -m ingest --mode both
   ```

2. In another terminal, run the demo script:
   ```bash
   # From the demo directory
   cd packages/workers/demo
   python demo_ingestion_flow.py --count 3
   ```

   The `--count` parameter specifies how many test alerts to send (default: 3).

## What the Demo Does

1. **Setup**:
   - Connects to Redis and TiDB
   - Clears any existing data from the queues

2. **Sending Alerts**:
   - Sends the specified number of test alerts to the Redis queue
   - Each alert contains realistic disaster data (floods, earthquakes, etc.)

3. **Processing**:
   - The ingestion worker picks up the alerts
   - Processes them through the pipeline
   - Generates embeddings using Jina AI
   - Stores the results in TiDB

4. **Verification**:
   - Checks that all alerts were processed correctly
   - Verifies that embeddings were generated and stored
   - Runs an example vector search to find similar alerts

## Sample Output

```
🚀 Starting ingestion flow demo
==================================================

🔌 Connecting to services...
✅ Connected to Redis
✅ Connected to TiDB

🧹 Cleaning up...
🧹 Cleared Redis queues

📤 Sending 3 test alerts...
📤 Sent alert 1/3: Flood in Mumbai, India
📤 Sent alert 2/3: Cyclone in Bay of Bengal
📤 Sent alert 3/3: Earthquake in Uttarakhand, India

⏳ Waiting for worker to process alerts (this may take a minute)...
⏳ Still processing...
✅ Alert demo_1623456789_1 processed successfully (weather_api - flood)
✅ Alert demo_1623456789_2 processed successfully (ndrf - cyclone)
✅ Alert demo_1623456789_3 processed successfully (twitter - earthquake)

✅ All alerts processed successfully!

📊 Demo Summary:
- Sent 3 alerts
- All alerts processed and stored with embeddings

🔍 Running example vector search...

🔎 Searching for similar alerts to: 'Cyclone warning: Severe cyclonic storm expected to make landfall in 36 hours...'

Top 3 similar alerts:

1. Similarity: 0.8765
   Type: cyclone
   Content: Tropical storm forming in Arabian Sea, expected to intensify...

2. Similarity: 0.7654
   Type: flood
   Content: Heavy rainfall causing flooding in coastal areas...

3. Similarity: 0.6543
   Type: earthquake
   Content: Tsunami warning issued after undersea earthquake...
```

## Troubleshooting

1. **Connection Issues**:
   - Make sure Redis and TiDB are running
   - Check that the connection details in `.env` are correct
   - Verify that the Jina API key is valid

2. **Processing Errors**:
   - Check the worker logs for error messages
   - Make sure you have enough API credits for Jina AI
   - Verify that the database schema is set up correctly

3. **Slow Performance**:
   - The demo includes artificial delays to simulate real-world conditions
   - Increase the timeout in the script if needed
   - Check your network connection to Jina AI

## Customization

You can modify the test data in `demo_ingestion_flow.py` to include your own alert types and content. The script is designed to be easily extendable.
