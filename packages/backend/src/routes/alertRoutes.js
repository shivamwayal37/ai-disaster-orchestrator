const express = require('express');
const router = express.Router();
const alertService = require('../services/alertService');
const { body, param, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * @route   POST /api/alerts
 * @desc    Create a new alert
 * @access  Public (in production, this would be protected)
 */
router.post(
  '/',
  [
    body('source').isString().notEmpty(),
    body('type').isString().notEmpty(),
    body('severity').isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
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
    body('metadata').optional().isObject()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const alert = await alertService.ingestAlert(req.body);
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
 * @route   GET /api/alerts/:id
 * @desc    Get alert by ID
 * @access  Public (in production, this would be protected)
 */
router.get(
  '/:id',
  [param('id').isString().notEmpty()],
  async (req, res) => {
    try {
      const alert = await alertService.getAlertById(req.params.id);
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
    query('type').optional().isString(),
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

      const {
        q: query,
        type,
        severity,
        source,
        status,
        startDate,
        endDate,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build filters
      const filters = {};
      if (type) filters.type = type;
      if (severity) filters.severity = severity;
      if (source) filters.source = source;
      if (status) filters.status = status;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      // Execute search
      const searchResults = await alertService.searchAlerts(query || '', {
        limit,
        offset: (page - 1) * limit,
        filters,
        sortBy,
        sortOrder
      });

      res.json({
        success: true,
        data: searchResults.results,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: searchResults.total,
          totalPages: Math.ceil(searchResults.total / limit)
        },
        stats: {
          vectorResults: searchResults.vectorResults,
          fullTextResults: searchResults.fullTextResults
        }
      });
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

      const alert = await alertService.updateAlertStatus(
        req.params.id,
        req.body.status,
        req.body.metadata
      );

      res.json({
        success: true,
        data: alert
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

module.exports = router;
