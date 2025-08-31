#!/usr/bin/env python3
"""
Integration test for the disaster alert processing pipeline.
Tests the complete flow: alert ingestion → Redis queue → embedding generation → database update
"""

import asyncio
import json
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Dict, Any

import redis.asyncio as redis
import pytest
from dotenv import load_dotenv

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('test_integration.log')
    ]
)
logger = logging.getLogger("test_integration")

# Test configuration
TEST_QUEUE = "test:alerts"
TEST_EMBEDDING_QUEUE = "test:embeddings"
TEST_STATS_QUEUE = "test:stats"

class TestIntegration:
    """Integration tests for the disaster alert processing pipeline"""
    
    @pytest.fixture(autouse=True)
    async def setup_redis(self):
        """Set up Redis connection for testing"""
        self.redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")
        self.redis = redis.Redis.from_url(
            self.redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5
        )
        await self.redis.ping()
        
        # Clear test queues
        await self.redis.delete(TEST_QUEUE, TEST_EMBEDDING_QUEUE, TEST_STATS_QUEUE)
        
        yield
        
        # Cleanup
        await self.redis.close()
    
    async def generate_test_alert(self) -> Dict[str, Any]:
        """Generate a test alert"""
        return {
            "id": f"test_alert_{uuid.uuid4().hex[:8]}",
            "type": "earthquake",
            "severity": 3,
            "location": "San Francisco, CA",
            "coordinates": {"lat": 37.7749, "lng": -122.4194},
            "description": "Test earthquake alert for integration testing. "
                          "This alert will be processed by the embedding worker.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "metadata": {
                "test": True,
                "magnitude": 5.5,
                "depth_km": 10.2
            }
        }
    
    async def test_alert_processing_flow(self):
        """Test the complete alert processing flow"""
        # 1. Generate a test alert
        alert = await self.generate_test_alert()
        alert_id = alert["id"]
        
        # 2. Add alert to the test queue
        await self.redis.lpush(TEST_QUEUE, json.dumps(alert))
        logger.info(f"Added test alert {alert_id} to queue")
        
        # 3. Verify alert is in the queue
        queue_length = await self.redis.llen(TEST_QUEUE)
        assert queue_length == 1, f"Expected 1 alert in queue, found {queue_length}"
        
        # 4. Create and start the worker
        from embedding_worker import EmbeddingTask
        
        worker = EmbeddingTask(redis_url=self.redis_url)
        worker.queues = {
            "alerts": TEST_QUEUE,
            "embeddings": TEST_EMBEDDING_QUEUE,
            "stats": TEST_STATS_QUEUE
        }
        worker.batch_size = 1
        
        # 5. Process the queue
        logger.info("Starting worker to process test alert")
        await worker.process_queue("alerts")
        
        # 6. Verify the alert was processed
        stats = await self.redis.hgetall(TEST_STATS_QUEUE)
        assert int(stats.get('alerts_processed', 0)) > 0, "No alerts were processed"
        
        logger.info(f"Test alert {alert_id} processed successfully")
        
        # 7. Clean up
        await self.redis.delete(TEST_QUEUE, TEST_EMBEDDING_QUEUE, TEST_STATS_QUEUE)

if __name__ == "__main__":
    # Run the test directly for manual testing
    async def run_test():
        test = TestIntegration()
        await test.setup_redis()
        try:
            await test.test_alert_processing_flow()
            print("✅ Integration test passed!")
        except Exception as e:
            print(f"❌ Integration test failed: {e}")
            raise
    
    asyncio.run(run_test())
