import asyncio
import json
import aioredis
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('test-redis')

async def test_redis_connection(redis_url: str):
    """Test Redis connection and publish a test message"""
    try:
        # Connect to Redis
        redis = aioredis.from_url(redis_url, encoding="utf-8", decode_responses=True)
        await redis.ping()
        
        logger.info("✅ Successfully connected to Redis")
        
        # Test publishing a message
        test_channel = "test_channel"
        test_message = {
            "id": "test_alert_123",
            "source": "test_script",
            "content": "This is a test alert",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        await redis.publish(test_channel, json.dumps(test_message))
        logger.info(f"✅ Published test message to channel '{test_channel}': {test_message}")
        
        # Test list operations
        test_queue = "test_queue"
        await redis.rpush(test_queue, json.dumps(test_message))
        logger.info(f"✅ Pushed test message to list '{test_queue}'")
        
        # Clean up
        await redis.delete(test_queue)
        await redis.close()
        
    except Exception as e:
        logger.error(f"❌ Redis test failed: {e}")
        raise

if __name__ == "__main__":
    redis_url = "redis://localhost:6379"  # Default Redis URL
    asyncio.run(test_redis_connection(redis_url))
