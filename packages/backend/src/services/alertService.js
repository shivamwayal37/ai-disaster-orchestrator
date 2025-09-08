const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('redis');
const logger = require('../utils/logger');
const { searchSimilarIncidents } = require('./searchService');

const prisma = new PrismaClient();

// Initialize Redis client for queuing
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));

// Only connect Redis in non-test environments
if (process.env.NODE_ENV !== 'test') {
  redisClient.connect().catch(console.error);
}

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
          rawData: metadata,
          status: 'PENDING',
          embedding: null
        }
      });

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
            type: true,
            severity: true,
            location: true,
            description: true,
            createdAt: true
          }
        })
      ]);

      // Process time series data for charts
      const timeSeries = await this.getTimeSeriesData(startDate, now);

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
          type: item.type,
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
        recentAlerts,
        timeSeries
      };
      
    } catch (error) {
      this.logger.error({ error, timeRange }, 'Failed to get alert statistics');
      throw new Error(`Failed to get alert statistics: ${error.message}`);
    }
  }

  /**
   * Get alert by ID
   */
  async getAlertById(alertId) {
    try {
      const alert = await prisma.alert.findUnique({
        where: { id: alertId },
        include: {
          relatedAlerts: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              type: true,
              severity: true,
              location: true,
              description: true,
              createdAt: true
            }
          }
        }
      });

      if (!alert) {
        throw new Error('Alert not found');
      }

      return alert;
      
    } catch (error) {
      this.logger.error({ error, alertId }, 'Failed to get alert');
      throw new Error(`Failed to get alert: ${error.message}`);
    }
  }

  /**
   * Update alert status
   */
  async updateAlertStatus(alertId, status, metadata = {}) {
    const validStatuses = ['PENDING', 'PROCESSING', 'RESOLVED', 'FALSE_ALARM'];
    
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    try {
      const updatedAlert = await prisma.alert.update({
        where: { id: alertId },
        data: {
          status,
          metadata: {
            ...metadata,
            statusUpdatedAt: new Date().toISOString()
          }
        }
      });

      this.logger.info({ alertId, status }, 'Alert status updated');
      return updatedAlert;
      
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
      const job = {
        alertId,
        text,
        timestamp: Date.now()
      };

      // Push the job to the Redis list (queue)
      await redisClient.lPush(EMBEDDING_QUEUE_NAME, JSON.stringify(job));

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
