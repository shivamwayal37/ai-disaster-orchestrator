/**
 * Enhanced Search Service (Day 4)
 * Hybrid search: vector + keyword + filters
 */

const { prisma } = require('../db');
const pino = require('pino');
const { createClient } = require('redis');
const fetch = require('node-fetch');

const logger = pino({ name: 'search-service' });

// Initialize Redis client for caching
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));

// Only connect Redis in non-test environments
if (process.env.NODE_ENV !== 'test') {
  redisClient.connect().catch(console.error);
}

/**
 * Get embedding from Jina API with caching
 * @param {string} text - Text to get embedding for
 * @returns {Promise<number[]>} - Embedding vector
 */
async function getJinaEmbedding(text) {
  const MAX_INPUT_LENGTH = 512;
  const truncatedText = text.slice(0, MAX_INPUT_LENGTH);
  const cacheKey = `embedding:${truncatedText}`;

  try {
    const cachedEmbedding = await redisClient.get(cacheKey);
    if (cachedEmbedding) {
      logger.info({ query: truncatedText }, 'Embedding cache hit.');
      return JSON.parse(cachedEmbedding);
    }
  } catch (err) {
    logger.error({ err }, 'Redis GET failed for embedding cache');
  }

  logger.info({ query: truncatedText }, 'Embedding cache miss, fetching from API.');
  const payload = {
    model: "jina-embeddings-v3",
    task: "text-matching",
    dimensions: 1024,
    input: [truncatedText]
  };

  const resp = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.JINA_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Jina API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const embedding = data.data[0].embedding;

  try {
    // Cache the result for 1 hour
    await redisClient.set(cacheKey, JSON.stringify(embedding), { EX: 3600 });
  } catch (err) {
    logger.error({ err }, 'Redis SET failed for embedding cache');
  }

  return embedding;
}

/**
 * Full-text search (fallback / baseline)
 */
const DISASTER_TYPES = ['earthquake', 'wildfire', 'flood', 'cyclone', 'other', 'disaster'];

const MODEL_MAP = {
  document: (q) => prisma.document.findMany(q),
  alert: (q) => prisma.alert.findMany(q),
  resource: (q) => prisma.resource.findMany(q),
  protocol: (q) => prisma.document.findMany({ ...q, where: { ...q.where, category: 'protocol' } })
};

DISASTER_TYPES.forEach(type => {
  MODEL_MAP[type] = (q) => prisma.document.findMany({
    ...q,
    where: { ...q.where, category: type }
  });
});

async function fullTextSearch(query, { type = 'document', limit = 10, filters = {} }) {
  try {
    const searchCondition = {
      OR: [
        { title: { contains: query } },
        type === 'alert'
          ? { description: { contains: query } }
          : { content: { contains: query } }
      ]
    };

    const transformedFilters = { ...filters };
    if (type === 'alert' && 'status' in transformedFilters) {
      transformedFilters.isActive = transformedFilters.status === 'ACTIVE';
      delete transformedFilters.status;
    }

    const whereClause = Object.keys(transformedFilters).length > 0
      ? { AND: [searchCondition, transformedFilters] }
      : searchCondition;

    if (!MODEL_MAP[type]) {
      throw new Error(`Unsupported search type: ${type}`);
    }

    return await MODEL_MAP[type]({
      where: whereClause,
      take: limit
    });

  } catch (error) {
    logger.error({ error: error.message, query }, 'Full-text search failed');
    return [];
  }
}

/**
 * Vector similarity search using Jina embeddings
 * @param {string|number[]} query - Search query text or pre-computed embedding
 * @param {Object} options - Search options
 * @param {string} [options.type='document'] - Type of content to search
 * @param {number} [options.limit=10] - Maximum number of results
 * @param {number} [options.threshold=0.7] - Similarity threshold (0-1)
 * @param {Object} [options.filters={}] - Additional filters
 * @returns {Promise<Array>} Search results
 */
