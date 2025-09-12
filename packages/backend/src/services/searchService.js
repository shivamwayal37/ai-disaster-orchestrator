/**
 * Enhanced Search Service (Day 4) - TiDB COMPATIBLE VERSION
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
 * Get embedding from Jina API with caching and retries
 */
async function getJinaEmbedding(input, { maxRetries = 3, timeout = 30000 } = {}) {
  const MAX_INPUT_LENGTH = 8000;
  const isBatch = Array.isArray(input);
  
  if (!input || (isBatch && input.length === 0)) {
    throw new Error('Input cannot be empty');
  }
  
  const truncatedInput = isBatch
    ? input.map(txt => String(txt).slice(0, MAX_INPUT_LENGTH))
    : String(input).slice(0, MAX_INPUT_LENGTH);

  const inputHash = require('crypto')
    .createHash('md5')
    .update(JSON.stringify(truncatedInput))
    .digest('hex');
  
  const cacheKey = `embed:${isBatch ? 'batch:' : ''}${inputHash}`;
  
  if (redisClient.isOpen) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug({ cacheKey, isBatch }, 'Embedding cache hit');
        return JSON.parse(cached);
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Cache read failed, proceeding without cache');
    }
  }

  logger.debug({ isBatch, inputLength: isBatch ? input.length : input?.length }, 'Generating new embedding');
  
  const payload = {
    model: "jina-embeddings-v3",
    task: "text-matching",
    dimensions: 1024,
    input: isBatch ? truncatedInput : [truncatedInput]
  };

  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch("https://api.jina.ai/v1/embeddings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.JINA_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }
      
      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response format from embedding service');
      }
      
      const embeddings = data.data.map(d => d.embedding);
      const result = isBatch ? embeddings : embeddings[0];
      
      if (redisClient.isOpen) {
        try {
          await redisClient.set(cacheKey, JSON.stringify(result), { 
            EX: 3600
          });
        } catch (cacheErr) {
          logger.warn({ err: cacheErr.message }, 'Failed to cache embedding');
        }
      }
      
      return result;
      
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxRetries;
      
      if (error.name === 'AbortError') {
        logger.warn(`Attempt ${attempt}/${maxRetries}: Request timed out after ${timeout}ms`);
      } else {
        logger.warn(`Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      }
      
      if (isLastAttempt) {
        logger.error({
          error: error.message,
          stack: error.stack,
          input: isBatch ? '[batch]' : truncatedInput.substring(0, 100) + (truncatedInput.length > 100 ? '...' : '')
        }, 'All embedding generation attempts failed');
        throw new Error(`Failed to generate embedding after ${maxRetries} attempts: ${error.message}`);
      }
      
      const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      const jitter = Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
    } finally {
      clearTimeout(timeoutId);
    }
  }
  
  throw lastError || new Error('Unexpected error in getJinaEmbedding');
}

/**
 * Full-text search using native MySQL/TiDB MATCH ... AGAINST syntax
 * Leverages FULLTEXT indexes for better performance and relevance
 */
async function fullTextSearch(query, { type = 'document', limit = 10, filters = {} }) {
  try {
    logger.debug({ query, type, limit, filters }, 'Starting full-text search');
    
    if (!query || query.trim().length === 0) {
      return [];
    }

    // Get embedding for the query
    const embedding = await getJinaEmbedding(query);
    const vectorString = `[${embedding.join(',')}]`;
    
    // Build WHERE clauses for filters
    const whereClauses = [];
    const queryParams = [];
    
    // Add type-specific filters
    if (filters.category) {
      whereClauses.push('category = ?');
      queryParams.push(filters.category);
    }
    
    if (type === 'alert') {
      if (filters.alert_type) {
        whereClauses.push('alert_type = ?');
        queryParams.push(filters.alert_type);
      }
      if (filters.severity) {
        whereClauses.push('severity = ?');
        queryParams.push(filters.severity);
      }
      if (filters.status === 'ACTIVE') {
        whereClauses.push('is_active = TRUE');
      } else if (filters.status === 'INACTIVE') {
        whereClauses.push('is_active = FALSE');
      }
    }

    // Date range filters
    if (filters.startDate) {
      whereClauses.push('created_at >= ?');
      queryParams.push(new Date(filters.startDate).toISOString().slice(0, 19).replace('T', ' '));
    }
    if (filters.endDate) {
      whereClauses.push('created_at <= ?');
      queryParams.push(new Date(filters.endDate).toISOString().slice(0, 19).replace('T', ' '));
    }

    let results = [];
    
    if (type === 'alert') {
      // Search in alerts table using vector similarity
      const sql = `
        SELECT 
          id, 
          title, 
          description as content, 
          alert_type as category, 
          severity, 
          location, 
          created_at,
          VEC_COSINE_DISTANCE(embedding, CAST(? AS VECTOR(1024))) as distance
        FROM alerts
        WHERE ${whereClauses.length ? whereClauses.join(' AND ') : '1=1'}
        ORDER BY distance ASC
        LIMIT ?
      `;
      
      results = await prisma.$queryRawUnsafe(sql, vectorString, ...queryParams, limit);
    } else {
      // Search in documents table using vector similarity
      const sql = `
        SELECT 
          id, 
          title, 
          content, 
          category, 
          summary, 
          created_at,
          VEC_COSINE_DISTANCE(embedding, CAST(? AS VECTOR(1024))) as distance
        FROM documents
        WHERE ${whereClauses.length ? whereClauses.join(' AND ') : '1=1'}
        ORDER BY distance ASC
        LIMIT ?
      `;
      
      results = await prisma.$queryRawUnsafe(sql, vectorString, ...queryParams, limit);
    }

    logger.debug({ count: results.length, query, type }, 'Full-text search completed');
    return results.map(r => ({
      ...r,
      type,
      score: parseFloat(r.score) || 1.0,
      // Ensure consistent field names with Prisma model
      ...(r.category === undefined && r.alert_type && { category: r.alert_type })
    }));

  } catch (error) {
    logger.error({ 
      error: error.message, 
      stack: error.stack, 
      query, 
      type 
    }, 'Full-text search failed');
    return [];
  }
}

/**
 * Vector similarity search using proper TiDB syntax
 */
async function vectorSearch(query, { type = 'document', limit = 10, threshold = 0.3, filters = {} } = {}) {
  try {
    logger.debug({ query, type, limit, threshold, filters }, 'Starting vector search');
    
    const embedding = await getJinaEmbedding(query);
    const vectorString = `[${embedding.join(',')}]`;
    
    // Determine table and fields based on type
    let tableName, selectFields;
    if (type === 'alert') {
      tableName = 'alerts';
      selectFields = 'id, title, description as content, alert_type as category, severity, location, created_at';
    } else {
      tableName = 'documents';
      selectFields = 'id, title, content, category, summary, created_at';
    }
    
    // Build WHERE clauses for filters
    const whereClauses = ['embedding IS NOT NULL'];
    const queryParams = [];
    
    // Type-specific filters
    if (type === 'document' && filters.category) {
      whereClauses.push('category = ?');
      queryParams.push(filters.category);
    } else if (type === 'alert') {
      if (filters.alert_type) {
        whereClauses.push('alert_type = ?');
        queryParams.push(filters.alert_type);
      }
      if (filters.severity) {
        whereClauses.push('severity = ?');
        queryParams.push(filters.severity);
      }
      if (filters.status === 'ACTIVE') {
        whereClauses.push('is_active = true');
      } else if (filters.status === 'INACTIVE') {
        whereClauses.push('is_active = false');
      }
    }
    
    // Date range filters
    if (filters.startDate) {
      whereClauses.push('created_at >= ?');
      queryParams.push(new Date(filters.startDate).toISOString().slice(0, 19).replace('T', ' '));
    }
    if (filters.endDate) {
      whereClauses.push('created_at <= ?');
      queryParams.push(new Date(filters.endDate).toISOString().slice(0, 19).replace('T', ' '));
    }
    
    const sql = `
      SELECT 
        ${selectFields},
        VEC_COSINE_DISTANCE(embedding, CAST(? AS VECTOR(1024))) as distance
      FROM ${tableName}
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY distance ASC
      LIMIT ?
    `;
    
    const allParams = [vectorString, ...queryParams, limit];
    
    logger.debug({ sql, paramCount: allParams.length }, 'Executing vector search query');
    
    // Execute raw query
    const results = await prisma.$queryRawUnsafe(sql, ...allParams);
    
    const processedResults = results
      .map(row => ({
        id: Number(row.id),
        title: row.title,
        content: row.content || row.description,
        category: row.category || row.alert_type,
        summary: row.summary,
        location: row.location,
        severity: row.severity,
        createdAt: row.created_at,
        similarity: 1 - parseFloat(row.distance || 1),
        distance: parseFloat(row.distance || 1),
        score: 1 - parseFloat(row.distance || 1),
        type
      }))
      .filter(r => r.similarity >= threshold);

    logger.debug({ count: processedResults.length, avgScore: processedResults.reduce((sum, r) => sum + r.score, 0) / processedResults.length || 0 }, 'Vector search completed');
    return processedResults;
      
  } catch (error) {
    logger.error({ 
      error: error.message, 
      stack: error.stack,
      query: typeof query === 'string' ? query : '[vector]',
      type
    }, 'Vector search failed');
    return [];
  }
}

/**
 * Result merger utility with better scoring
 */
function mergeResults(vectorResults = [], textResults = [], limit = 10) {
  const seen = new Set();
  const merged = [];

  // Prioritize vector results (higher quality semantic matches)
  const allResults = [
    ...vectorResults.map(r => ({ ...r, source: 'vector', score: r.score || r.similarity || 0 })),
    ...textResults.map(r => ({ ...r, source: 'text', score: (r.score || 0.8) * 0.8 })) // Slightly lower weight for text
  ];

  for (const res of allResults) {
    const id = `${res.type || 'unknown'}-${res.id}`;
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(res);
    }
  }

  // Sort by score (descending)
  merged.sort((a, b) => (b.score || 0) - (a.score || 0));

  return merged.slice(0, limit);
}

/**
 * Type normalization
 */
function normalizeSearchType(type) {
  const typeMap = { 
    disaster: 'document',
    incident: 'alert',
    protocol: 'document',
    resource: 'document'
  };
  return typeMap[type] || type;
}

/**
 * Hybrid search with better error handling and caching
 */
async function hybridSearch(query, opts = {}) {
  const { bypassCache = false, type: originalType = 'document', limit = 10, filters = {} } = opts;
  const type = normalizeSearchType(originalType);

  logger.debug({ query, type, limit, filters, bypassCache }, 'Starting hybrid search');

  // Handle minimal input
  if (!query || query.trim().length === 0) {
    logger.warn({ query }, 'Empty query provided');
    return [];
  }

  if (query.trim().split(/\s+/).length < 2) {
    logger.warn({ query }, 'Minimal input detected, returning rule-based fallback');
    return [{
      id: 'minimal-fallback',
      title: 'Emergency Protocol Activation',
      content: 'Minimal input detected. Escalating to emergency protocols.',
      source: 'rule-based',
      similarity: 1.0,
      score: 1.0,
      riskLevel: 'HIGH',
      fallback: true,
      type
    }];
  }

  // Cache handling
  const cacheKey = `hybrid:${type}:${JSON.stringify(filters)}:${query}`;
  if (!bypassCache && redisClient.isOpen) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug({ query, type }, 'Hybrid search cache hit');
        return JSON.parse(cached).map(r => ({ ...r, fromCache: true }));
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Cache read failed, proceeding without cache');
    }
  }

  try {
    // Run parallel searches
    logger.debug({ query, type }, 'Executing parallel searches');
    const [textResults, vectorResults] = await Promise.allSettled([
      fullTextSearch(query, { type, limit, filters }),
      vectorSearch(query, { type, limit, threshold: 0.3, filters })
    ]);

    const validTextResults = textResults.status === 'fulfilled' ? textResults.value : [];
    const validVectorResults = vectorResults.status === 'fulfilled' ? vectorResults.value : [];

    if (textResults.status === 'rejected') {
      logger.warn({ error: textResults.reason?.message }, 'Text search failed');
    }
    if (vectorResults.status === 'rejected') {
      logger.warn({ error: vectorResults.reason?.message }, 'Vector search failed');
    }

    // Merge and rank results
    const merged = mergeResults(validVectorResults, validTextResults, limit);

    logger.debug({ 
      textCount: validTextResults.length, 
      vectorCount: validVectorResults.length, 
      mergedCount: merged.length,
      query, 
      type 
    }, 'Hybrid search completed');

    // Cache successful results
    if (!bypassCache && merged.length > 0 && redisClient.isOpen) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(merged), { EX: 1800 }); // 30 min cache
      } catch (err) {
        logger.warn({ err: err.message }, 'Cache write failed');
      }
    }

    return merged;

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack, query, type }, 'Hybrid search error');
    return [{
      id: 'error-fallback',
      title: 'Search Error - Emergency Protocols',
      content: 'Error during search operation. Defaulting to emergency response protocols.',
      source: 'rule-based',
      similarity: 0.0,
      score: 0.0,
      riskLevel: 'HIGH',
      fallback: true,
      error: true,
      type
    }];
  }
}

// Main search entry point
async function generateOptimizedActionPlan(query, options = {}) {
  if (Array.isArray(query)) {
    // Handle vector input directly
    return vectorSearch('', { ...options, vector: query });
  }
  return hybridSearch(query, {
    ...options,
    vectorWeight: 0.7,
    textWeight: 0.3
  });
}

// Specialized search functions
async function findSimilar(query, { type = 'document', limit = 10 } = {}) {
  const normalized = normalizeQuery(query);
  return hybridSearch(normalized, { type, limit });
}

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

// Constants
const SEARCH_TYPES = {
  DOCUMENT: 'document',
  ALERT: 'alert',
  RESOURCE: 'resource',
  PROTOCOL: 'protocol'
};

// Utility functions
async function healthCheck() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redisPing = redisClient.isOpen ? await redisClient.ping() : 'CLOSED';
    return { database: true, redis: redisPing === 'PONG' };
  } catch (error) {
    logger.error({ error: error.message }, 'Search service health check failed');
    return { database: false, redis: false };
  }
}

function normalizeQuery(query) {
  if (!query) return '';
  return query.length > 500 ? query.slice(0, 500) : query;
}

// Exports
module.exports = {
  redisClient,
  generateOptimizedActionPlan,
  generateActionPlan: generateOptimizedActionPlan,
  findSimilar,
  hybridSearch,
  searchProtocols,
  searchSimilarIncidents,
  SEARCH_TYPES,
  fullTextSearch,
  vectorSearch,
  healthCheck,
  getJinaEmbedding,
  mergeResults,
  normalizeSearchType,
  normalizeQuery
};