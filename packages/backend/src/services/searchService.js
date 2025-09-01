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
redisClient.connect().catch(console.error);

/**
 * Get embedding from Jina API
 * @param {string} text - Text to get embedding for
 * @returns {Promise<number[]>} - Embedding vector
 */
async function getJinaEmbedding(text) {
  const payload = {
    model: "jina-embeddings-v3",
    task: "text-matching",
    dimensions: 1024,
    input: [text]
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
  return data.data[0].embedding;
}

/**
 * Full-text search (fallback / baseline)
 */
async function fullTextSearch(query, { type = 'document', limit = 10, filters = {} }) {
  try {
    // Base where clause with search conditions
    const searchCondition = {
      OR: [
        { title: { contains: query } },
        type === 'alert' 
          ? { description: { contains: query } } 
          : { content: { contains: query } }
      ]
    };

    // Transform filters to match schema (e.g., status -> isActive for Alert model)
    const transformedFilters = { ...filters };
    if (type === 'alert' && 'status' in transformedFilters) {
      transformedFilters.isActive = transformedFilters.status === 'ACTIVE';
      delete transformedFilters.status;
    }
    
    // Combine with any additional filters
    const whereClause = Object.keys(transformedFilters).length > 0
      ? { AND: [searchCondition, transformedFilters] }
      : searchCondition;
    
    return prisma[type].findMany({
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
async function hybridSearch(query, options = {}) {
  const {
    vectorWeight = 0.7,
    textWeight = 0.3,
    limit = 10,
    type = 'document',
    ...searchOptions
  } = options;

  if (!query) {
    return [];
  }

  const totalWeight = vectorWeight + textWeight;
  const normalizedVectorWeight = vectorWeight / totalWeight;
  const normalizedTextWeight = textWeight / totalWeight;

  try {
    const [vectorResults, textResults] = await Promise.all([
      vectorSearch(query, { ...searchOptions, type }).catch(err => {
        logger.warn({ error: err.message }, 'Vector search failed, falling back to text search');
        return [];
      }),
      fullTextSearch(query, { ...searchOptions, type }).catch(err => {
        logger.warn({ error: err.message }, 'Text search failed');
        return [];
      })
    ]);

    const resultMap = new Map();

    vectorResults.forEach((doc, index) => {
      const score = (1 - (index / Math.max(1, vectorResults.length))) * normalizedVectorWeight;
      resultMap.set(`${doc.id}`, {
        ...doc,
        vectorScore: score,
        textScore: 0,
        combinedScore: score
      });
    });

    textResults.forEach((doc, index) => {
      const key = `${doc.id}`;
      const score = (1 - (index / Math.max(1, textResults.length))) * normalizedTextWeight;
      
      if (resultMap.has(key)) {
        const existing = resultMap.get(key);
        resultMap.set(key, {
          ...existing,
          textScore: score,
          combinedScore: existing.combinedScore + score
        });
      } else {
        resultMap.set(key, {
          ...doc,
          vectorScore: 0,
          textScore: score,
          combinedScore: score
        });
      }
    });

    return Array.from(resultMap.values())
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, limit);
      
  } catch (error) {
    logger.error({ error: error.message, query, options }, 'Hybrid search failed');
    return fullTextSearch(query, { ...options, type, limit });
  }
}

// Helper function to maintain backward compatibility
async function search(query, options = {}) {
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
async function findSimilar(vector, options = {}) {
  return vectorSearch('', { ...options, vector });
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

module.exports = {
  search,
  findSimilar,
  hybridSearch,
  searchProtocols,
  searchSimilarIncidents,
  SEARCH_TYPES,
  fullTextSearch,
  vectorSearch
};
