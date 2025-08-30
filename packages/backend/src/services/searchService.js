/**
 * Enhanced Search Service (Day 4)
 * Hybrid search: vector + keyword + filters
 */

const { prisma } = require('../db');
const pino = require('pino');
const { getVectorStore } = require('./vectorStore');
const { getEmbeddingsClient } = require('./embeddingsClient');

const logger = pino({ name: 'search-service' });
const vectorStore = getVectorStore();
const embeddingsClient = getEmbeddingsClient();

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
 * Vector similarity search (via Jina + TiDB vector col)
 */
async function vectorSearch(query, { type = 'document', limit = 10, threshold = 0.7, filters = {} }) {
  try {
    const [embedding] = await embeddingsClient.generateEmbeddings([query]);
    return vectorStore.findSimilar(embedding, { model: type, limit, threshold, filters });
  } catch (error) {
    logger.error({ error: error.message, query }, 'Vector search failed');
    return [];
  }
}

/**
 * Hybrid search = weighted merge of vector + keyword
 */
async function hybridSearch(query, {
  type = 'document',
  limit = 10,
  vectorWeight = 0.7,
  textWeight = 0.3,
  filters = {}
}) {
  const [vecResults, txtResults] = await Promise.all([
    vectorSearch(query, { type, limit, filters }),
    fullTextSearch(query, { type, limit, filters })
  ]);

  // Normalize weights
  const total = vectorWeight + textWeight;
  const vw = vectorWeight / total;
  const tw = textWeight / total;

  const resultMap = new Map();

  vecResults.forEach((doc, i) => {
    const key = `${type}_${doc.id}`;
    const score = (1 - i / vecResults.length) * vw;
    resultMap.set(key, { ...doc, vectorScore: score, textScore: 0, combinedScore: score });
  });

  txtResults.forEach((doc, i) => {
    const key = `${type}_${doc.id}`;
    const score = (1 - i / txtResults.length) * tw;
    if (resultMap.has(key)) {
      const existing = resultMap.get(key);
      resultMap.set(key, { ...existing, textScore: score, combinedScore: existing.combinedScore + score });
    } else {
      resultMap.set(key, { ...doc, vectorScore: 0, textScore: score, combinedScore: score });
    }
  });

  return Array.from(resultMap.values())
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, limit);
}

// Helper function to maintain backward compatibility
async function search(query, options = {}) {
  // If a vector is provided, use vector search
  if (Array.isArray(query)) {
    return vectorSearch('', { ...options, vector: query });
  }
  
  // Otherwise use hybrid search with default weights
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
      status: 'ACTIVE'  // Only search active alerts by default
    }
  });
}

/**
 * Search for disaster response protocols
 * @param {string} disasterType - Type of disaster to search for
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of matching protocols
 */
async function searchProtocols(disasterType, options = {}) {
  const { limit = 5, filters = {}, ...otherOptions } = options;
  
  return hybridSearch(disasterType, {
    type: 'document',
    limit,
    ...otherOptions,
    filters: {
      ...filters,
      category: 'protocol'
      // No status field in Document model, using only category filter
    }
  });
}

/**
 * Search result types for better type safety
 */
const SEARCH_TYPES = {
  DOCUMENT: 'document',
  ALERT: 'alert',
  RESOURCE: 'resource',
  PROTOCOL: 'protocol'
};

module.exports = {
  // Core search functions
  search,
  findSimilar,
  
  // Domain-specific search
  searchProtocols,
  searchSimilarIncidents,
  
  // Constants
  // Search types enum
  SEARCH_TYPES,
  
  /**
   * Hybrid search combining vector similarity and full-text search
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {number} [options.vectorWeight=0.7] - Weight for vector similarity (0-1)
   * @param {number} [options.textWeight=0.3] - Weight for full-text search (0-1)
   * @param {number} [options.limit=10] - Maximum number of results
   * @returns {Promise<Array>} Search results with combined scores
   */
  hybridSearch: async (query, options = {}) => {
    const {
      vectorWeight = 0.7,
      textWeight = 0.3,
      limit = 10,
      type = 'document',
      ...searchOptions
    } = options;

    // If no query is provided, return empty results
    if (!query) {
      return [];
    }

    // Normalize weights
    const totalWeight = vectorWeight + textWeight;
    const normalizedVectorWeight = vectorWeight / totalWeight;
    const normalizedTextWeight = textWeight / totalWeight;

    try {
      // Prepare search options
      const vectorSearchOptions = {
        ...searchOptions,
        type,
        threshold: 0,
        includeVectors: true
      };

      const textSearchOptions = {
        ...searchOptions,
        type,
        threshold: 0,
        includeVectors: false
      };

      // Run both searches in parallel
      const [vectorResults, textResults] = await Promise.all([
        vectorSearch(query, vectorSearchOptions).catch(err => {
          logger.warn({ error: err.message }, 'Vector search failed, falling back to text search');
          return [];
        }),
        fullTextSearch(query, textSearchOptions).catch(err => {
          logger.warn({ error: err.message }, 'Text search failed');
          return [];
        })
      ]);

      // Create a map of document IDs to their scores
      const resultMap = new Map();

      // Process vector results
      vectorResults.forEach((doc, index) => {
        const score = (1 - (index / Math.max(1, vectorResults.length))) * normalizedVectorWeight;
        resultMap.set(`${doc.id}`, {
          ...doc,
          vectorScore: score,
          textScore: 0,
          combinedScore: score
        });
      });

      // Process text results and combine scores
      textResults.forEach((doc, index) => {
        const key = `${doc.id}`;
        const score = (1 - (index / Math.max(1, textResults.length))) * normalizedTextWeight;
        
        if (resultMap.has(key)) {
          // Update existing result with text score
          const existing = resultMap.get(key);
          resultMap.set(key, {
            ...existing,
            textScore: score,
            combinedScore: existing.combinedScore + score
          });
        } else {
          // Add new result with text score only
          resultMap.set(key, {
            ...doc,
            vectorScore: 0,
            textScore: score,
            combinedScore: score
          });
        }
      });

      // Convert map to array, sort by combined score, and take top results
      return Array.from(resultMap.values())
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, limit);
        
    } catch (error) {
      logger.error({ error: error.message, query, options }, 'Hybrid search failed');
      // Fall back to simple text search if hybrid fails
      return fullTextSearch(query, { ...options, type, limit });
    }
  },
  
  // For backward compatibility
  fullTextSearch: (query, options) => search(query, { ...options, types: ['document'], threshold: 0 }),
  vectorSearch: (vector, options) => findSimilar(vector, { ...options, type: 'document' })
};
