#!/usr/bin/env python3
"""
Test script to publish a test alert to Redis queue
"""
import asyncio
import json
import logging
import sys
import time
import uuid
from typing import Dict, Any

import aioredis

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class RedisQueueTester:
    """Test Redis queue operations with the ingestion worker"""
    
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.redis = None
        self.alert_queue = "alerts_queue"
    
    async def connect(self):
        """Connect to Redis"""
        try:
            self.redis = await aioredis.from_url(
                self.redis_url, 
                decode_responses=False,  # We'll handle decoding manually
                socket_timeout=5.0,
                socket_connect_timeout=5.0
            )
            await self.redis.ping()
            logger.info("✅ Connected to Redis")
            return True
        except Exception as e:
            logger.error(f"❌ Redis connection failed: {e}")
            return False
    
    async def ensure_queue_exists(self):
        """Ensure the queue exists and is of correct type"""
        try:
            # Check if key exists and its type
            key_type = await self.redis.type(self.alert_queue)
            if key_type == b'none':
                logger.info(f"Queue '{self.alert_queue}' does not exist, will be created")
            elif key_type != b'list':
                logger.warning(f"Key '{self.alert_queue}' exists with type '{key_type.decode()}'. Deleting it...")
                await self.redis.delete(self.alert_queue)
            return True
        except Exception as e:
            logger.error(f"Error ensuring queue exists: {e}")
            return False
    
    async def publish_test_alert(self):
        """Publish a test alert to the queue"""
        if not self.redis:
            logger.error("Redis not connected")
            return False
        
        try:
            # Ensure queue exists and is of correct type
            if not await self.ensure_queue_exists():
                return False
            
            # Create a test alert
            test_alert = {
                "id": f"test_alert_{int(time.time())}",
                "source": "test_script",
                "alert_type": "test",
                "severity": 3,
                "content": "This is a test alert for the disaster response system.",
                "location": "Test Location",
                "coordinates": {
                    "latitude": 12.9716,
                    "longitude": 77.5946
                },
                "timestamp": "2025-08-31T03:30:00Z",
                "metadata": {
                    "test": True,
                    "version": "1.0"
                }
            }
            
            # Publish to Redis list
            message = json.dumps(test_alert)
            await self.redis.lpush(self.alert_queue, message)
            
            # Verify the message is in the queue
            queue_length = await self.redis.llen(self.alert_queue)
            logger.info(f"✅ Published test alert to '{self.alert_queue}' (ID: {test_alert['id']})")
            logger.info(f"Queue '{self.alert_queue}' now has {queue_length} items")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to publish test alert: {e}", exc_info=True)
            return False
    
    async def close(self):
        """Close Redis connection"""
        if self.redis:
            await self.redis.close()
            logger.info("✅ Closed Redis connection")

async def main():
    """Main test function"""
    redis_url = "redis://localhost:6379"  # Default Redis URL
    tester = RedisQueueTester(redis_url)
    
    try:
        # Connect to Redis
        if not await tester.connect():
            return 1
        
        # Publish test alert
        success = await tester.publish_test_alert()
        
        return 0 if success else 1
        
    except Exception as e:
        logger.error(f"❌ Test error: {e}", exc_info=True)
        return 1
    finally:
        # Close connection
        await tester.close()

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
