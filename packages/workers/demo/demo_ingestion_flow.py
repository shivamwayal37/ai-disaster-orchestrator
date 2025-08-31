#!/usr/bin/env python3
"""
Demo script for testing the ingestion worker end-to-end flow.

This script:
1. Sends test alerts to the Redis queue
2. Runs the worker to process them
3. Verifies the results in TiDB
"""
import os
import sys
import asyncio
import json
import time
import random
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import aioredis
import mysql.connector
from mysql.connector import Error

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Sample alert data
SAMPLE_ALERTS = [
    {
        "source": "weather_api",
        "alert_type": "flood",
        "severity": 4,
        "location": "Mumbai, India",
        "latitude": 19.0760,
        "longitude": 72.8777,
        "content": "Severe flood warning for Mumbai. Heavy rainfall expected for next 48 hours. Water levels rising in low-lying areas near Mithi River. Authorities advised to take necessary precautions.",
        "metadata": {
            "forecast_confidence": 0.85,
            "affected_areas": ["Kurla", "Sion", "Bandra"],
            "wind_speed": "35 km/h",
            "rainfall": "250 mm"
        }
    },
    {
        "source": "twitter",
        "alert_type": "earthquake",
        "severity": 5,
        "location": "Uttarakhand, India",
        "latitude": 30.0668,
        "longitude": 79.0193,
        "content": "⚠️ #Earthquake Alert: Magnitude 6.2 earthquake detected in Uttarakhand region. Epicenter near Chamoli. Tremors felt in Dehradun, Rishikesh, and surrounding areas. #DisasterAlert",
        "metadata": {
            "magnitude": 6.2,
            "depth": "10 km",
            "reports": 245,
            "hashtags": ["#Earthquake", "#DisasterAlert"]
        }
    },
    {
        "source": "nasa_fire",
        "alert_type": "wildfire",
        "severity": 3,
        "location": "Bandipur National Park, Karnataka",
        "latitude": 11.6667,
        "longitude": 76.6333,
        "content": "Wildfire detected in Bandipur National Park. Fire spreading rapidly due to dry conditions. Forest department and fire services responding to the situation.",
        "metadata": {
            "confidence": 0.92,
            "area_affected": "5.2 sq km",
            "detection_time": datetime.utcnow().isoformat(),
            "satellite": "Terra"
        }
    },
    {
        "source": "ndrf",
        "alert_type": "cyclone",
        "severity": 5,
        "location": "Bay of Bengal",
        "latitude": 15.2,
        "longitude": 87.5,
        "content": "Cyclone warning: Severe cyclonic storm expected to make landfall in 36 hours. Wind speeds may reach 150 km/h. Coastal areas of Odisha and West Bengal on high alert. NDRF teams deployed.",
        "metadata": {
            "category": "Severe Cyclonic Storm",
            "wind_speed": "150 km/h",
            "landfall_time": (datetime.utcnow() + timedelta(hours=36)).isoformat(),
            "affected_districts": ["Puri", "Bhadrak", "Balasore", "Kendrapara"]
        }
    },
    {
        "source": "local_authority",
        "alert_type": "industrial_incident",
        "severity": 4,
        "location": "Vizag, Andhra Pradesh",
        "latitude": 17.6868,
        "longitude": 83.2185,
        "content": "Chemical leak reported at Hindustan Petroleum refinery. Authorities have declared a 2km exclusion zone. Residents advised to stay indoors and keep windows closed.",
        "metadata": {
            "chemical": "Benzene",
            "exclusion_radius_km": 2,
            "evacuation_centers": ["MVP Colony School", "Andhra University Grounds"],
            "emergency_contact": "1077"
        }
    }
]

