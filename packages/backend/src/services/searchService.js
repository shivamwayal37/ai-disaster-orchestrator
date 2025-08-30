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
    return prisma[type].findMany({
      where: {
        AND: [
          { OR: [{ title: { contains: query } }, { content: { contains: query } }] },
          ...Object.entries(filters).map(([k, v]) => ({ [k]: v }))
        ]
      },
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

// Simplified protocol search
async function searchProtocols(disasterType, options = {}) {
  return hybridSearch(disasterType, {
    type: 'document',
    ...options,
    filters: {
      ...options.filters,
      category: 'protocol',
      // Add any additional protocol-specific filters
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
      ...searchOptions
    } = options;

    // Normalize weights
    const totalWeight = vectorWeight + textWeight;
    const normalizedVectorWeight = vectorWeight / totalWeight;
    const normalizedTextWeight = textWeight / totalWeight;

    try {
      // Run both searches in parallel
      const [vectorResults, textResults] = await Promise.all([
        search(query, { 
          ...searchOptions, 
          threshold: 0, 
          includeVectors: true 
        }),
        search(query, { 
          ...searchOptions, 
          threshold: 0,
          includeVectors: false
        })
      ]);

      // Create a map of document IDs to their scores
      const resultMap = new Map();

      // Process vector results
      vectorResults.forEach((doc, index) => {
        const score = (1 - (index / vectorResults.length)) * normalizedVectorWeight;
        resultMap.set(`${doc.type}_${doc.id}`, {
          ...doc,
          vectorScore: score,
          textScore: 0,
          combinedScore: score
        });
      });

      // Process text results and combine scores
      textResults.forEach((doc, index) => {
        const key = `${doc.type}_${doc.id}`;
        const score = (1 - (index / textResults.length)) * normalizedTextWeight;
        
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

      // Convert map to array, sort by combined score, and limit results
      return Array.from(resultMap.values())
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, limit);
        
    } catch (error) {
      logger.error({ error: error.message, query }, 'Hybrid search failed');
      throw error;
    }
  },
  
  // For backward compatibility
  fullTextSearch: (query, options) => search(query, { ...options, types: ['document'], threshold: 0 }),
  vectorSearch: (vector, options) => findSimilar(vector, { ...options, type: 'document' })
};
