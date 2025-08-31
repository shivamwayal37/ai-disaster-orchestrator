import asyncio
import json
import os
import sys
import argparse
import logging
import redis.asyncio as redis
import aiohttp
import mysql.connector
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('embedding_worker.log')
    ]
)
logger = logging.getLogger("embedding_worker")

class JinaEmbeddingService:
    """Handles communication with Jina Embeddings API"""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("JINA_API_KEY")
        if not self.api_key:
            raise ValueError("JINA_API_KEY not found in environment variables")
            
        self.base_url = "https://api.jina.ai/v1/embeddings"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        retry=retry_if_exception_type((aiohttp.ClientError, asyncio.TimeoutError))
    )
    async def get_embedding(self, text: str) -> List[float]:
        """Get embedding for a single text"""
        if not text.strip():
            return None
            
        payload = {
            "model": "jina-embeddings-v3",
            "task": "text-matching",
            "dimensions": 1024,
            "input": [text]
        }
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    self.base_url,
                    json=payload,
                    headers=self.headers,
                    timeout=30
                ) as response:
                    if response.status != 200:
                        error = await response.text()
                        logger.error(f"Jina API error {response.status}: {error}")
                        return None
                        
                    result = await response.json()
                    return result["data"][0]["embedding"]
                    
            except Exception as e:
                logger.error(f"Error getting embedding: {str(e)}")
                raise

class DatabaseService:
    """Handles database operations for alerts and embeddings"""
    
    def __init__(self):
        self.config = {
            "host": os.getenv("TIDB_HOST"),
            "port": int(os.getenv("TIDB_PORT", "4000")),
            "user": os.getenv("TIDB_USER"),
            "password": os.getenv("TIDB_PASSWORD"),
            "database": os.getenv("TIDB_DATABASE", "disaster_response")
        }
        self._check_config()
    
    def _check_config(self):
        """Validate database configuration"""
        missing = [k for k, v in self.config.items() if not v and k != "password"]
        if missing:
            raise ValueError(f"Missing database configuration: {', '.join(missing)}")
    
    async def get_connection(self):
        """Get a new database connection"""
        return await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: mysql.connector.connect(**self.config, use_pure=True)
        )
    
    async def update_alert_embedding(self, alert_id: str, embedding: List[float]) -> bool:
        """Update alert with its embedding"""
        try:
            conn = await self.get_connection()
            cursor = conn.cursor()
            
            query = """
            UPDATE alerts 
            SET embedding = %s, status = 'processed', updated_at = %s
            WHERE id = %s
            """
            
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: cursor.execute(
                    query,
                    (json.dumps(embedding), datetime.utcnow(), alert_id)
                )
            )
            
            conn.commit()
            return cursor.rowcount > 0
            
        except Exception as e:
            logger.error(f"Error updating alert embedding: {str(e)}")
            return False
            
        finally:
            if 'cursor' in locals():
                cursor.close()
            if 'conn' in locals():
                conn.close()