class DemoIngestionFlow:
    """End-to-end demo of the ingestion flow"""
    
    def __init__(self):
        self.redis = None
        self.db = None
        self.config = self._load_config()
    
    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from environment variables"""
        # Parse DATABASE_URL if provided, otherwise use individual params
        db_url = os.getenv('DATABASE_URL')
        if db_url:
            # Parse the URL (format: mysql://user:pass@host:port/dbname)
            from urllib.parse import urlparse
            parsed = urlparse(db_url)
            db_config = {
                'host': parsed.hostname,
                'port': parsed.port or 4000,
                'user': parsed.username or 'root',
                'password': parsed.password or '',
                'database': parsed.path.lstrip('/') or 'disaster_response',
                'connection_string': db_url  # Keep the full URL for compatibility
            }
        else:
            # Fall back to individual environment variables
            db_config = {
                'host': os.getenv('TIDB_HOST', 'localhost'),
                'port': int(os.getenv('TIDB_PORT', '4000')),
                'user': os.getenv('TIDB_USER', 'root'),
                'password': os.getenv('TIDB_PASSWORD', ''),
                'database': os.getenv('TIDB_DATABASE', 'disaster_response'),
                'connection_string': None
            }

        return {
            'redis': {
                'url': os.getenv('REDIS_URL', 'redis://localhost:6379/0'),
                'alert_queue': 'alerts_queue',
                'embedding_queue': 'embedding_queue'
            },
            'database': db_config
        }
    
    async def connect_redis(self) -> bool:
        """Connect to Redis"""
        try:
            self.redis = await aioredis.from_url(
                self.config['redis']['url'],
                decode_responses=True
            )
            await self.redis.ping()
            print("✅ Connected to Redis")
            return True
        except Exception as e:
            print(f"❌ Failed to connect to Redis: {e}")
            return False
    
    def connect_database(self) -> bool:
        """Connect to TiDB using either connection string or individual parameters"""
        try:
            db_config = self.config['database'].copy()
            
            # If we have a connection string, use that directly
            if db_config.get('connection_string'):
                # For mysql-connector-python, we need to remove the scheme
                conn_string = db_config['connection_string'].replace('mysql://', '')
                self.db = mysql.connector.connect(
                    user=db_config['user'],
                    password=db_config['password'],
                    host=db_config['host'],
                    port=db_config['port'],
                    database=db_config['database'],
                    autocommit=True
                )
            else:
                # Fall back to individual parameters
                self.db = mysql.connector.connect(
                    host=db_config['host'],
                    port=db_config['port'],
                    user=db_config['user'],
                    password=db_config['password'],
                    database=db_config['database'],
                    autocommit=True
                )
            
            print("✅ Connected to TiDB")
            return True
        except Error as e:
            print(f"❌ Failed to connect to TiDB: {e}")
            if hasattr(e, 'errno'):
                print(f"Error code: {e.errno}")
            if hasattr(e, 'sqlstate'):
                print(f"SQL State: {e.sqlstate}")
            if hasattr(e, 'msg'):
                print(f"Message: {e.msg}")
            return False
    
    async def cleanup(self):
        """Clean up resources"""
        if self.redis:
            await self.redis.close()
        if self.db and self.db.is_connected():
            self.db.close()
    
    async def clear_queues(self):
        """Clear Redis queues"""
        if not self.redis:
            return
            
        try:
            # Delete the queues
            await self.redis.delete(
                self.config['redis']['alert_queue'],
                self.config['redis']['embedding_queue']
            )
            print("🧹 Cleared Redis queues")
        except Exception as e:
            print(f"⚠️ Failed to clear Redis queues: {e}")
    
    async def send_test_alerts(self, count: int = 5) -> List[str]:
        """Send test alerts to the queue
        
        Args:
            count: Number of alerts to send
            
        Returns:
            List of alert IDs
        """
        if not self.redis:
            print("❌ Not connected to Redis")
            return []
        
        alerts = random.sample(SAMPLE_ALERTS, min(count, len(SAMPLE_ALERTS)))
        alert_ids = []
        
        for i, alert in enumerate(alerts, 1):
            # Add timestamp if not present
            if 'timestamp' not in alert:
                alert['timestamp'] = datetime.utcnow().isoformat()
            
            # Generate a unique ID for the alert
            alert_id = f"demo_{int(time.time())}_{i}"
            alert['id'] = alert_id
            
            # Add to alert IDs
            alert_ids.append(alert_id)
            
            # Publish to Redis
            await self.redis.lpush(
                self.config['redis']['alert_queue'],
                json.dumps(alert, default=str)
            )
            
            print(f"📤 Sent alert {i}/{count}: {alert['alert_type'].title()} in {alert['location']}")
            
            # Small delay between alerts
            await asyncio.sleep(0.1)
        
        return alert_ids
    
    async def verify_alerts_in_database(self, alert_ids: List[str]) -> bool:
        """Verify that alerts were processed and stored in the database
        
        Args:
            alert_ids: List of alert IDs to verify
            
        Returns:
            bool: True if all alerts were found with embeddings
        """
        if not self.db or not self.db.is_connected():
            print("❌ Not connected to database")
            return False
        
        cursor = self.db.cursor(dictionary=True)
        
        try:
            # Check if alerts exist in the database
            placeholders = ', '.join(['%s'] * len(alert_ids))
            query = f"""
            SELECT id, source, alert_type, embedding_status, 
                   LENGTH(embedding) > 0 as has_embedding
            FROM alerts
            WHERE id IN ({placeholders})
            """
            
            cursor.execute(query, tuple(alert_ids))
            results = cursor.fetchall()
            
            if not results:
                print("❌ No alerts found in database")
                return False
            
            # Create a mapping of alert ID to status
            status_map = {r['id']: r for r in results}
            all_ok = True
            
            # Check each alert
            for alert_id in alert_ids:
                alert_status = status_map.get(alert_id)
                if not alert_status:
                    print(f"❌ Alert {alert_id} not found in database")
                    all_ok = False
                    continue
                
                if alert_status['embedding_status'] != 'completed':
                    print(f"❌ Alert {alert_id} has status '{alert_status['embedding_status']}', expected 'completed'")
                    all_ok = False
                elif not alert_status['has_embedding']:
                    print(f"❌ Alert {alert_id} has no embedding")
                    all_ok = False
                else:
                    print(f"✅ Alert {alert_id} processed successfully ({alert_status['source']} - {alert_status['alert_type']})")
            
            return all_ok
            
        except Error as e:
            print(f"❌ Database error: {e}")
            return False
        finally:
            cursor.close()
    
    async def run_demo(self, alert_count: int = 5):
        """Run the end-to-end demo"""
        print("🚀 Starting ingestion flow demo")
        print("=" * 50)
        
        try:
            # Connect to services
            print("\n🔌 Connecting to services...")
            redis_ok = await self.connect_redis()
            db_ok = self.connect_database()
            
            if not redis_ok or not db_ok:
                print("❌ Failed to connect to required services")
                return
            
            # Clear any existing data
            print("\n🧹 Cleaning up...")
            await self.clear_queues()
            
            # Send test alerts
            print(f"\n📤 Sending {alert_count} test alerts...")
            alert_ids = await self.send_test_alerts(alert_count)
            if not alert_ids:
                print("❌ Failed to send test alerts")
                return
            
            print("\n⏳ Waiting for worker to process alerts (this may take a minute)...")
            
            # Wait for processing to complete
            max_wait = 120  # 2 minutes max
            start_time = time.time()
            processed = False
            
            while (time.time() - start_time) < max_wait:
                # Check if all alerts have been processed
                await asyncio.sleep(5)  # Check every 5 seconds
                
                # Verify alerts in database
                if await self.verify_alerts_in_database(alert_ids):
                    processed = True
                    break
                    
                print("⏳ Still processing...")
            
            if not processed:
                print("\n❌ Timed out waiting for alerts to be processed")
                return
            
            print("\n✅ All alerts processed successfully!")
            
            # Show summary
            print("\n📊 Demo Summary:")
            print(f"- Sent {len(alert_ids)} alerts")
            print(f"- All alerts processed and stored with embeddings")
            
            # Show example vector search
            if alert_ids:
                print("\n🔍 Running example vector search...")
                await self.run_example_search()
            
        except KeyboardInterrupt:
            print("\n🛑 Demo interrupted by user")
        except Exception as e:
            print(f"\n❌ Error during demo: {e}")
            import traceback
            traceback.print_exc()
        finally:
            print("\n🧹 Cleaning up...")
            await self.cleanup()
    
    async def run_example_search(self):
        """Run an example vector search"""
        if not self.db or not self.db.is_connected():
            print("❌ Not connected to database")
            return
        
        cursor = self.db.cursor(dictionary=True)
        
        try:
            # Get a random alert to use as query
            cursor.execute("""
                SELECT id, content, embedding 
                FROM alerts 
                WHERE embedding IS NOT NULL
                ORDER BY RAND() 
                LIMIT 1
            """)
            
            example = cursor.fetchone()
            if not example:
                print("❌ No alerts with embeddings found")
                return
            
            query_text = example['content']
            query_embedding = example['embedding']
            
            print(f"\n🔎 Searching for similar alerts to: '{query_text[:100]}...'")
            
            # Run the vector search
            cursor.execute("""
                SELECT 
                    id, 
                    alert_type,
                    content,
                    VECTOR_DISTANCE(embedding, %s) as similarity
                FROM alerts
                WHERE id != %s
                ORDER BY similarity DESC
                LIMIT 3
            """, (query_embedding, example['id']))
            
            results = cursor.fetchall()
            
            if not results:
                print("No similar alerts found")
                return
            
            print(f"\nTop {len(results)} similar alerts:")
            for i, result in enumerate(results, 1):
                print(f"\n{i}. Similarity: {result['similarity']:.4f}")
                print(f"   Type: {result['alert_type']}")
                print(f"   Content: {result['content'][:150]}...")
        
        except Error as e:
            print(f"❌ Database error during search: {e}")
        finally:
            cursor.close()

async def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Demo the ingestion worker flow')
    parser.add_argument('--count', type=int, default=3,
                       help='Number of test alerts to send (default: 3)')
    
    args = parser.parse_args()
    
    demo = DemoIngestionFlow()
    await demo.run_demo(args.count)

if __name__ == "__main__":
    asyncio.run(main())
