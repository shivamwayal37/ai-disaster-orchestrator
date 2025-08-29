/**
 * Enhanced Search Service
 * Implements hybrid search combining full-text, vector similarity, and structured filters
 */

const { prisma } = require('../db');
const pino = require('pino');
const { getVectorStore } = require('./vectorStore');
const { getEmbeddingsClient } = require('./embeddingsClient');

const logger = pino({ name: 'search-service' });
const vectorStore = getVectorStore();
const embeddingsClient = getEmbeddingsClient();

// Search result types for better type safety
const SEARCH_TYPES = {
  DOCUMENT: 'document',
  ALERT: 'alert',
  RESOURCE: 'resource',
  PROTOCOL: 'protocol'
};

/**
 * Unified search across documents, alerts, and resources
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Search results
 */
async function search(query, options = {}) {
  const {
    types = ['document', 'alert', 'resource'], // What to search
    limit = 10, // Results per type
    threshold = 0.7, // Vector similarity threshold (0-1, higher is stricter)
    category = null, // Filter by category
    location = null, // { lat, lng, radiusInKm }
    dateRange = null, // { start, end }
    includeVectors = false // Whether to include vector data in results
  } = options;

  try {
    // Generate query embedding once for all vector searches
    const [queryEmbedding] = await embeddingsClient.generateEmbeddings([query]);
    
    // Prepare common filters
    const filters = [];
    if (category) filters.push(`category = '${category}'`);
    if (dateRange) {
      if (dateRange.start) filters.push(`publishedAt >= '${dateRange.start.toISOString()}'`);
      if (dateRange.end) filters.push(`publishedAt <= '${dateRange.end.toISOString()}'`);
    }
    const filterClause = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

    // Search each requested type in parallel
    const searchPromises = [];
    
    if (types.includes('document')) {
      searchPromises.push(
        vectorStore.hybridSearch(query, {
          model: 'documents',
          limit,
          threshold,
          filters: filterClause,
          includeVectors
        })
      );
    } else {
      searchPromises.push(Promise.resolve([]));
    }

    if (types.includes('alert')) {
      searchPromises.push(
        vectorStore.hybridSearch(query, {
          model: 'alerts',
          limit,
          threshold,
          filters: filterClause,
          includeVectors
        })
      );
    } else {
      searchPromises.push(Promise.resolve([]));
    }

    if (types.includes('resource')) {
      searchPromises.push(
        vectorStore.hybridSearch(query, {
          model: 'resources',
          limit,
          threshold,
          filters: filterClause,
          includeVectors
        })
      );
    } else {
      searchPromises.push(Promise.resolve([]));
    }

    // Wait for all searches to complete
    const [documents, alerts, resources] = await Promise.all(searchPromises);

    // Format and combine results
    const results = [
      ...documents.map(doc => ({ ...doc, type: SEARCH_TYPES.DOCUMENT })),
      ...alerts.map(alert => ({ ...alert, type: SEARCH_TYPES.ALERT })),
      ...resources.map(resource => ({ ...resource, type: SEARCH_TYPES.RESOURCE }))
    ];

    // Sort combined results by relevance
    results.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));

    return results.slice(0, limit);
  } catch (error) {
    logger.error({ error: error.message, query, options }, 'Search failed');
    throw error;
  }
      take: limit
    });

    // Calculate text relevance scores
    const scoredResults = results.map(doc => ({
      ...doc,
      textScore: calculateTextRelevance(query, doc),
      searchType: 'fulltext'
    }));

    logger.debug({
      query,
      resultsCount: scoredResults.length,
      category
    }, 'Full-text search completed');

    return scoredResults;

  } catch (error) {
}

/**
 * Find similar items by semantic similarity
 * @param {number[]} vector - Query vector
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Similar items
 */
async function findSimilar(vector, options = {}) {
  const {
    type = 'document', // document, alert, or resource
    limit = 5,
    threshold = 0.7,
    filters = {}
  } = options;

  try {
    return await vectorStore.findSimilar(vector, {
      model: type,
      limit,
      threshold,
      filters: Object.entries(filters)
        .map(([key, value]) => `${key} = '${value}'`)
        .join(' AND ')
    });
  } catch (error) {
    logger.error({ error: error.message, type }, 'Find similar failed');
    throw error;
  }
}

/**
 * Search for similar past incidents using hybrid search
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Similar incidents
 */
async function searchSimilarIncidents(query, options = {}) {
  const {
    limit = 5,
    threshold = 0.7,
    location = null,
    dateRange = null
  } = options;

  try {
    const results = await search(query, {
      types: ['document', 'alert'],
      limit,
      threshold,
      dateRange,
      // Add location filter if provided
      filters: location ? {
        latitude: { between: [location.lat - 0.1, location.lat + 0.1] },
        longitude: { between: [location.lng - 0.1, location.lng + 0.1] }
      } : {}
    });

    return results;
  } catch (error) {
    logger.error({ error: error.message, query }, 'Similar incidents search failed');
    throw error;
  }
}

/**
 * Search for relevant protocols based on disaster type
 * @param {string} disasterType - Type of disaster (e.g., 'earthquake', 'flood')
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Relevant protocols
 */
async function searchProtocols(disasterType, options = {}) {
  const {
    limit = 5,
    location = null,
    threshold = 0.7
  } = options;

  try {
    // Use hybrid search to find relevant protocols
    const results = await search(disasterType, {
      types: ['document'],
      category: 'protocol',
      limit: limit * 2, // Get more to filter by location
      threshold
    });

    // If location is provided, calculate distances
    if (location) {
      results.forEach(proto => {
        if (proto.latitude && proto.longitude) {
          proto.distance = calculateDistance(
            location.lat, location.lng,
            proto.latitude, proto.longitude
          );
        } else {
          proto.distance = null;
        }
      });

      // Sort by distance (nulls last) then by relevance
      results.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    }

    return results.slice(0, limit);
  } catch (error) {
    logger.error({ error: error.message, disasterType }, 'Protocol search failed');
    throw error;
  }
}

/**
 * Calculate text relevance score using simple heuristics
 */
function calculateTextRelevance(query, document) {
  const queryTerms = query.toLowerCase().split(/\s+/);
  const content = (document.content + ' ' + document.title + ' ' + (document.summary || '')).toLowerCase();
  
  let score = 0;
  let totalTerms = queryTerms.length;

  queryTerms.forEach(term => {
    if (term.length < 3) return; // Skip short terms
    
    const termCount = (content.match(new RegExp(term, 'g')) || []).length;
    if (termCount > 0) {
      score += Math.min(termCount / 10, 1); // Cap individual term contribution
    }
  });

  // Normalize by query length and add confidence boost
  const normalizedScore = (score / totalTerms) * (document.confidence || 0.8);
  
  return Math.min(normalizedScore, 1);
}

module.exports = {
  // Core search functions
  search,
  findSimilar,
  
  // Domain-specific search
  searchProtocols,
  searchSimilarIncidents,
  
  // Constants
  SEARCH_TYPES,
  
  // For backward compatibility
  hybridSearch: (query, options) => search(query, { ...options, types: ['document'] }),
  fullTextSearch: (query, options) => search(query, { ...options, types: ['document'], threshold: 0 }),
  vectorSearch: (vector, options) => findSimilar(vector, { ...options, type: 'document' })
};
