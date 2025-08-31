import asyncio
import aioredis
import os
import json
import logging
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_redis")

load_dotenv()

async def test_redis():
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    logger.info(f"Connecting to Redis at {redis_url}")
    
    redis_client = aioredis.from_url(redis_url, decode_responses=True, encoding="utf-8")
    
    try:
        # Test connection
        pong = await redis_client.ping()
        logger.info(f"Redis ping: {pong}")
        
        # Stream and group names
        alert_stream = "alerts_queue"
        group_name = "test_consumers"
        consumer_name = f"test_consumer_{os.getpid()}"
        
        # Create consumer group if it doesn't exist
        try:
            await redis_client.xgroup_create(alert_stream, group_name, id="0", mkstream=True)
            logger.info(f"Created consumer group '{group_name}'")
        except aioredis.exceptions.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise
            logger.info(f"Using existing consumer group '{group_name}'")
        
        # Test publishing an alert
        test_alert = {
            "id": "test_alert_123",
            "source": "test_script",
            "content": "Test alert from Redis test script",
            "timestamp": "2023-01-01T00:00:00Z",
            "metadata": {"test": True}
        }
        
        # Publish test alert to stream
        message_id = await redis_client.xadd(alert_stream, {
            "data": json.dumps(test_alert)
        })
        logger.info(f"Published test alert to stream {alert_stream} with ID {message_id}")
        
        # Consume messages from the stream
        logger.info(f"Reading from stream {alert_stream} as consumer {consumer_name}")
        
        while True:
            try:
                # Read new messages, blocking for up to 5 seconds
                messages = await redis_client.xreadgroup(
                    group_name, 
                    consumer_name,
                    {alert_stream: '>'},  # Read new messages
                    count=1,
                    block=5000
                )
                
                if not messages:
                    logger.info("No new messages, waiting...")
                    break
                
                # Process messages
                for stream, message_list in messages:
                    for message_id, message_data in message_list:
                        logger.info(f"Received message {message_id} from {stream}")
                        logger.info(f"Message data: {message_data}")
                        
                        # Acknowledge processing of the message
                        await redis_client.xack(alert_stream, group_name, message_id)
                        logger.info(f"Acknowledged message {message_id}")
                        
                        # Return after processing one message for this test
                        return
                        
            except asyncio.CancelledError:
                logger.info("Received cancellation, shutting down...")
                break
            except Exception as e:
                logger.error(f"Error processing messages: {e}")
                break
                
    except Exception as e:
        logger.error(f"Redis error: {e}")
    finally:
        await redis_client.close()
        logger.info("Redis connection closed")

if __name__ == "__main__":
    asyncio.run(test_redis())
