const express = require('express');
const router = express.Router();
const { createClient } = require('redis');
const { PrismaClient } = require('@prisma/client');
const alertService = require('../services/alertService');
const { body, param, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

// Initialize Redis client for SSE
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));

// Only connect Redis in non-test environments
if (process.env.NODE_ENV !== 'test') {
  redisClient.connect().catch(console.error);
}

/**
 * @route   POST /api/alerts
 * @desc    Create a new alert
 * @access  Public (in production, this would be protected)
 */
router.post(
  '/',
  [
    body('source').isString().notEmpty(),
    body('alertType').isString().notEmpty(),
    body('severity').isIn([1, 2, 3, 4]), // 1=CRITICAL, 2=HIGH, 3=MEDIUM, 4=LOW
    body('location').isString().notEmpty(),
    body('coordinates')
      .isObject()
      .custom(coords => {
        if (typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
          throw new Error('Coordinates must contain latitude and longitude');
        }
        return true;
      }),
    body('description').isString().notEmpty(),
    body('rawData').optional().isObject()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { alertType, coordinates, ...rest } = req.body;
      
      // Map fields to match service layer expectations
      const alertData = {
        ...rest,
        type: alertType, // Map to type for service layer
        coordinates: {
          latitude: coordinates?.latitude || null,
          longitude: coordinates?.longitude || null
        },
        // Map rawData to metadata for service layer
        metadata: rest.rawData || {}
      };

      const alert = await alertService.ingestAlert(alertData);
      
      res.status(201).json({
        success: true,
        data: alert
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create alert');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route   POST /api/alerts/batch
 * @desc    Create multiple alerts in a batch
 * @access  Public (in production, this would be protected)
 */
router.post(
  '/batch',
  [
    body().isArray({ min: 1 }),
    body('*.source').isString().notEmpty(),
    body('*.type').isString().notEmpty(),
    body('*.severity').isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    body('*.location').isString().notEmpty(),
    body('*.description').isString().notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const result = await alertService.batchIngest(req.body);
      res.status(207).json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error({ error }, 'Failed to process batch alerts');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/alerts
 * @desc    Search alerts with filters and pagination
 * @access  Public (in production, this would be protected)
 */
router.get(
  '/',
  [
    query('q').optional().isString(),
    query('alertType').optional().isString(),
    query('severity').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    query('source').optional().isString(),
    query('status').optional().isString(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('sortBy').optional().isString(),
    query('sortOrder').optional().isIn(['asc', 'desc'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { q: query, alertType, source, isActive, startDate, endDate, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

      // Build filters
      const filters = {
        ...(alertType && { alertType }),
        ...(source && { source }),
        ...(isActive !== undefined && { isActive: isActive === 'true' }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(req.query.severity && { severity: req.query.severity })
      };

      // Execute search with pagination
      const searchResults = await alertService.searchAlerts(query || '', {
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        filters,
        sortBy,
        sortOrder
      });

      // Format the response
      const response = {
        success: true,
        data: searchResults.results || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: searchResults.pagination?.total || 0,
          totalPages: searchResults.pagination?.totalPages || 0
        }
      };

      // Add stats if available
      if (searchResults.stats) {
        response.stats = searchResults.stats;
      }

      res.json(response);
    } catch (error) {
      logger.error({ error, query: req.query }, 'Search failed');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/alerts/stats
 * @desc    Get alert statistics
 * @access  Public (in production, this would be protected)
 */
router.get(
  '/stats',
  [query('timeRange').optional().isIn(['1h', '24h', '7d', '30d', 'all'])],
  async (req, res) => {
    try {
      const stats = await alertService.getAlertStats(req.query.timeRange || '24h');
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get alert stats');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/alerts/stream
 * @desc    Server-Sent Events stream for real-time alerts
 * @access  Public (in production, this would be protected)
 */
router.get('/stream', async (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = `client-${Date.now()}`;
  logger.info({ clientId }, 'New SSE client connected');

  // Create a new Redis subscriber for this client
  const redisSubscriber = redisClient.duplicate();
  redisSubscriber.connect().catch(err => {
    logger.error({ clientId, error: err }, 'Failed to connect Redis subscriber');
    return res.end();
  });

  // Subscribe to the alerts channel
  redisSubscriber.subscribe('alerts:new', (message) => {
    try {
      const alert = JSON.parse(message);
      res.write(`data: ${JSON.stringify({ type: 'alert', data: alert })}\n\n`);
    } catch (err) {
      logger.error({ clientId, error: err, message }, 'Error parsing alert message');
    }
  });

  // Send initial connection confirmation
  const sendEvent = (type, data) => {
    try {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      logger.error({ clientId, error: err, type, data }, 'Error sending SSE event');
    }
  };

  // Send initial connection message
  sendEvent('connected', { 
    timestamp: new Date().toISOString(),
    clientId,
    message: 'Connected to alerts stream'
  });

  // Function to send active alerts
  const sendActiveAlerts = async () => {
    try {
      const activeAlerts = await prisma.alert.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      sendEvent('initialAlerts', {
        count: activeAlerts.length,
        alerts: activeAlerts.map(alert => ({
          ...alert,
          // Map back to client-expected format if needed
          status: alert.rawData?.status || 'ACTIVE'
        }))
      });
    } catch (err) {
      logger.error({ clientId, error: err }, 'Error fetching active alerts');
    }
  };

  // Send initial active alerts
  sendActiveAlerts();

  // Set up periodic updates (every 30 seconds)
  const intervalId = setInterval(sendActiveAlerts, 30000);

  // Handle client disconnect
  const cleanup = () => {
    clearInterval(intervalId);
    redisSubscriber.quit().catch(err => 
      logger.error({ clientId, error: err }, 'Error closing Redis subscriber')
    );
    logger.info({ clientId }, 'SSE client disconnected');
  };

  req.on('close', cleanup);
  req.on('error', (error) => {
    logger.error({ clientId, error }, 'SSE client error');
    cleanup();
  });
});

/**
 * @route   GET /api/alerts/:id
 * @desc    Get alert by ID
 * @access  Public (in production, this would be protected)
 */
router.get(
  '/:id',
  [param('id').isString().notEmpty()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const alertId = req.params.id;
      const alert = await alertService.getAlertById(alertId);
      
      if (!alert) {
        return res.status(404).json({
          success: false,
          error: 'Alert not found'
        });
      }

      res.json({
        success: true,
        data: alert
      });
    } catch (error) {
      logger.error({ error, alertId: req.params.id }, 'Failed to get alert');
      
      // Handle different types of errors
      if (error.message.includes('Alert ID is required') || 
          error.message.includes('Invalid alert ID format')) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route   PATCH /api/alerts/:id/status
 * @desc    Update alert status
 * @access  Public (in production, this would be protected)
 */
router.patch(
  '/:id/status',
  [
    param('id').isString().notEmpty(),
    body('status').isIn(['PENDING', 'PROCESSING', 'RESOLVED', 'FALSE_ALARM']),
    body('metadata').optional().isObject()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const alertId = BigInt(req.params.id);
      const { status, metadata = {} } = req.body;
      
      // Update alert status using the service
      const updatedAlert = await alertService.updateAlertStatus(alertId, status, metadata);
      
      // Map response to match client expectations
      const responseData = {
        ...updatedAlert,
        // Map rawData to metadata for backward compatibility
        metadata: updatedAlert.rawData || {},
        // Map isActive to status for backward compatibility
        status: updatedAlert.rawData?.status || (updatedAlert.isActive ? 'ACTIVE' : 'INACTIVE')
      };
      
      res.json({
        success: true,
        data: responseData
      });
    } catch (error) {
      logger.error({ error, alertId: req.params.id }, 'Failed to update alert status');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
