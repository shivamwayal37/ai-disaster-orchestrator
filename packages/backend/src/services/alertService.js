const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('redis');
const logger = require('../utils/logger');
const { searchSimilarIncidents } = require('./searchService');

const prisma = new PrismaClient();

// Initialize Redis client with reconnection strategy
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        logger.error('Too many reconnection attempts. Giving up.');
        return new Error('Too many reconnection attempts');
      }
      // Exponential backoff: 2^retries * 100ms, max 5s
      const delay = Math.min(2 ** retries * 100, 5000);
      logger.warn(`Redis reconnecting in ${delay}ms...`);
      return delay;
    }
  }
});

// Handle Redis connection events
redisClient.on('error', (err) => logger.error({ error: err }, 'Redis Client Error'));
redisClient.on('connect', () => logger.info('Redis client connected'));
redisClient.on('reconnecting', () => logger.info('Redis client reconnecting...'));
redisClient.on('ready', () => logger.info('Redis client ready'));

// Only connect Redis in non-test environments
let isRedisConnected = false;
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      await redisClient.connect();
      isRedisConnected = true;
    } catch (error) {
      logger.error({ error }, 'Failed to connect to Redis');
      isRedisConnected = false;
    }
  })();
}

// Helper function to safely execute Redis commands
const safeRedisCommand = async (command, ...args) => {
  if (!isRedisConnected) {
    logger.warn('Redis client not connected, attempting to reconnect...');
    try {
      await redisClient.connect();
      isRedisConnected = true;
    } catch (error) {
      logger.error({ error }, 'Failed to reconnect to Redis');
      throw new Error('Redis connection unavailable');
    }
  }

  try {
    return await command(...args);
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'NR_CLOSED') {
      isRedisConnected = false;
      logger.warn('Redis connection lost, will attempt to reconnect on next operation');
    }
    throw error;
  }
};

const EMBEDDING_QUEUE_NAME = 'embedding-queue';

class AlertService {
  constructor() {
    this.logger = logger.child({ service: 'AlertService' });
  }

  /**
   * Ingest a single alert
   */
  async ingestAlert(alertData) {
    const { source, type, severity, location, coordinates, description, metadata = {} } = alertData;
    
    try {
      // Generate a unique ID if not provided
      const alertId = alertData.id || `alert_${uuidv4()}`;
      
      // Create alert in database
      const alert = await prisma.alert.create({
        data: {
          alert_uid: alertId,
          source,
          alertType: type,
          severity,
          location,
          latitude: coordinates?.latitude || null,
          longitude: coordinates?.longitude || null,
          description,
          rawData: {
            ...metadata,
            status: 'PENDING',
            createdAt: new Date().toISOString()
          },
          isActive: true,
          embedding: null
        }
      });

      // Publish alert event to Redis
      try {
        await safeRedisCommand(
          redisClient.publish.bind(redisClient),
          'alerts:new',
          JSON.stringify({
            id: alert.id,
            alert_uid: alert.alert_uid,
            type: alert.alertType,
            severity: alert.severity,
            location: alert.location,
            description: alert.description,
            timestamp: new Date().toISOString()
          })
        );
      } catch (error) {
        this.logger.error({ error, alertId }, 'Failed to publish alert event');
        // Continue processing even if Redis publish fails
      }

      // Queue for embedding generation
      await this.queueForEmbedding(alertId, description);
      
      this.logger.info({ alertId }, 'Alert ingested successfully');
      return alert;
      
    } catch (error) {
      this.logger.error({ error, alertData }, 'Failed to ingest alert');
      throw new Error(`Failed to ingest alert: ${error.message}`);
    }
  }

