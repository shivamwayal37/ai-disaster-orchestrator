#!/usr/bin/env python3
"""
Day 5 Ingestion Worker - Alert Processing Pipeline
Ingest → Queue → Embed → Store flow with Redis messaging
"""

import os
import json
import time
import uuid
import asyncio
import random
import redis.asyncio as redis
import mysql.connector
from mysql.connector import Error, pooling
import logging
from typing import Dict, Any, List, Optional, AsyncGenerator
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone, timedelta
import traceback
import json
import aiohttp
from tenacity import retry, stop_after_attempt, wait_exponential

# Configure logging

async def publisher_main():
    """Simple publisher for testing - sends sample alerts to Redis"""
    print("Starting Disaster Alert Publisher... (demo)")
    redis = None
    
    try:
        # Load config to get Redis URL
        db_config, redis_url, jina_api_key = load_config()
        if not redis_url:
            print("❌ Failed to load Redis configuration")
            return
        
        # Initialize Redis client
        redis = aioredis.from_url(redis_url, decode_responses=True)
        await redis.ping()
        print("✅ Connected to Redis")
        
        # Sample alerts
        alerts = [
            {"id": f"alert-{uuid.uuid4().hex[:8]}", "type": "earthquake", "location": "California", "magnitude": 6.5, "severity": 4, "timestamp": datetime.now(timezone.utc).isoformat()},
            {"id": f"alert-{uuid.uuid4().hex[:8]}", "type": "flood", "location": "Mumbai", "level": "severe", "severity": 3, "timestamp": datetime.now(timezone.utc).isoformat()},
            {"id": f"alert-{uuid.uuid4().hex[:8]}", "type": "wildfire", "location": "Australia", "acres": 5000, "severity": 5, "timestamp": datetime.now(timezone.utc).isoformat()},
        ]
        
        for alert in alerts:
            try:
                # Publish to the alerts queue that the worker is listening on
                await redis.rpush(
                    "alerts_queue",
                    json.dumps(alert)
                )
                print(f"📢 Published alert: {alert['id']} ({alert['type']}, severity={alert['severity']})")
                await asyncio.sleep(2)
            except Exception as e:
                print(f"❌ Error publishing alert {alert['id']}: {e}")
                # Try to delete any malformed key that might be causing issues
                if "WRONGTYPE" in str(e):
                    print("⚠️  Detected wrong key type. Attempting to fix...")
                    try:
                        await redis.delete("disaster_alerts")
                        print("✅ Fixed - Deleted the problematic key. Please restart the publisher.")
                        return
                    except Exception as del_error:
                        print(f"❌ Failed to fix the issue: {del_error}")
                        return
    
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
    finally:
        if redis:
            await redis.close()
            print("\n✅ Publisher stopped. Redis connection closed.")
        else:
            print("\n❌ Publisher stopped with errors.")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger('ingest-worker')

@dataclass
class AlertPayload:
    """Standardized alert structure"""
    source: str
    content: str
    alert_type: Optional[str] = None
    severity: Optional[int] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None

