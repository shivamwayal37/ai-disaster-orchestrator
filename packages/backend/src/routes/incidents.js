const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { hybridSearch } = require('../services/searchService');

/**
 * @route GET /api/incidents
 * @desc Get all incidents from the database
 * @access Public
 */
router.get('/', async (req, res) => {
  logger.info('Fetching all incidents from database');
  
  try {
    const { page = 1, limit = 10, status, severity, type } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build where clause based on query parameters
    const where = {};
    if (status) where.isActive = status === 'true';
    if (severity) where.severity = severity;
    if (type) where.alertType = type;
    
    // Get total count and paginated results
    const [total, incidents] = await Promise.all([
      prisma.alert.count({ where }),
      prisma.alert.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          documents: {
            select: {
              id: true,
              title: true,
              type: true,
              createdAt: true
            },
            orderBy: { createdAt: 'desc' },
            take: 3
          }
        }
      })
    ]);
    
    return res.json({
      success: true,
      data: incidents,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch incidents from database');
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch incidents',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route GET /api/incidents/:id
 * @desc Get a single incident by ID from the database
 * @access Public
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  logger.info({ incidentId: id }, 'Fetching incident by ID from database');
  
  try {
    const incident = await prisma.alert.findUnique({
      where: { id: parseInt(id) },
      include: {
        documents: {
          select: {
            id: true,
            title: true,
            content: true,
            type: true,
            summary: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    if (!incident) {
      return res.status(404).json({
        success: false,
        error: 'Incident not found'
      });
    }
    
    return res.json({
      success: true,
      data: incident
    });
  } catch (error) {
    logger.error({ error, incidentId: id }, 'Failed to fetch incident from database');
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch incident',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