  /**
   * Batch ingest multiple alerts
   */
  async batchIngest(alerts) {
    if (!Array.isArray(alerts)) {
      throw new Error('Input must be an array of alerts');
    }

    const results = {
      total: alerts.length,
      success: 0,
      errors: 0,
      details: []
    };

    // Process alerts in parallel with concurrency limit
    const BATCH_SIZE = 10;
    for (let i = 0; i < alerts.length; i += BATCH_SIZE) {
      const batch = alerts.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (alert) => {
          try {
            await this.ingestAlert(alert);
            results.success++;
            results.details.push({ id: alert.id || 'unknown', status: 'success' });
          } catch (error) {
            results.errors++;
            results.details.push({
              id: alert.id || 'unknown',
              status: 'error',
              error: error.message
            });
          }
        })
      );
    }

    this.logger.info({
      total: results.total,
      success: results.success,
      errors: results.errors
    }, 'Batch ingestion completed');

    return results;
  }

  /**
   * Search alerts using the centralized search service
   */
  async searchAlerts(query, options = {}) {
    try {
      // Delegate to the search service
      const results = await searchSimilarIncidents(query, options);
      return results;
    } catch (error) {
      this.logger.error({ error, query }, 'Search failed');
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Get alert statistics
   */
  async getAlertStats(timeRange = '24h') {
    try {
      const now = new Date();
      let startDate = new Date(now);
      
      // Set start date based on time range
      switch (timeRange) {
        case '1h':
          startDate.setHours(now.getHours() - 1);
          break;
        case '24h':
        case 'today':
          startDate.setDate(now.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(now.getDate() - 30);
          break;
        default:
          startDate = new Date(0); // All time
      }

      const [
        totalAlerts,
        alertsByType,
        alertsBySeverity,
        alertsBySource,
        recentAlerts
      ] = await Promise.all([
        // Total alerts
        prisma.alert.count({
          where: { createdAt: { gte: startDate } }
        }),
        
        // Alerts by type
        prisma.alert.groupBy({
          by: ['type'],
          _count: true,
          where: { createdAt: { gte: startDate } },
          orderBy: { _count: 'desc' },
          take: 10
        }),
        
        // Alerts by severity
        prisma.alert.groupBy({
          by: ['severity'],
          _count: true,
          where: { createdAt: { gte: startDate } },
          orderBy: { _count: 'desc' }
        }),
        
        // Alerts by source
        prisma.alert.groupBy({
          by: ['source'],
          _count: true,
          where: { createdAt: { gte: startDate } },
          orderBy: { _count: 'desc' },
          take: 10
        }),
        
        // Recent alerts
        prisma.alert.findMany({
          where: { createdAt: { gte: startDate } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            alertType: true,
            severity: true,
            location: true,
            description: true,
            createdAt: true,
            isActive: true,
            rawData: true
          }
        })
      ]);

      // Process time series data for charts
      const timeSeries = await this.getTimeSeriesData(startDate, now);

      // Map alert types to use alertType instead of type
      const recentAlertsMapped = recentAlerts.map(alert => ({
        ...alert,
        type: alert.alertType
      }));

      return {
        timeRange: {
          start: startDate,
          end: now,
          label: timeRange === '24h' ? 'Last 24 hours' : 
                 timeRange === '7d' ? 'Last 7 days' :
                 timeRange === '30d' ? 'Last 30 days' : 'All time'
        },
        totalAlerts,
        alertsByType: alertsByType.map(item => ({
          type: item.alertType,  // Changed from item.type
          count: item._count
        })),
        alertsBySeverity: alertsBySeverity.map(item => ({
          severity: item.severity,
          count: item._count
        })),
        alertsBySource: alertsBySource.map(item => ({
          source: item.source,
          count: item._count
        })),
        recentAlerts: recentAlertsMapped,
        timeSeries
      };
      
    } catch (error) {
      this.logger.error({ error, timeRange }, 'Failed to get alert statistics');
      throw new Error(`Failed to get alert statistics: ${error.message}`);
    }
  }

  /**
   * Get alert by ID
   * @param {string|number|bigint} alertId - The ID of the alert to retrieve
   * @returns {Promise<Object|null>} The alert object or null if not found
   * @throws {Error} If the ID is invalid or the query fails
   */
  async getAlertById(alertId) {
    try {
      // Ensure alertId is provided and not empty
      if (alertId === undefined || alertId === null || alertId === '') {
        throw new Error('Alert ID is required');
      }

      // Convert to BigInt safely
      let id;
      try {
        id = typeof alertId === 'bigint' ? alertId : BigInt(alertId);
      } catch (error) {
        throw new Error(`Invalid alert ID format: ${alertId}`);
      }
      
      const alert = await prisma.alert.findUnique({
        where: { id: id },
        include: {
          // Removed relatedAlerts as it's not in the schema
          documents: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              title: true,
              description: true,
              createdAt: true
            }
          }
        }
      });

      if (!alert) {
        throw new Error('Alert not found');
      }

      // Map alertType to type for backward compatibility
      return {
        ...alert,
        type: alert.alertType
      };
      
    } catch (error) {
      this.logger.error({ error, alertId }, 'Failed to get alert');
      throw new Error(`Failed to get alert: ${error.message}`);
    }
  }

  /**
   * Update alert status
   * @param {string|number|bigint} alertId - The ID of the alert to update
   * @param {string} status - New status for the alert
   * @param {Object} [metadata={}] - Additional metadata for the status update
   */
  async updateAlertStatus(alertId, status, metadata = {}) {
    const validStatuses = ['PENDING', 'PROCESSING', 'RESOLVED', 'FALSE_ALARM'];
    
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    try {
      // Convert alertId to BigInt if it's a valid number
      const id = typeof alertId === 'bigint' ? alertId : BigInt(alertId);
      
      const updateData = {
        isActive: status !== 'RESOLVED', // Map status to isActive
        rawData: {
          ...metadata,
          status: status,
          statusUpdatedAt: new Date().toISOString()
        }
      };
      
      const updatedAlert = await prisma.alert.update({
        where: { id },
        data: updateData
      });

      this.logger.info({ alertId, status }, 'Alert status updated');
      return {
        ...updatedAlert,
        status: status // Include status in the returned object for backward compatibility
      };
      
    } catch (error) {
      this.logger.error({ error, alertId, status }, 'Failed to update alert status');
      throw new Error(`Failed to update alert status: ${error.message}`);
    }
  }

  /**
   * Queues an alert for asynchronous embedding generation using Redis.
   * @param {string} alertId - The ID of the alert.
   * @param {string} text - The text content to be embedded.
   */
  async queueForEmbedding(alertId, text) {
    try {
      // Convert alertId to string to ensure proper serialization
      const alertIdStr = alertId.toString();
      
      // First, update the alert status to QUEUED
      await prisma.alert.update({
        where: { id: BigInt(alertId) },
        data: {
          isActive: true,
          rawData: {
            status: 'QUEUED',
            embeddingStatus: 'QUEUED',
            updatedAt: new Date().toISOString()
          }
        }
      });

      const job = {
        alertId: alertIdStr, // Use string version for JSON serialization
        text,
        timestamp: Date.now()
      };

      // Push the job to the Redis list (queue)
      await safeRedisCommand(
        redisClient.lPush.bind(redisClient),
        EMBEDDING_QUEUE_NAME,
        JSON.stringify(job)
      );
      
      this.logger.info({ alertId: alertIdStr }, 'Alert queued for embedding');

      this.logger.info({ alertId }, 'Alert queued for embedding');

      // Update alert status to 'QUEUED'
      await prisma.alert.update({
        where: { id: alertId },
        data: { 
          status: 'QUEUED'
        }
      });

    } catch (error) {
      this.logger.error({ error, alertId }, 'Failed to queue alert for embedding');
      // Optionally update the alert status to 'ERROR' if queuing fails
      await prisma.alert.update({
        where: { id: alertId },
        data: {
          status: 'ERROR',
          metadata: {
            ...((await prisma.alert.findUnique({ where: { id: alertId } }))?.metadata || {}),
            error: 'Failed to queue for embedding',
            errorDetails: error.message
          }
        }
      }).catch(updateError => {
        this.logger.error({ error: updateError, alertId }, 'Failed to update alert status after queuing error');
      });
    }
  }

  /**
   * Helper: Build WHERE clause from filters
   */
  buildWhereClause(filters = {}) {
    const where = {};
    
    if (filters.type) {
      where.type = { in: Array.isArray(filters.type) ? filters.type : [filters.type] };
    }
    
    if (filters.severity) {
      where.severity = { in: Array.isArray(filters.severity) ? filters.severity : [filters.severity] };
    }
    
    if (filters.source) {
      where.source = { in: Array.isArray(filters.source) ? filters.source : [filters.source] };
    }
    
    if (filters.status) {
      where.status = { in: Array.isArray(filters.status) ? filters.status : [filters.status] };
    }
    
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }
    
    if (filters.location) {
      where.location = { contains: filters.location, mode: 'insensitive' };
    }
    
    return where;
  }


  /**
   * Helper: Generate time series data for charts
   */
  async getTimeSeriesData(startDate, endDate) {
    const timeDiff = endDate - startDate;
    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    
    // Determine time bucket size based on date range
    let interval;
    if (daysDiff <= 1) {
      interval = 'hour';
    } else if (daysDiff <= 7) {
      interval = 'day';
    } else if (daysDiff <= 30) {
      interval = 'day';
    } else {
      interval = 'week';
    }
    
    // Generate time buckets
    const timeBuckets = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      timeBuckets.push(new Date(current));
      
      if (interval === 'hour') {
        current.setHours(current.getHours() + 1);
      } else if (interval === 'day') {
        current.setDate(current.getDate() + 1);
      } else {
        current.setDate(current.getDate() + 7);
      }
    }
    
    // Get alert counts per time bucket
    const alertCounts = await Promise.all(
      timeBuckets.map(async (bucketStart, index) => {
        if (index === timeBuckets.length - 1) return null;
        
        const bucketEnd = new Date(timeBuckets[index + 1]);
        
        const count = await prisma.alert.count({
          where: {
            createdAt: {
              gte: bucketStart,
              lt: bucketEnd
            }
          }
        });
        
        return {
          time: bucketStart.toISOString(),
          count
        };
      })
    );
    
    // Filter out nulls and return
    return alertCounts.filter(Boolean);
  }
}

// Export singleton instance
const alertService = new AlertService();
module.exports = alertService;