async function vectorSearch(query, { type = 'document', limit = 10, threshold = 0.7, filters = {} } = {}) {
  try {
    const queryEmbedding = Array.isArray(query)
      ? query
      : await getJinaEmbedding(query);

    const queryEmbeddingJson = JSON.stringify(queryEmbedding);

    // Vector search should always target the documents table.
    // The 'type' parameter is used to filter by category.
    const whereClauses = ['embedding IS NOT NULL'];
    const queryParams = [queryEmbeddingJson];

    if (type && type !== 'all') {
      whereClauses.push('category = ?');
      queryParams.push(type);
    }

    queryParams.push(Number(limit));

    const results = await prisma.$queryRawUnsafe(
      `SELECT id, title, content, category, created_at, VEC_COSINE_DISTANCE(embedding, CAST(? AS VECTOR(1024))) as distance
       FROM documents
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY distance ASC
       LIMIT ?`,
      ...queryParams
    );

    return results
      .map(r => {
        const { distance, ...rest } = r;
        return {
          ...rest,
          score: 1 - distance,
          content: `${r.title}: ${r.content}`.substring(0, 200) + (`${r.title}: ${r.content}`.length > 200 ? '...' : '')
        };
      })
      .filter(r => r.score >= threshold);

  } catch (error) {
    logger.error({ error: error.message, query }, 'Vector search failed');
    return [];
  }
}

/**
 * Hybrid search combining vector similarity and full-text search
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {number} [options.vectorWeight=0.7] - Weight for vector similarity (0-1)
 * @param {number} [options.textWeight=0.3] - Weight for full-text search (0-1)
 * @param {number} [options.limit=10] - Maximum number of results
 * @returns {Promise<Array>} Search results with combined scores
 */
// --- Result merger utility ---
function mergeResults(vectorResults = [], textResults = [], limit = 10) {
  const seen = new Set();
  const merged = [];

  // Normalize both arrays into a common format { id, score, ... }
  const allResults = [...vectorResults, ...textResults];

  for (const res of allResults) {
    const id = res.id || res._id || JSON.stringify(res); // flexible id
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(res);
    }
  }

  // If score field exists → sort descending
  if (merged.length > 0 && merged[0].score !== undefined) {
    merged.sort((a, b) => b.score - a.score);
  }

  return merged.slice(0, limit);
}

function normalizeSearchType(type) {
  const fallbackMap = { 
    disaster: 'document',
    incident: 'alert'
  };
  return fallbackMap[type] || type;
}

