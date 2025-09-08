/**
 * Redis Cache Service for AI Orchestration
 * Reduces response times from 55s to 5-15s for repeat queries
 */

const crypto = require('crypto');
const pino = require('pino');

const logger = pino({ name: 'cache-service' });

class CacheService {
  constructor() {
    this.redis = null;
    this.enabled = false;
    this.defaultTTL = 3600; // 1 hour
  }

  async init() {
    try {
      // Try to use Redis if available, otherwise use in-memory cache
      if (process.env.REDIS_URL) {
        const redis = require('redis');
        this.redis = redis.createClient({
          url: process.env.REDIS_URL
        });
        
        await this.redis.connect();
        this.enabled = true;
        logger.info('Redis cache initialized successfully');
      } else {
        // Fallback to in-memory cache
        this.memoryCache = new Map();
        this.enabled = true;
        logger.info('In-memory cache initialized (Redis not available)');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to initialize cache service');
      this.enabled = false;
    }
  }

  /**
   * Generate cache key for disaster response plans
   */
  generateCacheKey(query, type, location, severity) {
    const normalizedData = {
      query: query.toLowerCase().trim(),
      type: type.toLowerCase(),
      location: location.toLowerCase().trim(),
      severity: severity?.toLowerCase() || 'medium'
    };
    
    const dataString = JSON.stringify(normalizedData);
    const hash = crypto.createHash('sha256').update(dataString).digest('hex');
    return `disaster_plan:${hash}`;
  }

  /**
   * Get cached action plan
   */
  async get(cacheKey) {
    if (!this.enabled) return null;

    try {
      if (this.redis) {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const data = JSON.parse(cached);
          logger.info({ cacheKey }, 'Cache hit - Redis');
          return {
            ...data,
            metadata: {
              ...data.metadata,
              cached: true,
              cache_source: 'redis'
            }
          };
        }
      } else if (this.memoryCache) {
        const cached = this.memoryCache.get(cacheKey);
        if (cached && cached.expires > Date.now()) {
          logger.info({ cacheKey }, 'Cache hit - Memory');
          return {
            ...cached.data,
            metadata: {
              ...cached.data.metadata,
              cached: true,
              cache_source: 'memory'
            }
          };
        } else if (cached) {
          // Remove expired entry
          this.memoryCache.delete(cacheKey);
        }
      }
      
      logger.debug({ cacheKey }, 'Cache miss');
      return null;
    } catch (error) {
      logger.error({ error, cacheKey }, 'Cache get error');
      return null;
    }
  }

  /**
   * Store action plan in cache
   */
  async set(cacheKey, data, ttl = this.defaultTTL) {
    if (!this.enabled) return;

    try {
      const cacheData = {
        ...data,
        metadata: {
          ...data.metadata,
          cached_at: new Date().toISOString(),
          cache_ttl: ttl
        }
      };

      if (this.redis) {
        await this.redis.setEx(cacheKey, ttl, JSON.stringify(cacheData));
        logger.info({ cacheKey, ttl }, 'Cached to Redis');
      } else if (this.memoryCache) {
        this.memoryCache.set(cacheKey, {
          data: cacheData,
          expires: Date.now() + (ttl * 1000)
        });
        logger.info({ cacheKey, ttl }, 'Cached to memory');
        
        // Clean up expired entries periodically
        this.cleanupMemoryCache();
      }
    } catch (error) {
      logger.error({ error, cacheKey }, 'Cache set error');
    }
  }

  /**
   * Check if a similar plan exists (fuzzy matching)
   */
  async findSimilar(query, type, location) {
    if (!this.enabled) return null;

    try {
      // Generate variations of the cache key for fuzzy matching
      const variations = [
        this.generateCacheKey(query, type, location, 'high'),
        this.generateCacheKey(query, type, location, 'medium'),
        this.generateCacheKey(query, type, location, 'critical'),
        this.generateCacheKey(query, type, location, 'low')
      ];

      for (const key of variations) {
        const cached = await this.get(key);
        if (cached) {
          logger.info({ originalQuery: query, foundKey: key }, 'Found similar cached plan');
          return cached;
        }
      }

      return null;
    } catch (error) {
      logger.error({ error }, 'Error finding similar cache entries');
      return null;
    }
  }

  /**
   * Clean up expired memory cache entries
   */
  cleanupMemoryCache() {
    if (!this.memoryCache) return;

    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.memoryCache.entries()) {
      if (value.expires <= now) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug({ cleaned }, 'Cleaned up expired cache entries');
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    const stats = {
      enabled: this.enabled,
      type: this.redis ? 'redis' : 'memory',
      default_ttl: this.defaultTTL
    };

    if (this.redis) {
      try {
        const info = await this.redis.info('memory');
        stats.redis_memory = info;
      } catch (error) {
        logger.error({ error }, 'Failed to get Redis stats');
      }
    } else if (this.memoryCache) {
      stats.memory_entries = this.memoryCache.size;
    }

    return stats;
  }

  /**
   * Clear all cache entries
   */
  async clear() {
    if (!this.enabled) return;

    try {
      if (this.redis) {
        await this.redis.flushAll();
        logger.info('Redis cache cleared');
      } else if (this.memoryCache) {
        this.memoryCache.clear();
        logger.info('Memory cache cleared');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to clear cache');
    }
  }

  /**
   * Close cache connections
   */
  async close() {
    if (this.redis) {
      await this.redis.quit();
      logger.info('Redis connection closed');
    }
  }
}

// Export singleton instance
const cacheService = new CacheService();
module.exports = { cacheService };