class EmbeddingTask:
    """Worker that processes alerts from Redis and generates embeddings"""
    
    def __init__(self, redis_url: str = None):
        # Configuration
        self.redis_url = (
            redis_url or 
            os.getenv("REDIS_URL") or 
            "redis://127.0.0.1:6379"
        )
        self.redis = None
        self.connected = False
        
        # Queue names
        self.queues = {
            "alerts": "disaster:alerts",
            "embeddings": "disaster:embeddings",
            "stats": "disaster:stats"
        }
        
        # Initialize services
        self.embedding_service = JinaEmbeddingService()
        self.db_service = DatabaseService()
        self.batch_size = int(os.getenv("EMBEDDING_BATCH_SIZE", "10"))
        
        # Stats
        self.stats = {
            'processed': 0,
            'failed': 0,
            'last_processed': None
        }

    async def process_alert(self, alert_data: Dict[str, Any]) -> bool:
        """Process a single alert and generate embeddings
        
        Args:
            alert_data: Alert data from Redis
            
        Returns:
            bool: True if processing succeeded, False otherwise
        """
        alert_id = alert_data.get('id')
        if not alert_id:
            logger.error("Alert missing ID")
            return False
            
        try:
            # Generate embedding for alert content
            content = alert_data.get('description', '')[:4000]  # Truncate to avoid token limits
            if not content:
                logger.warning(f"Alert {alert_id} has no content to embed")
                return False
            
            # Get embedding from Jina API
            logger.info(f"Generating embedding for alert {alert_id}")
            embedding = await self.embedding_service.get_embedding(content)
            if not embedding:
                logger.error(f"Failed to generate embedding for alert {alert_id}")
                return False
            
            # Update alert in database
            success = await self.db_service.update_alert_embedding(alert_id, embedding)
            if not success:
                logger.error(f"Failed to update alert {alert_id} with embedding")
                return False
            
            # Update stats
            self.stats['processed'] += 1
            self.stats['last_processed'] = datetime.utcnow()
            
            if self.redis and self.connected:
                await self.redis.hincrby(self.queues['stats'], 'embeddings_generated', 1)
            
            logger.info(f"✅ Successfully processed alert {alert_id}")
            return True
            
        except Exception as e:
            self.stats['failed'] += 1
            logger.error(f"❌ Error processing alert {alert_id}: {str(e)}")
            logger.error(traceback.format_exc())
            
            # Update error stats
            if self.redis and self.connected:
                await self.redis.hincrby(self.queues['stats'], 'embedding_errors', 1)
            
            return False
            
            # Generate embedding for alert content
            content = alert_data.get('content', '')
            if not content:
                logger.warning(f"Empty content for alert {alert_id}")
                return False
                
            embedding = await self.embedding_service.get_embedding(content)
            if not embedding:
                logger.error(f"Failed to generate embedding for alert {alert_id}")
                return False
                
            # Update alert with embedding
            success = await self.db_service.update_alert_embedding(alert_id, embedding)
            if success:
                logger.info(f"Successfully processed alert {alert_id}")
            else:
                logger.error(f"Failed to update alert {alert_id} in database")
                
            return success
            
        except Exception as e:
            logger.error(f"Error processing alert {alert_id}: {str(e)}")
            return False

    async def connect_redis(self) -> bool:
        """Connect to Redis with retry logic"""
        max_retries = 3
        retry_delay = 5
        
        for attempt in range(max_retries):
            try:
                logger.info(f"Connecting to Redis at {self.redis_url} (attempt {attempt + 1}/{max_retries})")
                self.redis = redis.Redis.from_url(
                    self.redis_url,
                    socket_connect_timeout=5,
                    socket_timeout=5,
                    decode_responses=True,
                    retry_on_timeout=True
                )
                await self.redis.ping()
                self.connected = True
                logger.info("✅ Connected to Redis")
                return True
            except (ConnectionError, TimeoutError, redis.RedisError) as e:
                logger.error(f"Failed to connect to Redis: {str(e)}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
        
        logger.error("❌ Failed to connect to Redis after multiple attempts")
        return False

    async def process_queue(self, queue_name: str) -> None:
        """Process items from the specified queue with batch processing
        
        Args:
            queue_name: Name of the queue to process (alerts or embeddings)
        """
        queue = self.queues.get(queue_name)
        if not queue:
            logger.error(f"❌ Unknown queue: {queue_name}")
            return
        
        logger.info(f"🚀 Starting {queue_name} worker with batch size {self.batch_size}...")
        
        # Initialize Redis connection
        if not await self.connect_redis():
            return
        
        try:
            while True:
                try:
                    # Process batch of alerts
                    alerts = []
                    for _ in range(self.batch_size):
                        task_data = await self.redis.brpop(queue, timeout=1)
                        if task_data and len(task_data) > 1:
                            try:
                                alert = json.loads(task_data[1])
                                alerts.append(alert)
                                logger.debug(f"Queued alert {alert.get('id')} for processing")
                            except json.JSONDecodeError as e:
                                logger.error(f"Invalid JSON in queue: {e}")
                    
                    # Process alerts in parallel
                    if alerts:
                        tasks = [self.process_alert(alert) for alert in alerts]
                        results = await asyncio.gather(*tasks, return_exceptions=True)
                        
                        # Log batch results
                        success_count = sum(1 for r in results if r is True)
                        if success_count > 0:
                            logger.info(f"✅ Processed batch of {success_count}/{len(alerts)} alerts successfully")
                        
                        # Update stats
                        if self.connected:
                            await self.redis.hincrby(
                                self.queues['stats'], 
                                'alerts_processed', 
                                success_count
                            )
                
                except asyncio.CancelledError:
                    logger.info("🛑 Worker shutdown requested")
                    break
                except Exception as e:
                    logger.error(f"Error in worker: {e}")
                    logger.error(traceback.format_exc())
                    await asyncio.sleep(5)
        
        finally:
            if self.redis:
                await self.redis.close()
                self.connected = False
                        try:
                            task = json.loads(task_data[1])
                            logger.info(f"Processing task from {queue}: {task.get('id')}")

                            if queue_name == "alerts":
                                await self.process_alert(task)
                            else:
                                # Handle other queue types if needed
                                logger.warning(f"Unsupported queue type: {queue_name}")

                        except json.JSONDecodeError:
                            logger.error(f"Invalid JSON in queue {queue}: {task_data[1]}")
                        except Exception as e:
                            logger.error(f"Error processing task: {str(e)}")

                except asyncio.CancelledError:
                    logger.info("Worker shutdown requested")
                    break
                except Exception as e:
                    logger.error(f"Error in worker: {e}")
                    await asyncio.sleep(5)  # Prevent tight loop on errors

        finally:
            if self.redis:
                await self.redis.close()
                logger.info("Redis connection closed")

async def main():
    """Main entry point for the embedding worker
    
    Example usage:
        python embedding_worker.py --queue alerts --redis-url redis://localhost:6379
    """
    parser = argparse.ArgumentParser(description='Embedding Worker for Disaster Alerts')
    parser.add_argument('--queue', 
                      type=str, 
                      default='alerts',
                      choices=['alerts', 'embeddings'],
                      help='Queue name to process (alerts or embeddings)')
    parser.add_argument('--redis-url', 
                      type=str, 
                      default=None,
                      help='Redis connection URL (default: REDIS_URL from env)')
    parser.add_argument('--batch-size',
                      type=int,
                      default=10,
                      help='Number of alerts to process in each batch')
    parser.add_argument('--log-level',
                      type=str,
                      default='INFO',
                      choices=['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'],
                      help='Logging level')
    
    args = parser.parse_args()
    
    # Configure logging
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler('embedding_worker.log')
        ]
    )
    
    logger.info(f"🚀 Starting embedding worker for queue: {args.queue}")
    logger.info(f"📊 Batch size: {args.batch_size}")
    logger.info(f"🔍 Log level: {args.log_level}")
    
    worker = EmbeddingTask(redis_url=args.redis_url)
    worker.batch_size = args.batch_size
    
    try:
        await worker.process_queue(args.queue)
    except asyncio.CancelledError:
        logger.info("🛑 Worker shutdown requested")
    except Exception as e:
        logger.critical(f"💥 Fatal error in worker: {e}", exc_info=True)
        sys.exit(1)
    finally:
        if worker.redis:
            await worker.redis.close()
        logger.info("👋 Worker shutdown complete")

if __name__ == "__main__":
    asyncio.run(main())