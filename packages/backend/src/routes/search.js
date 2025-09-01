const express = require('express');
const { prisma } = require('../db');
const pino = require('pino');
const { vectorSearch } = require('../services/searchService');

const router = express.Router();
const logger = pino({ name: 'search' });

// Full-text search endpoint
router.get('/fulltext', async (req, res) => {
  try {
    const { query, category, limit = 10 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // Search documents using full-text search
    const documents = await prisma.$queryRaw`
      SELECT 
        id, 
        title, 
        category,
        LEFT(content, 200) as content_preview,
        MATCH(content) AGAINST(${query} IN NATURAL LANGUAGE MODE) as relevance_score
      FROM documents 
      WHERE MATCH(content) AGAINST(${query} IN NATURAL LANGUAGE MODE)
        ${category ? prisma.$queryRaw`AND category = ${category}` : prisma.$queryRaw``}
      ORDER BY relevance_score DESC
      LIMIT ${parseInt(limit)}
    `;

    logger.info({ query, results: documents.length }, 'Full-text search completed');
    
    res.json({
      query,
      results: documents,
      total: documents.length
    });
    
  } catch (error) {
    logger.error(error, 'Full-text search failed');
    res.status(500).json({ error: 'Search failed' });
  }
});

// Vector similarity search endpoint
router.get('/vector', async (req, res) => {
  try {
    const { query, limit = 10, threshold = 0.7, type = 'alert' } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const results = await vectorSearch(query, { 
        limit: parseInt(limit), 
        threshold: parseFloat(threshold),
        type
    });

    logger.info({ query, results: results.length }, 'Vector search completed');

    res.json({
      query,
      results,
      total: results.length
    });

  } catch (error) {
    logger.error(error, 'Vector search failed');
    res.status(500).json({ error: 'Vector search failed' });
  }
});

// Hybrid search combining full-text and vector
router.get('/hybrid', async (req, res) => {
  try {
    const { query, alpha = 0.6, limit = 10 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // Get full-text results
    const textResults = await prisma.$queryRaw`
      SELECT 
        id, 
        title, 
        category,
        LEFT(content, 200) as content_preview,
        MATCH(content) AGAINST(${query} IN NATURAL LANGUAGE MODE) as text_score
      FROM documents 
      WHERE MATCH(content) AGAINST(${query} IN NATURAL LANGUAGE MODE)
      ORDER BY text_score DESC
      LIMIT ${parseInt(limit) * 2}
    `;

    // TODO: Get vector results and combine with text results
    // For now, add mock vector scores
    const hybridResults = textResults.map(doc => {
      const vectorScore = Math.random() * 0.5 + 0.5; // Mock vector score
      const hybridScore = parseFloat(alpha) * parseFloat(doc.text_score) + 
                         (1 - parseFloat(alpha)) * vectorScore;
      
      return {
        ...doc,
        text_score: parseFloat(doc.text_score),
        vector_score: vectorScore,
        hybrid_score: hybridScore
      };
    }).sort((a, b) => b.hybrid_score - a.hybrid_score).slice(0, parseInt(limit));

    logger.info({ 
      query, 
      alpha: parseFloat(alpha), 
      results: hybridResults.length 
    }, 'Hybrid search completed');
    
    res.json({
      query,
      alpha: parseFloat(alpha),
      results: hybridResults,
      total: hybridResults.length
    });
    
  } catch (error) {
    logger.error(error, 'Hybrid search failed');
    res.status(500).json({ error: 'Hybrid search failed' });
  }
});

// Resource search with geospatial filtering
router.get('/resources', async (req, res) => {
  try {
    const { 
      query, 
      lat, 
      lon, 
      radius = 50, 
      type, 
      limit = 10 
    } = req.query;

    let whereClause = { isActive: true };
    
    if (type) {
      whereClause.type = type;
    }

    const resources = await prisma.resource.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        type: true,
        address: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
        capacity: true,
        currentLoad: true,
        isEmergency: true,
        phone: true,
        services: true
      },
      take: parseInt(limit) * 2 // Get more for distance filtering
    });

    let results = resources;

    // Apply geospatial filtering if coordinates provided
    if (lat && lon) {
      results = resources.map(resource => {
        // Haversine distance calculation (approximate)
        const R = 6371; // Earth's radius in km
        const dLat = (resource.latitude - parseFloat(lat)) * Math.PI / 180;
        const dLon = (resource.longitude - parseFloat(lon)) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(parseFloat(lat) * Math.PI / 180) * Math.cos(resource.latitude * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;

        return {
          ...resource,
          distance_km: Math.round(distance * 100) / 100,
          available_capacity: resource.capacity - (resource.currentLoad || 0)
        };
      }).filter(resource => resource.distance_km <= parseFloat(radius))
        .sort((a, b) => a.distance_km - b.distance_km)
        .slice(0, parseInt(limit));
    }

    // Apply text search if query provided
    if (query) {
      const searchResults = await prisma.$queryRaw`
        SELECT 
          id,
          MATCH(name, description, address) AGAINST(${query} IN NATURAL LANGUAGE MODE) as relevance_score
        FROM resources 
        WHERE MATCH(name, description, address) AGAINST(${query} IN NATURAL LANGUAGE MODE)
      `;
      
      const relevanceMap = new Map(searchResults.map(r => [r.id, r.relevance_score]));
      results = results.filter(r => relevanceMap.has(r.id))
                      .map(r => ({ ...r, relevance_score: relevanceMap.get(r.id) }))
                      .sort((a, b) => b.relevance_score - a.relevance_score);
    }

    logger.info({ 
      query, 
      location: lat && lon ? `${lat},${lon}` : null,
      radius: parseFloat(radius),
      type,
      results: results.length 
    }, 'Resource search completed');
    
    res.json({
      query,
      location: lat && lon ? { lat: parseFloat(lat), lon: parseFloat(lon) } : null,
      radius: parseFloat(radius),
      type,
      results,
      total: results.length
    });
    
  } catch (error) {
    logger.error(error, 'Resource search failed');
    res.status(500).json({ error: 'Resource search failed' });
  }
});

module.exports = router;
