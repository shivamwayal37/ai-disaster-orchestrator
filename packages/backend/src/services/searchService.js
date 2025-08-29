/**
 * Hybrid Search Service - Day 4
 * Implements full-text + vector similarity search with weighted ranking
 */

const { prisma } = require('../db');
const pino = require('pino');

const logger = pino({ name: 'search-service' });

/**
 * Full-text search using TiDB MATCH() AGAINST()
 */
async function fullTextSearch(query, limit = 10, category = null) {
  try {
    const whereClause = {
      AND: [
        // Full-text search condition
        {
          OR: [
            { content: { contains: query } },
            { title: { contains: query } },
            { summary: { contains: query } }
          ]
        }
      ]
    };

    // Add category filter if specified
    if (category) {
      whereClause.AND.push({ category });
    }

    const results = await prisma.document.findMany({
      where: whereClause,
      include: {
        alert: {
          select: {
            alertType: true,
            severity: true,
            location: true,
            latitude: true,
            longitude: true
          }
        }
      },
      orderBy: [
        { confidence: 'desc' },
        { publishedAt: 'desc' }
      ],
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
    logger.error(error, 'Full-text search failed');
    throw error;
  }
}

/**
 * Vector similarity search using TiDB Vector Search
 */
async function vectorSearch(queryEmbedding, limit = 10, category = null) {
  try {
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
      throw new Error('Invalid query embedding provided');
    }

    // Convert embedding array to vector format for TiDB
    const vectorString = `[${queryEmbedding.join(',')}]`;
    
    // Build SQL query for vector similarity search
    let sql = `
      SELECT 
        d.*,
        a.alert_type,
        a.severity,
        a.location,
        a.latitude,
        a.longitude,
        VEC_COSINE_DISTANCE(d.embedding, ?) as vectorDistance,
        (1 - VEC_COSINE_DISTANCE(d.embedding, ?)) as vectorScore
      FROM documents d
      LEFT JOIN alerts a ON d.alert_id = a.id
      WHERE d.embedding IS NOT NULL
    `;

    const params = [vectorString, vectorString];

    // Add category filter if specified
    if (category) {
      sql += ` AND d.category = ?`;
      params.push(category);
    }

    sql += `
      ORDER BY vectorDistance ASC
      LIMIT ?
    `;
    params.push(limit);

    const results = await prisma.$queryRawUnsafe(sql, ...params);

    const scoredResults = results.map(doc => ({
      ...doc,
      vectorScore: parseFloat(doc.vectorScore) || 0,
      vectorDistance: parseFloat(doc.vectorDistance) || 1,
      searchType: 'vector',
      alert: doc.alertType ? {
        alertType: doc.alertType,
        severity: doc.severity,
        location: doc.location,
        latitude: doc.latitude,
        longitude: doc.longitude
      } : null
    }));

    logger.debug({
      embeddingDim: queryEmbedding.length,
      resultsCount: scoredResults.length,
      category
    }, 'Vector search completed');

    return scoredResults;

  } catch (error) {
    logger.error(error, 'Vector search failed');
    throw error;
  }
}

/**
 * Hybrid search combining full-text and vector search with weighted ranking
 */
async function hybridSearch(query, queryEmbedding = null, options = {}) {
  const {
    limit = 10,
    category = null,
    textWeight = 0.4,
    vectorWeight = 0.6,
    minTextScore = 0.1,
    minVectorScore = 0.1
  } = options;

  try {
    logger.info({
      query,
      hasEmbedding: !!queryEmbedding,
      textWeight,
      vectorWeight,
      category
    }, 'Starting hybrid search');

    // Run both searches in parallel
    const [textResults, vectorResults] = await Promise.all([
      fullTextSearch(query, limit * 2, category),
      queryEmbedding ? vectorSearch(queryEmbedding, limit * 2, category) : Promise.resolve([])
    ]);

    // Create a map to combine results by document ID
    const combinedResults = new Map();

    // Process text search results
    textResults.forEach(doc => {
      const textScore = doc.textScore || 0;
      if (textScore >= minTextScore) {
        combinedResults.set(doc.id, {
          ...doc,
          textScore,
          vectorScore: 0,
          hybridScore: textWeight * textScore
        });
      }
    });

    // Process vector search results
    vectorResults.forEach(doc => {
      const vectorScore = doc.vectorScore || 0;
      if (vectorScore >= minVectorScore) {
        const existing = combinedResults.get(doc.id);
        if (existing) {
          // Update existing result with vector score
          existing.vectorScore = vectorScore;
          existing.hybridScore = textWeight * existing.textScore + vectorWeight * vectorScore;
          existing.searchType = 'hybrid';
        } else {
          // Add new vector-only result
          combinedResults.set(doc.id, {
            ...doc,
            textScore: 0,
            vectorScore,
            hybridScore: vectorWeight * vectorScore,
            searchType: 'vector'
          });
        }
      }
    });

    // Sort by hybrid score and return top results
    const finalResults = Array.from(combinedResults.values())
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, limit);

    logger.info({
      query,
      textResultsCount: textResults.length,
      vectorResultsCount: vectorResults.length,
      combinedResultsCount: finalResults.length,
      topScore: finalResults[0]?.hybridScore || 0
    }, 'Hybrid search completed');

    return finalResults;

  } catch (error) {
    logger.error(error, 'Hybrid search failed');
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

/**
 * Search for relevant protocols based on disaster type
 */
async function searchProtocols(disasterType, location = null, limit = 5) {
  try {
    const whereClause = {
      category: 'protocol',
      OR: [
        { content: { contains: disasterType } },
        { title: { contains: disasterType } }
      ]
    };

    if (location) {
      whereClause.OR.push(
        { content: { contains: location } },
        { title: { contains: location } }
      );
    }

    const protocols = await prisma.document.findMany({
      where: whereClause,
      orderBy: [
        { confidence: 'desc' },
        { updatedAt: 'desc' }
      ],
      take: limit
    });

    logger.debug({
      disasterType,
      location,
      protocolsFound: protocols.length
    }, 'Protocol search completed');

    return protocols;

  } catch (error) {
    logger.error(error, 'Protocol search failed');
    throw error;
  }
}

/**
 * Search for similar past incidents
 */
async function searchSimilarIncidents(query, queryEmbedding = null, options = {}) {
  const {
    limit = 10,
    excludeCategories = ['protocol'],
    timeRange = null // { start: Date, end: Date }
  } = options;

  try {
    const searchOptions = {
      ...options,
      limit: limit * 2 // Get more results to filter
    };

    // Exclude protocols from incident search
    if (excludeCategories.length > 0) {
      searchOptions.category = {
        notIn: excludeCategories
      };
    }

    const results = await hybridSearch(query, queryEmbedding, searchOptions);

    // Apply time range filter if specified
    let filteredResults = results;
    if (timeRange) {
      filteredResults = results.filter(doc => {
        const docDate = new Date(doc.publishedAt);
        return docDate >= timeRange.start && docDate <= timeRange.end;
      });
    }

    return filteredResults.slice(0, limit);

  } catch (error) {
    logger.error(error, 'Similar incidents search failed');
    throw error;
  }
}

module.exports = {
  fullTextSearch,
  vectorSearch,
  hybridSearch,
  searchProtocols,
  searchSimilarIncidents,
  calculateTextRelevance
};