class TiDBConnection:
    """TiDB connection manager"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.connection = None
    
    def connect(self):
        """Establish TiDB connection"""
        try:
            self.connection = mysql.connector.connect(**self.config)
            logger.info("Connected to TiDB successfully")
            return True
        except Error as e:
            logger.error(f"TiDB connection failed: {e}")
            return False
    
    def disconnect(self):
        """Close TiDB connection"""
        if self.connection and self.connection.is_connected():
            self.connection.close()
            logger.info("TiDB connection closed")
    
    def _ensure_connection(self) -> bool:
        """Ensure we have an active database connection"""
        if not self.connection or not self.connection.is_connected():
            logger.warning("Database connection lost. Attempting to reconnect...")
            return self.connect()
        return True
            
    def insert_alert(self, alert_id: str, payload: AlertPayload) -> bool:
        """Insert alert into TiDB alerts table"""
        try:
            if not self._ensure_connection():
                logger.error("Failed to establish database connection")
                return False
                
            cursor = self.connection.cursor()
            
            now = datetime.now()
            insert_query = """
            INSERT INTO alerts (
                alert_uid, source, alert_type, title, description, severity, 
                location, latitude, longitude, start_time, is_active, raw_data,
                created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            
            # Create a copy of the payload as a dict for raw_data
            raw_data = {
                'alert_uid': alert_id,
                'source': payload.source,
                'alert_type': payload.alert_type,
                'severity': payload.severity,
                'location': payload.location,
                'latitude': payload.latitude,
                'longitude': payload.longitude,
                'metadata': payload.metadata or {}
            }
            
            # Map content to description and create a title if not provided
            title = f"{payload.alert_type.capitalize()} Alert" if payload.alert_type else "New Alert"
            
            values = (
                alert_id,
                payload.source,
                payload.alert_type,
                title,
                payload.content,  # Content is mapped to description
                payload.severity,
                payload.location,
                payload.latitude,
                payload.longitude,
                now,  # start_time
                True,  # is_active
                json.dumps(raw_data),  # raw_data as JSON
                now,  # created_at
                now   # updated_at
            )
            
            cursor.execute(insert_query, values)
            self.connection.commit()
            cursor.close()
            
            logger.info(f"Alert {alert_id} inserted into TiDB")
            return True
            
        except Error as e:
            logger.error(f"Failed to insert alert {alert_id}: {e}")
            return False
    
    def update_alert_embedding(self, alert_id: str, embedding: List[float]) -> bool:
        """Update alert with generated embedding"""
        try:
            if not self._ensure_connection():
                logger.error("Failed to establish database connection")
                return False
                
            cursor = self.connection.cursor()
            
            # Convert embedding to TiDB VECTOR format
            embedding_str = f"[{','.join(map(str, embedding))}]"
            
            update_query = """
            UPDATE alerts 
            SET embedding = %s, embedding_status = 'completed', processed_at = NOW()
            WHERE alert_uid = %s
            """
            
            cursor.execute(update_query, (embedding_str, alert_id))
            self.connection.commit()
            cursor.close()
            
            logger.info(f"Alert {alert_id} updated with embedding")
            return True
            
        except Error as e:
            logger.error(f"Failed to update alert {alert_id} with embedding: {e}")
            return False
    
    def mark_embedding_failed(self, alert_id: str, error_msg: str) -> bool:
        """Mark alert embedding as failed"""
        try:
            if not self._ensure_connection():
                logger.error("Failed to establish database connection")
                return False
                
            cursor = self.connection.cursor()
            
            update_query = """
            UPDATE alerts 
            SET embedding_status = 'failed', processed_at = NOW()
            WHERE alert_uid = %s
            """
            
            cursor.execute(update_query, (alert_id,))
            self.connection.commit()
            cursor.close()
            
            logger.warning(f"Alert {alert_id} marked as embedding failed: {error_msg}")
            
        except Error as e:
            logger.error(f"Failed to mark alert {alert_id} as failed: {e}")

class RedisQueue:
    """Redis-based message queue for alert processing"""
    
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.redis = None
        self.connected = False
        
    async def connect(self) -> bool:
        """Connect to Redis with retry logic"""
        max_retries = 3
        retry_delay = 5
        
        for attempt in range(max_retries):
            try:
                self.redis = redis.Redis.from_url(
                    self.redis_url,
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_timeout=5,
                    retry_on_timeout=True
                )
                await self.redis.ping()
                self.connected = True
                logger.info("✅ Connected to Redis")
                return True
            except Exception as e:
                logger.error(f"Failed to connect to Redis (attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
        
        logger.error("Failed to connect to Redis after multiple attempts")
        return False
    
    async def disconnect(self):
        """Close Redis connection"""
        if self.redis:
            await self.redis.close()
            self.connected = False
            logger.info("Redis connection closed")
    
    async def _ensure_queue_exists(self, queue_name: str):
        """Ensure the queue exists and is of the correct type"""
        try:
            # Check if key exists and its type
            key_type = await self.redis.type(queue_name)
            if key_type == b'none':
                logger.debug(f"Key '{queue_name}' does not exist, will be created")
            elif key_type != b'list':
                logger.warning(f"Key '{queue_name}' exists with type '{key_type.decode()}'. Deleting it...")
                await self.redis.delete(queue_name)
        except Exception as e:
            logger.error(f"Error checking queue {queue_name}: {e}")
            raise
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def publish_alert(self, alert_data: Dict[str, Any]) -> str:
        """Publish alert to Redis queue with retry logic
        
        Args:
            alert_data: Alert data dictionary
            
        Returns:
            str: Generated alert ID
        """
        if not self.connected and not await self.connect():
            raise ConnectionError("Failed to connect to Redis")
            
        try:
            # Generate alert ID if not provided
            if 'id' not in alert_data:
                alert_data['id'] = f"alert_{uuid.uuid4().hex}"
                
            alert_id = alert_data['id']
            alert_data['created_at'] = datetime.utcnow().isoformat()
            alert_data['status'] = 'pending'
            
            # Add to alerts queue
            await self.redis.lpush("alerts_queue", json.dumps(alert_data))
            logger.info(f"📤 Published alert {alert_id} to alerts_queue")
            
            # Update stats
            await self.redis.hincrby("stats_queue", 'alerts_published', 1)
            
            return alert_id
            
        except Exception as e:
            logger.error(f"❌ Failed to publish alert: {str(e)}")
            logger.error(traceback.format_exc())
            raise
    
    async def publish_embedding_task(self, alert_id: str, content: str):
        """Publish embedding task to embedding queue"""
        try:
            await self._ensure_queue_exists("embedding_queue")
            task_data = {
                "alert_id": alert_id,
                "content": content,
                "timestamp": time.time()
            }
            message = json.dumps(task_data)
            await self.redis.lpush(self.embedding_queue, message)
            logger.info(f"Embedding task published for alert {alert_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to publish embedding task: {e}")
            return False
    
    async def consume_alerts(self, callback):
        """Consume alerts from queue and process them"""
        if not self.redis:
            logger.error("Redis connection not established")
            return
            
        logger.info("Starting alert consumer...")
        
        try:
            # Ensure the queue exists and is of correct type
            await self._ensure_queue_exists(self.alert_queue)
            
            while True:
                try:
                    # Blocking pop with 1 second timeout
                    result = await self.redis.brpop(self.alert_queue, timeout=1)
                    
                    if result:
                        try:
                            # result is a tuple of (queue_name, message)
                            queue_name, message = result
                            
                            # Decode the message if it's bytes
                            if isinstance(message, bytes):
                                message = message.decode('utf-8')
                            
                            logger.debug(f"Processing message from {queue_name}: {message[:100]}...")
                            
                            # Parse the JSON message
                            alert_data = json.loads(message)
                            
                            # Process the alert
                            await callback(alert_data)
                            
                            logger.debug(f"Successfully processed alert: {alert_data.get('id', 'unknown')}")
                            
                        except json.JSONDecodeError as e:
                            logger.error(f"Failed to decode message: {e}\nMessage: {message}")
                        except Exception as e:
                            logger.error(f"Error processing message: {e}\nMessage: {message}", exc_info=True)
                    else:
                        # No messages, brief sleep
                        await asyncio.sleep(0.1)
                            
                except asyncio.CancelledError:
                    logger.info("Alert consumer stopped by cancellation")
                    break
                except Exception as e:
                    logger.error(f"Unexpected error in alert consumer: {e}", exc_info=True)
                    await asyncio.sleep(1)  # Prevent tight loop on errors
                    
        except Exception as e:
            logger.error(f"Fatal error in alert consumer: {e}", exc_info=True)
            
    async def consume_embedding_tasks(self, callback):
        """Consume embedding tasks from queue and process them"""
        if not self.redis:
            logger.error("Redis connection not established")
            return
            
        logger.info("Starting embedding task consumer...")
        
        try:
            # Ensure the queue exists and is of correct type
            await self._ensure_queue_exists(self.embedding_queue)
            
            while True:
                try:
                    # Blocking pop with 1 second timeout
                    result = await self.redis.brpop(self.embedding_queue, timeout=1)
                    
                    if result:
                        try:
                            # result is a tuple of (queue_name, message)
                            queue_name, message = result
                            
                            # Decode the message if it's bytes
                            if isinstance(message, bytes):
                                message = message.decode('utf-8')
                            
                            logger.debug(f"Processing embedding task from {queue_name}: {message[:100]}...")
                            
                            # Parse the JSON message
                            task_data = json.loads(message)
                            
                            # Process the embedding task
                            await callback(task_data)
                            
                            logger.debug(f"Successfully processed embedding task for alert: {task_data.get('alert_id', 'unknown')}")
                            
                        except json.JSONDecodeError as e:
                            logger.error(f"Failed to decode embedding task: {e}\nMessage: {message}")
                        except Exception as e:
                            logger.error(f"Error processing embedding task: {e}\nMessage: {message}", exc_info=True)
                    else:
                        # No messages, brief sleep
                        await asyncio.sleep(0.1)
                            
                except asyncio.CancelledError:
                    logger.info("Embedding task consumer stopped by cancellation")
                    break
                except Exception as e:
                    logger.error(f"Unexpected error in embedding task consumer: {e}", exc_info=True)
                    await asyncio.sleep(1)  # Prevent tight loop on errors
                    
        except Exception as e:
            logger.error(f"Fatal error in embedding task consumer: {e}", exc_info=True)
            raise

class JinaEmbeddingService:
    """Jina API service for generating embeddings"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.jina.ai/v1/embeddings"
    
    async def generate_embedding(self, text: str) -> Optional[List[float]]:
        """Generate single embedding using Jina API"""
        import aiohttp
        
        payload = {
            "model": "jina-embeddings-v3",
            "task": "text-matching",
            "dimensions": 1024,
            "late_chunking": True,
            "embedding_type": "float",
            "input": [text]
        }
        
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(self.base_url, json=payload, headers=headers) as response:
                    if response.status == 200:
                        result = await response.json()
                        embeddings = result.get('data', [])
                        if embeddings:
                            embedding = embeddings[0].get('embedding', [])
                            if len(embedding) == 1024:
                                return embedding
                    
                    error_text = await response.text()
                    logger.error(f"Jina API error {response.status}: {error_text}")
                    return None
                    
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            return None

class IngestWorker:
    """Main worker for Day 5 ingestion flow"""
    
    def __init__(self, db_config: Dict, redis_url: str, jina_api_key: str):
        self.db = TiDBConnection(db_config)
        self.queue = RedisQueue(redis_url)
        self.embedding_service = JinaEmbeddingService(jina_api_key)
        self.stats = {
            'processed': 0,
            'embedded': 0,
            'failed': 0,
            'start_time': time.time()
        }
    
    async def process_alert(self, alert_data: Dict[str, Any]):
        """Process incoming alert: store in DB and queue for embedding"""
        try:
            # Ensure alert_data is a dictionary
            if isinstance(alert_data, str):
                try:
                    alert_data = json.loads(alert_data)
                except json.JSONDecodeError:
                    logger.error(f"Failed to decode alert data: {alert_data}")
                    return
            
            # Generate alert ID if not provided
            alert_id = alert_data.get('id', str(uuid.uuid4()))
            
            # Convert alert data to AlertPayload
            try:
                # Handle both 'alert_type' and 'type' fields for backward compatibility
                alert_type = alert_data.get('alert_type') or alert_data.get('type')
                if not alert_type:
                    logger.warning(f"Alert {alert_id} missing 'alert_type' or 'type' field")
                
                alert_payload = AlertPayload(
                    source=alert_data.get('source', 'unknown'),
                    content=alert_data.get('content', ''),
                    alert_type=alert_type,
                    severity=alert_data.get('severity'),
                    location=alert_data.get('location'),
                    latitude=alert_data.get('latitude') or (alert_data.get('coordinates', {}).get('latitude') if isinstance(alert_data.get('coordinates'), dict) else None),
                    longitude=alert_data.get('longitude') or (alert_data.get('coordinates', {}).get('longitude') if isinstance(alert_data.get('coordinates'), dict) else None),
                    metadata=alert_data.get('metadata')
                )
                
                # Store alert in database
                if not self.db.insert_alert(alert_id, alert_payload):
                    logger.error(f"Failed to store alert {alert_id} in database")
                    self.stats['failed'] += 1
                    return
                    
            except Exception as e:
                logger.error(f"Failed to create AlertPayload: {e}")
                self.stats['failed'] += 1
                return
            
            # Queue for embedding if content exists
            if 'content' in alert_data and alert_data['content']:
                await self.queue.publish_embedding_task(alert_id, alert_data['content'])
            
            self.stats['processed'] += 1
            logger.info(f"Processed alert {alert_id}")
                
        except Exception as e:
            self.stats['failed'] += 1
            logger.error(f"Alert processing failed: {e}")
            logger.error(f"Alert data: {alert_data}", exc_info=True)
            traceback.print_exc()
    
    async def process_embedding_task(self, task_data: Dict[str, Any]):
        """Process embedding task: generate embedding and update DB"""
        try:
            alert_id = task_data['alert_id']
            content = task_data['content']
            
            logger.info(f"Generating embedding for alert {alert_id}")
            
            # Generate embedding using Jina API
            embedding = await self.embedding_service.generate_embedding(content)
            
            if embedding:
                # Update alert with embedding
                if self.db.update_alert_embedding(alert_id, embedding):
                    self.stats['embedded'] += 1
                    logger.info(f"Alert {alert_id} embedding completed")
                else:
                    self.db.mark_embedding_failed(alert_id, "Database update failed")
                    self.stats['failed'] += 1
            else:
                self.db.mark_embedding_failed(alert_id, "Embedding generation failed")
                self.stats['failed'] += 1
                
        except Exception as e:
            logger.error(f"Embedding task failed: {e}")
            self.stats['failed'] += 1
            traceback.print_exc()
    
    async def run_alert_processor(self):
        """Run alert processing worker"""
        logger.info("Starting alert processor worker")
        
        try:
            # Connect to services
            if not self.db.connect():
                return False
                
            if not await self.queue.connect():
                return False
            
            # Process alerts from queue
            await self.queue.consume_alerts(self.process_alert)
            
        except KeyboardInterrupt:
            logger.info("Alert processor stopped by user")
        except Exception as e:
            logger.error(f"Alert processor failed: {e}")
            traceback.print_exc()
        finally:
            self.db.disconnect()
            await self.queue.disconnect()
    
    async def run_embedding_processor(self):
        """Run embedding processing worker"""
        logger.info("Starting embedding processor worker")
        
        try:
            # Connect to services
            if not self.db.connect():
                return False
                
            if not await self.queue.connect():
                return False
            
            # Process embedding tasks from queue
            await self.queue.consume_embedding_tasks(self.process_embedding_task)
            
        except KeyboardInterrupt:
            logger.info("Embedding processor stopped by user")
        except Exception as e:
            logger.error(f"Embedding processor failed: {e}")
            traceback.print_exc()
        finally:
            self.db.disconnect()
            await self.queue.disconnect()
    
    async def print_stats(self):
        """Print worker statistics"""
        uptime = time.time() - self.stats['start_time']
        print("\n=== Worker Statistics ===")
        print(f"Uptime: {uptime:.2f} seconds")
        print(f"Alerts processed: {self.stats['processed']}")
        print(f"Embeddings generated: {self.stats['embedded']}")
        print(f"Failures: {self.stats['failed']}")
        print("========================\n")
        
    async def stats_loop(self, interval: int = 60):
        """Background task to print stats at regular intervals"""
        while True:
            await self.print_stats()
            await asyncio.sleep(interval)

def load_config():
    """Load configuration from environment"""
    from dotenv import load_dotenv
    import os
    
    # Load environment variables from .env file
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        load_dotenv(env_path)
    else:
        logger.warning("No .env file found, using system environment variables")
    
    # Get required configurations
    db_config = {
        'host': os.getenv('TIDB_HOST'),
        'port': int(os.getenv('TIDB_PORT', '4000')),
        'user': os.getenv('TIDB_USER'),
        'password': os.getenv('TIDB_PASSWORD') or os.getenv('TIDB_PASS'),  # Support both TIDB_PASSWORD and TIDB_PASS
        'database': os.getenv('TIDB_DATABASE', 'disaster_db'),
        'autocommit': True
    }
    
    redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
    jina_api_key = os.getenv('JINA_API_KEY')
    
    # Print debug info
    logger.debug(f"Database config: host={db_config['host']}, user={db_config['user']}, database={db_config['database']}")
    logger.debug(f"Redis URL: {redis_url}")
    
    # Validate required config
    missing_db_config = [k for k in ['host', 'user', 'password'] if not db_config[k]]
    if missing_db_config:
        error_msg = "Missing TiDB configuration. Please set the following environment variables:\n"
        if 'host' in missing_db_config:
            error_msg += "- TIDB_HOST: Your TiDB host (e.g., 'localhost' or 'your-tidb-host.com')\n"
        if 'user' in missing_db_config:
            error_msg += "- TIDB_USER: Your TiDB username\n"
        if 'password' in missing_db_config:
            error_msg += "- TIDB_PASSWORD: Your TiDB password\n"
        error_msg += "\nYou can set these in a .env file or as environment variables."
        raise ValueError(error_msg)
    
    if not jina_api_key:
        raise ValueError(
            "JINA_API_KEY is required for generating embeddings. "
            "Please set it in your environment variables or .env file."
        )
    
    logger.info("Configuration loaded successfully")
    return db_config, redis_url, jina_api_key

async def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Disaster Alert Ingestion Worker')
    parser.add_argument('--mode', type=str, default='both', 
                       choices=['alerts', 'embeddings', 'both', 'publisher'],
                       help='Operation mode: alerts, embeddings, both, or publisher')
    
    args = parser.parse_args()
    
    try:
        if args.mode == 'publisher':
            print("Starting Disaster Alert Publisher...")
            await publisher_main()
            return
            
        print("Starting Disaster Alert Ingestion Worker...")
        print("Press Ctrl+C to stop the worker")
        
        # Load configuration
        db_config, redis_url, jina_api_key = load_config()
        if not all([db_config, redis_url, jina_api_key]):
            print("Error: Failed to load configuration")
            exit(1)
            
        # Initialize worker
        worker = IngestWorker(
            db_config=db_config,
            redis_url=redis_url,
            jina_api_key=jina_api_key
        )
        
        # Start stats loop
        stats_task = asyncio.create_task(worker.stats_loop())
        
        try:
            if args.mode == 'alerts':
                await worker.run_alert_processor()
            elif args.mode == 'embeddings':
                await worker.run_embedding_processor()
            else:  # both
                await asyncio.gather(
                    worker.run_alert_processor(),
                    worker.run_embedding_processor()
                )
        except asyncio.CancelledError:
            print("\nShutting down gracefully...")
        finally:
            stats_task.cancel()
            try:
                await stats_task
            except asyncio.CancelledError:
                pass
            
    except KeyboardInterrupt:
        print("\nWorker stopped by user")
    except Exception as e:
        print(f"Error: {e}")
        traceback.print_exc()

async def test_ingestion_flow(worker: IngestWorker):
    """Test the complete ingestion flow"""
    logger.info("Testing ingestion flow...")
    
    # Connect services
    if not worker.db.connect():
        return
    
    if not await worker.queue.connect():
        return
    
    # Test alerts
    test_alerts = [
        {
            "id": "test-flood-001",
            "source": "weather_api",
            "content": "Severe flood warning for Mumbai coastal areas. Water levels rising rapidly.",
            "alert_type": "flood",
            "severity": 4,
            "location": "Mumbai, Maharashtra",
            "latitude": 19.076,
            "longitude": 72.877
        },
        {
            "id": "test-wildfire-002", 
            "source": "twitter",
            "content": "URGENT: Wildfire spreading near Shimla residential areas. Immediate evacuation required.",
            "alert_type": "wildfire",
            "severity": 5,
            "location": "Shimla, Himachal Pradesh",
            "latitude": 31.104,
            "longitude": 77.173
        }
    ]
    
    # Publish test alerts
    for alert in test_alerts:
        await worker.queue.publish_alert(alert)
    
    # Process alerts
    for alert in test_alerts:
        await worker.process_alert(alert)
    
    # Process embeddings
    for alert in test_alerts:
        task_data = {
            "alert_id": alert["id"],
            "content": alert["content"]
        }
        await worker.process_embedding_task(task_data)
    
    worker.print_stats()
    
    # Cleanup
    worker.db.disconnect()
    await worker.queue.disconnect()
    
    logger.info("Test completed successfully!")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Worker stopped by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        traceback.print_exc()
        exit(1)

# Data Models
@dataclass
class DisasterAlert:
    """Represents a disaster alert"""
    alert_id: str
    source: str
    alert_type: str
    severity: int
    location: Dict[str, float]  # lat, lng
    description: str
    timestamp: str
    metadata: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert alert to dictionary"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'DisasterAlert':
        """Create alert from dictionary"""
        return cls(**data)

def fake_fetch_weather_alerts():
    """Placeholder for real API calls to OpenWeather, Twitter, NASA"""
    return [
        {
            "source": "openweather",
            "summary": "Severe flood warning issued for Riverdale District",
            "lat": 12.34,
            "lon": 56.78,
            "severity": 4,
            "incident_type": "flood",
            "raw_data": {
                "alert_id": "OW_FL_001",
                "description": "Heavy rainfall causing river overflow",
                "start_time": "2024-01-15T10:00:00Z",
                "end_time": "2024-01-15T18:00:00Z"
            }
        },
        {
            "source": "twitter",
            "summary": "Multiple reports of wildfire smoke near Pine Valley",
            "lat": 34.56,
            "lon": 78.90,
            "severity": 3,
            "incident_type": "wildfire",
            "raw_data": {
                "tweet_id": "TW_WF_002",
                "user_reports": 15,
                "keywords": ["wildfire", "smoke", "evacuation"]
            }
        }
    ]

def generate_alert_id() -> str:
    """Generate a unique alert ID"""
    return f"alert_{uuid.uuid4().hex[:8]}"

def get_current_timestamp() -> str:
    """Get current UTC timestamp in ISO format"""
    return datetime.now(timezone.utc).isoformat()

# Mock Data Generators
def generate_weather_alert() -> DisasterAlert:
    """Generate a mock weather alert"""
    alert_types = ["flood", "cyclone", "heatwave", "cold_wave", "storm"]
    locations = [
        (28.6139, 77.2090),  # Delhi
        (19.0760, 72.8777),  # Mumbai
        (13.0827, 80.2707),  # Chennai
        (12.9716, 77.5946),  # Bengaluru
        (17.3850, 78.4867),  # Hyderabad
    ]
    
    lat, lng = random.choice(locations)
    alert_type = random.choice(alert_types)
    
    return DisasterAlert(
        alert_id=generate_alert_id(),
        source="weather_api",
        alert_type=alert_type,
        severity=random.randint(1, 5),
        location={"lat": lat + random.uniform(-0.1, 0.1), 
                 "lng": lng + random.uniform(-0.1, 0.1)},
        description=f"{alert_type.replace('_', ' ').title()} alert issued",
        timestamp=get_current_timestamp(),
        metadata={
            "confidence": round(random.uniform(0.7, 1.0), 2),
            "radius_km": random.randint(5, 50),
            "forecast_hours": random.randint(6, 72)
        }
    )

def generate_social_media_alert() -> DisasterAlert:
    """Generate a mock social media alert"""
    alert_types = ["fire", "earthquake", "flood", "landslide", "accident"]
    locations = [
        (18.5204, 73.8567),  # Pune
        (26.8467, 80.9462),  # Lucknow
        (22.5726, 88.3639),  # Kolkata
        (30.7333, 76.7794),  # Chandigarh
        (26.9124, 75.7873),  # Jaipur
    ]
    
    lat, lng = random.choice(locations)
    alert_type = random.choice(alert_types)
    
    return DisasterAlert(
        alert_id=generate_alert_id(),
        source="social_media",
        alert_type=alert_type,
        severity=random.randint(1, 5),
        location={"lat": lat + random.uniform(-0.1, 0.1), 
                 "lng": lng + random.uniform(-0.1, 0.1)},
        description=f"{alert_type.title()} reported on social media",
        timestamp=get_current_timestamp(),
        metadata={
            "reports": random.randint(1, 50),
            "platform": random.choice(["twitter", "facebook", "whatsapp"]),
            "verified": random.choice([True, False])
        }
    )

async def publish_to_redis(redis_client, channel: str, message: dict):
    """Publish message to Redis channel"""
    try:
        await redis_client.publish(channel, json.dumps(message))
        logger.debug(f"Published to {channel}: {message}")
        return True
    except Exception as e:
        logger.error(f"Failed to publish to Redis: {e}")
        return False

class RedisPublisher:
    """Handles publishing alerts to Redis"""
    
    def __init__(self, redis_url: str):
        """Initialize Redis connection"""
        self.redis_url = redis_url
        self.redis: Optional[aioredis.Redis] = None
        self.connected = False
    
    async def connect(self) -> bool:
        """Establish Redis connection"""
        if self.connected and self.redis:
            return True
            
        try:
            self.redis = aioredis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
            await self.redis.ping()
            self.connected = True
            logger.info(f"Connected to Redis at {self.redis_url}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            self.connected = False
            return False
    
    async def publish_alert(self, alert: DisasterAlert) -> bool:
        """Publish a single alert to Redis stream"""
        if not self.connected and not await self.connect():
            return False
            
        try:
            # Convert alert to dictionary and then to JSON string
            alert_dict = alert.to_dict()
            
            # Use the same queue name as in RedisQueue
            queue_name = "alerts_queue"
            
            # Add to the head of the list
            await self.redis.lpush(queue_name, json.dumps(alert_dict, default=str))
            
            logger.info(f"Published alert {alert.alert_id} to queue {queue_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error publishing alert {alert.alert_id}: {e}", exc_info=True)
            return False
    
    async def close(self):
        """Close Redis connection"""
        if self.redis:
            await self.redis.close()
            self.connected = False
            logger.info("Redis connection closed")

async def publisher_main():
    """Continuously publish fake alerts into Redis for testing"""
    db_config, redis_url, jina_api_key = load_config()
    publisher = RedisPublisher(redis_url)

    if not await publisher.connect():
        logger.error("Publisher could not connect to Redis")
        return

    logger.info("🚀 Publisher started. Sending fake alerts...")

    try:
        while True:
            # Randomly pick between weather & social media alerts
            if random.random() < 0.5:
                alert = generate_weather_alert()
            else:
                alert = generate_social_media_alert()

            # Publish to Redis
            await publisher.publish_alert(alert)
            logger.info(f"📢 Published alert {alert.alert_id} ({alert.alert_type}, severity={alert.severity})")

            # Wait a few seconds before sending next
            await asyncio.sleep(random.randint(3, 8))

    except asyncio.CancelledError:
        logger.info("Publisher stopped by cancellation")
    except KeyboardInterrupt:
        logger.info("Publisher stopped by user")
    finally:
        await publisher.close()

# Removed duplicate publisher_main() function
    
    try:
        # Load configuration
        db_config, redis_url, jina_api_key = load_config()
        if not redis_url:
            logger.error("Failed to load Redis configuration")
            return 1
            
        # Initialize Redis client
        redis = aioredis.from_url(redis_url, decode_responses=True)
        await redis.ping()
        logger.info("✅ Connected to Redis")
        
        print("\n🚀 Publisher started. Sending fake alerts to Redis...")
        print("Press Ctrl+C to stop\n")
        
        counter = 1
        while True:
            try:
                # Create alert
                alert = random.choice(ALERT_TEMPLATES).copy()
                alert.update({
                    "id": f"alert_{int(time.time())}_{counter}",
                    "timestamp": datetime.utcnow().isoformat(),
                    "source": "simulator",
                    "content": f"{alert['type'].title()} alert in {alert['location']}",
                    "status": "new"
                })
                
                # Publish to Redis list
                await redis.rpush("alerts_queue", json.dumps(alert))
                print(f"📢 Published alert: {alert['type']} in {alert['location']} (id: {alert['id']})")
                
                counter += 1
                await asyncio.sleep(5)  # Send every 5 seconds
                
            except asyncio.CancelledError:
                print("\n🛑 Publisher shutting down...")
                break
            except Exception as e:
                logger.error(f"Error publishing alert: {e}")
                await asyncio.sleep(1)
                
        return 0
        
    except Exception as e:
        logger.error(f"Publisher error: {e}", exc_info=True)
        return 1
    finally:
        if 'redis' in locals():
            await redis.close()

async def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Disaster Alert Ingestion Worker')
    parser.add_argument('--mode', type=str, default='both', 
                       choices=['alerts', 'embeddings', 'both', 'publisher'],
                       help='Operation mode: alerts, embeddings, both, or publisher')
    
    args = parser.parse_args()
    
    try:
        if args.mode == 'publisher':
            print("Starting Disaster Alert Publisher...")
            await publisher_main()
            return
            
        print("Starting Disaster Alert Ingestion Worker...")
        print("Press Ctrl+C to stop the worker")
        
        # Load configuration
        db_config, redis_url, jina_api_key = load_config()
        if not all([db_config, redis_url, jina_api_key]):
            print("Error: Failed to load configuration")
            exit(1)
            
        # Initialize worker
        worker = IngestWorker(
            db_config=db_config,
            redis_url=redis_url,
            jina_api_key=jina_api_key
        )
        
        # Start stats loop
        stats_task = asyncio.create_task(worker.stats_loop())
        
        try:
            if args.mode == 'alerts':
                await worker.run_alert_processor()
            elif args.mode == 'embeddings':
                await worker.run_embedding_processor()
            else:  # both
                await asyncio.gather(
                    worker.run_alert_processor(),
                    worker.run_embedding_processor()
                )
        except asyncio.CancelledError:
            print("\nShutting down gracefully...")
        finally:
            stats_task.cancel()
            try:
                await stats_task
            except asyncio.CancelledError:
                pass
                
    except KeyboardInterrupt:
        print("\nWorker stopped by user")
    except Exception as e:
        print(f"\nFatal error: {e}")
        traceback.print_exc()
        exit(1)

# Data Models
@dataclass
class DisasterAlert:
    """Represents a disaster alert"""
    alert_id: str
    source: str
    alert_type: str
    severity: int
    location: Dict[str, float]  # lat, lng
    description: str
    timestamp: str
    metadata: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert alert to dictionary"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'DisasterAlert':
        """Create alert from dictionary"""
        return cls(**data)

def fake_fetch_weather_alerts():
    """Placeholder for real API calls to OpenWeather, Twitter, NASA"""
    return [
        {
            "source": "openweather",
            "summary": "Severe flood warning issued for Riverdale District",
            "lat": 12.34,
            "lon": 56.78,
            "severity": 4,
            "incident_type": "flood",
            "raw_data": {
                "alert_id": "OW_FL_001",
                "description": "Heavy rainfall causing river overflow",
                "start_time": "2024-01-15T10:00:00Z",
                "end_time": "2024-01-15T18:00:00Z"
            }
        },
        {
            "source": "twitter",
            "summary": "Multiple reports of wildfire smoke near Pine Valley",
            "lat": 34.56,
            "lon": 78.90,
            "severity": 3,
            "incident_type": "wildfire",
            "raw_data": {
                "tweet_id": "TW_WF_002",
                "user_reports": 15,
                "keywords": ["wildfire", "smoke", "evacuation"]
            }
        }
    ]

def generate_alert_id() -> str:
    """Generate a unique alert ID"""
    return f"alert_{uuid.uuid4().hex[:8]}"

def get_current_timestamp() -> str:
    """Get current UTC timestamp in ISO format"""
    return datetime.now(timezone.utc).isoformat()

# Mock Data Generators
def generate_weather_alert() -> DisasterAlert:
    """Generate a mock weather alert"""
    alert_types = ["flood", "cyclone", "heatwave", "cold_wave", "storm"]
    locations = [
        (28.6139, 77.2090),  # Delhi
        (19.0760, 72.8777),  # Mumbai
        (13.0827, 80.2707),  # Chennai
        (12.9716, 77.5946),  # Bengaluru
        (17.3850, 78.4867),  # Hyderabad
    ]
    
    lat, lng = random.choice(locations)
    alert_type = random.choice(alert_types)
    
    return DisasterAlert(
        alert_id=generate_alert_id(),
        source="weather_api",
        alert_type=alert_type,
        severity=random.randint(1, 5),
        location={"lat": lat + random.uniform(-0.1, 0.1), 
                 "lng": lng + random.uniform(-0.1, 0.1)},
        description=f"{alert_type.replace('_', ' ').title()} alert issued",
        timestamp=get_current_timestamp(),
        metadata={
            "confidence": round(random.uniform(0.7, 1.0), 2),
            "radius_km": random.randint(5, 50),
            "forecast_hours": random.randint(6, 72)
        }
    )

def generate_social_media_alert() -> DisasterAlert:
    """Generate a mock social media alert"""
    alert_types = ["fire", "earthquake", "flood", "landslide", "accident"]
    locations = [
        (18.5204, 73.8567),  # Pune
        (26.8467, 80.9462),  # Lucknow
        (22.5726, 88.3639),  # Kolkata
        (30.7333, 76.7794),  # Chandigarh
        (26.9124, 75.7873),  # Jaipur
    ]
    
    lat, lng = random.choice(locations)
    alert_type = random.choice(alert_types)
    
    return DisasterAlert(
        alert_id=generate_alert_id(),
        source="social_media",
        alert_type=alert_type,
        severity=random.randint(1, 5),
        location={"lat": lat + random.uniform(-0.1, 0.1), 
                 "lng": lng + random.uniform(-0.1, 0.1)},
        description=f"{alert_type.title()} reported on social media",
        timestamp=get_current_timestamp(),
        metadata={
            "reports": random.randint(1, 50),
            "platform": random.choice(["twitter", "facebook", "whatsapp"]),
            "verified": random.choice([True, False])
        }
    )
