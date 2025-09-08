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

# Configure logging with UTF-8 encoding support
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('embedding_worker.log', encoding='utf-8')
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
            "database": os.getenv("TIDB_DATABASE", "disaster_db")
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
            UPDATE documents 
            SET embedding = %s, updated_at = %s
            WHERE id = %s
            """
            
            # Manually convert the Python list to a JSON string format for TiDB VECTOR type
            embedding_str = json.dumps(embedding)
            
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: cursor.execute(
                    query,
                    (embedding_str, datetime.utcnow(), alert_id)
                )
            )
            
            conn.commit()
            return cursor.rowcount > 0
            
        except Exception as e:
            logger.error(f"Error updating document embedding: {str(e)}")
            return False
            
        finally:
            if 'cursor' in locals():
                cursor.close()
            if 'conn' in locals():
                conn.close()

class EmbeddingTask:
    """Processes embedding jobs from a Redis queue."""

    def __init__(self, redis_url: str = None, queue_name: str = 'embedding-queue'):
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self.queue_name = queue_name
        self.redis = None
        self.embedding_service = JinaEmbeddingService()
        self.db_service = DatabaseService()
        self.batch_size = int(os.getenv("EMBEDDING_BATCH_SIZE", "10"))

    async def connect_redis(self):
        """Connect to Redis with retry logic."""
        for attempt in range(3):
            try:
                logger.info(f"Connecting to Redis at {self.redis_url}...")
                self.redis = redis.from_url(self.redis_url, decode_responses=True)
                await self.redis.ping()
                logger.info("[OK] Connected to Redis")
                return
            except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError) as e:
                logger.error(f"Redis connection failed (attempt {attempt + 1}): {e}")
                if attempt < 2:
                    await asyncio.sleep(5)
        raise ConnectionError("Failed to connect to Redis after multiple attempts")

    async def process_job(self, job_data: Dict[str, Any]) -> bool:
        """Processes a single embedding job."""
        alert_id = job_data.get('id')
        content = job_data.get('content')

        if not all([alert_id, content]):
            logger.error(f"Invalid job format: {job_data}")
            return False

        try:
            embedding = await self.embedding_service.get_embedding(content)
            if not embedding or len(embedding) != 1024:
                logger.error(f"[ERROR] Failed to generate a valid embedding for alert {alert_id}")
                return False

            success = await self.db_service.update_alert_embedding(alert_id, embedding)
            if success:
                logger.info(f"[SUCCESS] Stored embedding for alert {alert_id}")
            else:
                logger.error(f"[ERROR] Failed to store embedding for alert {alert_id} in database")
            return success
        except Exception as e:
            logger.error(f"[ERROR] Failed to store embedding for alert {alert_id}: {e}")
            return False

    async def run(self):
        """Main worker loop to listen for and process jobs."""
        await self.connect_redis()
        logger.info(f"[START] Worker listening on queue: '{self.queue_name}' with batch size {self.batch_size}")

        try:
            while True:
                try:
                    # Blocking pop from the right of the list
                    tasks = await self.redis.brpop(self.queue_name, timeout=5)
                    if not tasks:
                        continue
                    
                    job_str = tasks[1]
                    job = json.loads(job_str)
                    await self.process_job(job)

                except asyncio.CancelledError:
                    logger.info("Worker shutdown requested.")
                    break
                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON received from queue: {job_str}")
                except Exception as e:
                    logger.exception(f"Error in worker loop: {e}")
                    await asyncio.sleep(5) # Prevent rapid-fire errors
        finally:
            if self.redis:
                await self.redis.aclose()
            logger.info("Worker shutdown complete.")

async def main():
    """Main entry point for the embedding worker."""
    parser = argparse.ArgumentParser(description='Embedding Worker for Disaster Alerts')
    parser.add_argument('--queue', type=str, default='embedding-queue', help='Redis queue name to listen on.')
    parser.add_argument('--redis-url', type=str, default=None, help='Redis connection URL.')
    parser.add_argument('--log-level', type=str, default='INFO', choices=['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'])
    args = parser.parse_args()

    logging.getLogger().setLevel(args.log_level)
    
    worker = EmbeddingTask(redis_url=args.redis_url, queue_name=args.queue)
    try:
        await worker.run()
    except (ConnectionError, asyncio.CancelledError) as e:
        logger.info(f"Worker shutting down: {e}")
    except Exception as e:
        logger.critical(f"[FATAL] Fatal error in worker: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())