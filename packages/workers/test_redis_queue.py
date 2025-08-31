#!/usr/bin/env python3
"""
Test script for Redis queue operations
"""
import asyncio
import json
import logging
import sys
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
    """Test Redis queue operations"""
    
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.redis = None
        self.alert_queue = "test_alerts_queue"
    
    async def connect(self):
        """Connect to Redis"""
        try:
            self.redis = await aioredis.from_url(self.redis_url, decode_responses=True)
            await self.redis.ping()
            logger.info("✅ Connected to Redis")
            return True
        except Exception as e:
            logger.error(f"❌ Redis connection failed: {e}")
            return False
    
    async def cleanup(self):
        """Clean up test data"""
        if self.redis:
            await self.redis.delete(self.alert_queue)
            await self.redis.close()
            logger.info("✅ Cleaned up test data")
    
    async def test_queue_operations(self):
        """Test basic queue operations"""
        if not self.redis:
            logger.error("Redis not connected")
            return False
        
        try:
            # Test 1: Ensure queue is empty
            logger.info("\n🔍 Test 1: Check initial queue state")
            queue_length = await self.redis.llen(self.alert_queue)
            logger.info(f"Queue '{self.alert_queue}' has {queue_length} items")
            
            # Test 2: Push test message
            logger.info("\n📤 Test 2: Push test message")
            test_alert = {
                "id": "test_alert_123",
                "source": "test_script",
                "content": "This is a test alert",
                "severity": 3
            }
            await self.redis.lpush(self.alert_queue, json.dumps(test_alert))
            logger.info("Pushed test alert to queue")
            
            # Verify queue length
            queue_length = await self.redis.llen(self.alert_queue)
            logger.info(f"Queue now has {queue_length} items")
            
            # Test 3: Pop message
            logger.info("\n📥 Test 3: Pop message")
            result = await self.redis.brpop(self.alert_queue, timeout=5)
            if result:
                queue_name, message = result
                logger.info(f"Received message from {queue_name}")
                alert = json.loads(message)
                logger.info(f"Alert ID: {alert.get('id')}")
                logger.info(f"Content: {alert.get('content')}")
            else:
                logger.error("❌ No message received")
                return False
            
            # Verify queue is empty again
            queue_length = await self.redis.llen(self.alert_queue)
            logger.info(f"Queue now has {queue_length} items")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Test failed: {e}", exc_info=True)
            return False

async def main():
    """Main test function"""
    redis_url = "redis://localhost:6379"
    tester = RedisQueueTester(redis_url)
    
    try:
        # Connect to Redis
        if not await tester.connect():
            return 1
        
        # Run tests
        success = await tester.test_queue_operations()
        
        if success:
            logger.info("\n✅ All tests passed!")
        else:
            logger.error("\n❌ Some tests failed")
        
        return 0 if success else 1
        
    except Exception as e:
        logger.error(f"❌ Test error: {e}", exc_info=True)
        return 1
    finally:
        # Clean up
        await tester.cleanup()

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
