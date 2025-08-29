/**
 * Retrieval API Routes - Day 4
 * Hybrid search and RAG endpoints
 */

const express = require('express');
const { retrieveAndGenerate, retrieveDisasterContext, getRetrievalStats } = require('../services/retrieverService');
const { hybridSearch, fullTextSearch, vectorSearch } = require('../services/searchService');
const pino = require('pino');

const router = express.Router();
const logger = pino({ name: 'retrieve-api' });

/**
 * POST /api/retrieve
 * Main hybrid search and RAG endpoint
 */
router.post('/', async (req, res) => {
  try {
    const {
      query,
      options = {},
      includeProtocols = true,
      includeSimilarIncidents = true,
      maxResults = 10,
      textWeight = 0.4,
      vectorWeight = 0.6,
      location = null,
      disasterType = null
    } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'Query parameter is required and must be a string',
        code: 'INVALID_QUERY'
      });
    }

    logger.info({ query, options }, 'Processing retrieval request');

    const result = await retrieveAndGenerate(query, {
      includeProtocols,
      includeSimilarIncidents,
      maxResults,
      textWeight,
      vectorWeight,
      location,
      disasterType,
      ...options
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(error, 'Retrieval request failed');
    res.status(500).json({
      error: 'Internal server error during retrieval',
      message: error.message,
      code: 'RETRIEVAL_ERROR'
    });
  }
});

/**
 * POST /api/retrieve/disaster
 * Retrieve context for specific disaster type and location
 */
router.post('/disaster', async (req, res) => {
  try {
    const {
      disasterType,
      location = null,
      options = {}
    } = req.body;

    if (!disasterType || typeof disasterType !== 'string') {
      return res.status(400).json({
        error: 'disasterType parameter is required and must be a string',
        code: 'INVALID_DISASTER_TYPE'
      });
    }

    logger.info({ disasterType, location }, 'Processing disaster context request');

    const result = await retrieveDisasterContext(disasterType, location, options);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(error, 'Disaster context request failed');
    res.status(500).json({
      error: 'Internal server error during disaster context retrieval',
      message: error.message,
      code: 'DISASTER_CONTEXT_ERROR'
    });
  }
});

/**
 * POST /api/retrieve/search
 * Direct hybrid search without RAG
 */
router.post('/search', async (req, res) => {
  try {
    const {
      query,
      searchType = 'hybrid', // 'hybrid', 'fulltext', 'vector'
      limit = 10,
      category = null,
      textWeight = 0.4,
      vectorWeight = 0.6
    } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'Query parameter is required and must be a string',
        code: 'INVALID_QUERY'
      });
    }

    logger.info({ query, searchType, limit }, 'Processing search request');

    let results;
    const options = { limit, category, textWeight, vectorWeight };

    switch (searchType) {
      case 'fulltext':
        results = await fullTextSearch(query, limit, category);
        break;
      case 'vector':
        // For vector search, we'd need an embedding - using mock for now
        const mockEmbedding = Array.from({ length: 768 }, () => Math.random() * 2 - 1);
        results = await vectorSearch(mockEmbedding, limit, category);
        break;
      case 'hybrid':
      default:
        // Generate mock embedding for hybrid search
        const queryEmbedding = Array.from({ length: 768 }, () => Math.random() * 2 - 1);
        results = await hybridSearch(query, queryEmbedding, options);
        break;
    }

    res.json({
      success: true,
      data: {
        query,
        searchType,
        results,
        metadata: {
          totalResults: results.length,
          searchOptions: options
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(error, 'Search request failed');
    res.status(500).json({
      error: 'Internal server error during search',
      message: error.message,
      code: 'SEARCH_ERROR'
    });
  }
});

/**
 * GET /api/retrieve/stats
 * Get retrieval performance statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    
    logger.info({ hours }, 'Processing stats request');

    const stats = await getRetrievalStats({ hours: parseInt(hours) });

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(error, 'Stats request failed');
    res.status(500).json({
      error: 'Internal server error during stats retrieval',
      message: error.message,
      code: 'STATS_ERROR'
    });
  }
});

/**
 * POST /api/retrieve/test
 * Test endpoint for different disaster scenarios
 */
router.post('/test', async (req, res) => {
  try {
    const testQueries = [
      'Flooding in coastal region',
      'Earthquake magnitude 7.2 in urban area',
      'Wildfire spreading near residential areas',
      'Cyclone approaching eastern coast',
      'Landslide blocking highway'
    ];

    logger.info('Processing test retrieval requests');

    const testResults = [];
    
    for (const query of testQueries) {
      try {
        const result = await retrieveAndGenerate(query, {
          maxResults: 5,
          textWeight: 0.4,
          vectorWeight: 0.6
        });
        
        testResults.push({
          query,
          success: true,
          incidentsFound: result.metadata.totalIncidents,
          protocolsFound: result.metadata.totalProtocols,
          responseTime: result.metadata.totalTime,
          ragGenerated: !!result.ragResponse
        });
      } catch (error) {
        testResults.push({
          query,
          success: false,
          error: error.message
        });
      }
    }

    const summary = {
      totalTests: testResults.length,
      successful: testResults.filter(r => r.success).length,
      failed: testResults.filter(r => !r.success).length,
      averageResponseTime: testResults
        .filter(r => r.success && r.responseTime)
        .reduce((sum, r) => sum + r.responseTime, 0) / testResults.filter(r => r.success).length || 0
    };

    res.json({
      success: true,
      data: {
        summary,
        results: testResults
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(error, 'Test request failed');
    res.status(500).json({
      error: 'Internal server error during testing',
      message: error.message,
      code: 'TEST_ERROR'
    });
  }
});

module.exports = router;