async function hybridSearch(query, opts = {}) {
  const { bypassCache = false, type: originalType = 'disaster', limit = 10, filters = {} } = opts;
  const type = normalizeSearchType(originalType);

  // --- 1. Minimal input handling ---
  if (query.trim().split(/\s+/).length < 2) {
    logger.warn({ query }, 'Too minimal input, forcing fallback response.');
    return [{
      id: 'minimal-fallback',
      source: 'rule-based',
      similarity: 1.0,
      riskLevel: 'HIGH',   // force HIGH
      fallback: true,
      final: true,         // new flag to skip post-processing
      message: 'Minimal input detected. Escalating to emergency protocols.'
    }];
  }

  // --- 2. Cache check (skip if bypassCache = true) ---
  if (!bypassCache) {
    const cacheKey = `hybrid:${query}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.info({ query }, 'Hybrid search cache hit.');
        // Add fromCache flag to results retrieved from cache
        return JSON.parse(cached).map(r => ({ ...r, fromCache: true }));
      }
    } catch (err) {
      logger.error({ err }, 'Redis GET failed for hybrid search cache');
    }
  }

  try {
    // --- 3. Parallel full-text + vector search ---
    const [textResults, vectorResults] = await Promise.all([
      fullTextSearch(query, { type, limit, filters }),
      vectorSearch(query, { type, limit, filters })
    ]);

    // --- 4. Merge + rank ---
    const merged = mergeResults(vectorResults, textResults, limit);

    // --- 5. Store in cache ---
    if (!bypassCache) {
      const cacheKey = `hybrid:${query}`;
      try {
        await redisClient.set(cacheKey, JSON.stringify(merged), { EX: 3600 });
      } catch (err) {
        logger.error({ err }, 'Redis SET failed for hybrid search cache');
      }
    }

    return merged;
  } catch (err) {
    logger.error({ err, query }, 'Hybrid search error');
    return [{
      id: 'fallback',
      source: 'rule-based',
      similarity: 0.0,
      riskLevel: 'HIGH',
      fallback: true,
      message: 'Error during search, defaulting to emergency protocols.'
    }];
  }
}

// Main search entry point
async function generateOptimizedActionPlan(query, options = {}) {
  if (Array.isArray(query)) {
    return vectorSearch('', { ...options, vector: query });
  }
  return hybridSearch(query, {
    ...options,
    vectorWeight: 0.7,
    textWeight: 0.3
  });
}

// Maintain backward compatibility with existing code
// --- Similar Results (with async cache prefill) ---
async function findSimilar(query, { type = 'disaster', limit = 10 } = {}) {
  const normalized = normalizeQuery(query);
  const cacheKey = `similar:${type}:${normalized}`;

  try {
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.info({ query }, 'Cache hit for similar search');
      return JSON.parse(cached);
    }

    const results = await hybridSearch(normalized, { type, limit });

    // async prefill for next time
    if (results && results.length > 0) {
      cache.set(cacheKey, JSON.stringify(results), { ttl: 60 }).catch(err =>
        logger.error({ err }, 'Cache prefill failed')
      );
    }
    return results;
  } catch (err) {
    logger.error({ err, query }, 'findSimilar failed');
    return [];
  }
}

// Simplified search for similar incidents
async function searchSimilarIncidents(query, options = {}) {
  return hybridSearch(query, {
    type: 'alert',
    ...options,
    filters: {
      ...options.filters,
      status: 'ACTIVE'
    }
  });
}

async function searchProtocols(disasterType, options = {}) {
  const { limit = 5, filters = {}, ...otherOptions } = options;
  return hybridSearch(disasterType, {
    type: 'document',
    limit,
    ...otherOptions,
    filters: {
      ...filters,
      category: 'protocol'
    }
  });
}

const SEARCH_TYPES = {
  DOCUMENT: 'document',
  ALERT: 'alert',
  RESOURCE: 'resource',
  PROTOCOL: 'protocol'
};

async function healthCheck() {
  try {
    await prisma.$queryRaw`SELECT 1`; // Check DB connection
    const redisPing = await redisClient.ping(); // Check Redis connection
    return redisPing === 'PONG';
  } catch (error) {
    logger.error({ error: error.message }, 'Search service health check failed');
    return false;
  }
}

// --- Timeout wrapper utility ---
function withTimeout(promise, ms, fallback = []) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), ms))
  ]);
}

// --- Utility: pick first non-empty result from multiple promises ---
async function firstNonEmpty(promises) {
  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value && r.value.length > 0) {
      return r.value;
    }
  }
  return [];
}

// --- Query Normalization Helper ---
function normalizeQuery(query) {
  if (!query) return '';
  return query.length > 500 ? query.slice(0, 500) : query;
}

function isMinimalInput(query) {
  const words = query.split(/\s+/);
  return words.length < 2 && query.length < 10;
}

// --- Earthquake Specialized Search (parallelized) ---
async function earthquakeModelSearch(query, options = {}) {
  const normalized = normalizeQuery(query);

  try {
    const results = await firstNonEmpty([
      hybridSearch(normalized, { ...options, filters: { ...options.filters, category: 'earthquake' } }),
      fullTextSearch(normalized, options)
    ]);
    return results;
  } catch (err) {
    logger.error({ err, query }, 'Earthquake specialized search failed');
    return [];
  }
}

module.exports = {
  redisClient,
  generateOptimizedActionPlan,
  generateActionPlan: generateOptimizedActionPlan, // Alias for backward compatibility
  findSimilar,
  hybridSearch,
  searchProtocols,
  searchSimilarIncidents,
  SEARCH_TYPES,
  fullTextSearch,
  vectorSearch,
  healthCheck
}

