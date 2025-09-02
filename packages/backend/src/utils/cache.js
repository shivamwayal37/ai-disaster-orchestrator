const crypto = require('crypto');
const Redis = require('ioredis');
const pino = require('pino');

const logger = pino({ name: 'utils-cache' });

// Redis client singleton
let redisClient = null;

/**
 * Initialize Redis client
 */
function initializeRedisClient() {
  if (redisClient) {
    return redisClient;
  }
  
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesOnError: null,
    lazyConnect: true,
    // Handle connection errors gracefully
    onError: (error) => {
      logger.warn({ error: error.message }, 'Redis connection error - cache disabled');
    }
  });
  
  // Test connection
  redisClient.ping().then(() => {
    logger.info('Redis cache connected successfully');
  }).catch((error) => {
    logger.warn({ error: error.message }, 'Redis cache connection failed - cache disabled');
  });
  
  return redisClient;
}

/**
 * Create cache key from parameters
 */
function createCacheKey(prefix, params) {
  // Create a deterministic hash of the parameters
  const paramString = JSON.stringify(params, Object.keys(params).sort());
  const hash = crypto.createHash('sha256').update(paramString).digest('hex').substring(0, 16);
  
  return `${prefix}:${hash}`;
}

/**
 * Get cached response
 */
async function getCachedResponse(key) {
  try {
    const client = initializeRedisClient();
    const cached = await client.get(key);
    
    if (cached) {
      const parsed = JSON.parse(cached);
      logger.debug({ key }, 'Cache hit');
      return parsed;
    }
    
    logger.debug({ key }, 'Cache miss');
    return null;
    
  } catch (error) {
    logger.warn({ error: error.message, key }, 'Cache get failed');
    return null; // Fail silently - don't break the main flow
  }
}

/**
 * Set cached response
 */
async function setCachedResponse(key, data, ttlSeconds = 3600) {
  try {
    const client = initializeRedisClient();
    const serialized = JSON.stringify(data);
    
    await client.setex(key, ttlSeconds, serialized);
    logger.debug({ key, ttl: ttlSeconds }, 'Cache set');
    
    return true;
    
  } catch (error) {
    logger.warn({ error: error.message, key }, 'Cache set failed');
    return false; // Fail silently
  }
}

/**
 * Delete cached response
 */
async function deleteCachedResponse(key) {
  try {
    const client = initializeRedisClient();
    const deleted = await client.del(key);
    
    logger.debug({ key, deleted: deleted > 0 }, 'Cache delete');
    return deleted > 0;
    
  } catch (error) {
    logger.warn({ error: error.message, key }, 'Cache delete failed');
    return false;
  }
}

/**
 * Clear all cached responses with a specific prefix
 */
async function clearCacheByPrefix(prefix) {
  try {
    const client = initializeRedisClient();
    const keys = await client.keys(`${prefix}:*`);
    
    if (keys.length === 0) {
      return 0;
    }
    
    const deleted = await client.del(...keys);
    logger.info({ prefix, deleted }, 'Cache cleared by prefix');
    
    return deleted;
    
  } catch (error) {
    logger.error({ error: error.message, prefix }, 'Cache clear failed');
    return 0;
  }
}

/**
 * Get cache statistics
 */
async function getCacheStats() {
  try {
    const client = initializeRedisClient();
    const info = await client.info('memory');
    const keyspace = await client.info('keyspace');
    
    return {
      connected: true,
      memory_info: info,
      keyspace_info: keyspace,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    return {
      connected: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Health check for cache system
 */
async function cacheHealthCheck() {
  try {
    const client = initializeRedisClient();
    const testKey = 'health_check_' + Date.now();
    const testValue = 'ok';
    
    // Test set
    await client.setex(testKey, 10, testValue);
    
    // Test get
    const retrieved = await client.get(testKey);
    
    // Test delete
    await client.del(testKey);
    
    return {
      healthy: retrieved === testValue,
      operations: ['set', 'get', 'del'],
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  createCacheKey,
  getCachedResponse,
  setCachedResponse,
  deleteCachedResponse,
  clearCacheByPrefix,
  getCacheStats,
  cacheHealthCheck,
  initializeRedisClient
};
