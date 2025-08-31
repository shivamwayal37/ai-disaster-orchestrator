const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { generateVectorEmbedding } = require('./embeddingService');

const prisma = new PrismaClient();

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
          id: alertId,
          source,
          type,
          severity,
          location,
          coordinates: JSON.stringify(coordinates),
          description,
          metadata: JSON.stringify(metadata),
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
   * Search alerts with hybrid search (vector + full-text)
   */
  async searchAlerts(query, options = {}) {
    const {
      limit = 20,
      offset = 0,
      minScore = 0.5,
      filters = {}
    } = options;

    try {
      // Generate embedding for the query
      const queryEmbedding = await generateVectorEmbedding(query);
      
      // Build where clause for filters
      const whereClause = this.buildWhereClause(filters);
      
      // Execute hybrid search
      const [vectorResults, fullTextResults] = await Promise.all([
        // Vector similarity search
        prisma.$queryRaw`
          SELECT id, 1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
          FROM "Alert"
          WHERE embedding IS NOT NULL
          AND ${whereClause}
          ORDER BY similarity DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `,
        
        // Full-text search as fallback
        prisma.alert.findMany({
          where: {
            ...whereClause,
            OR: [
              { description: { contains: query, mode: 'insensitive' } },
              { location: { contains: query, mode: 'insensitive' } },
              { type: { contains: query, mode: 'insensitive' } }
            ]
          },
          take: limit,
          skip: offset,
          orderBy: { createdAt: 'desc' }
        })
      ]);

      // Combine and deduplicate results
      const combinedResults = this.combineSearchResults(
        vectorResults,
        fullTextResults,
        minScore
      );

      // Get full alert details for the combined results
      const alertIds = combinedResults.map(r => r.id);
      const alerts = await prisma.alert.findMany({
        where: { id: { in: alertIds } },
        include: { _count: true }
      });

      // Map back scores and sort
      const scoredAlerts = alerts.map(alert => ({
        ...alert,
        score: combinedResults.find(r => r.id === alert.id)?.score || 0
      })).sort((a, b) => b.score - a.score);

      return {
        results: scoredAlerts,
        total: scoredAlerts.length,
        vectorResults: vectorResults.length,
        fullTextResults: fullTextResults.length
      };
      
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
   * Helper: Queue alert for embedding generation
   */
  async queueForEmbedding(alertId, text) {
    try {
      // In a real implementation, this would add to a message queue
      // For now, we'll directly call the embedding service
      const embedding = await generateVectorEmbedding(text);
      
      await prisma.alert.update({
        where: { id: alertId },
        data: { 
          embedding: embedding,
          status: 'PROCESSED'
        }
      });
      
    } catch (error) {
      this.logger.error({ error, alertId }, 'Failed to generate embedding');
      // Don't fail the whole operation if embedding fails
      await prisma.alert.update({
        where: { id: alertId },
        data: { 
          status: 'ERROR',
          metadata: {
            error: 'Failed to generate embedding',
            errorDetails: error.message
          }
        }
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
   * Helper: Combine vector and full-text search results
   */
  combineSearchResults(vectorResults, fullTextResults, minScore = 0.5) {
    const combined = new Map();
    
    // Add vector results with scores
    vectorResults.forEach(item => {
      if (item.similarity >= minScore) {
        combined.set(item.id, {
          id: item.id,
          score: item.similarity,
          source: 'vector'
        });
      }
    });
    
    // Add full-text results with lower weight
    fullTextResults.forEach(alert => {
      const existing = combined.get(alert.id) || { score: 0 };
      // Boost score for full-text matches that weren't in vector results
      const boost = existing.source === 'vector' ? 0.2 : 0.8;
      combined.set(alert.id, {
        id: alert.id,
        score: Math.max(existing.score, minScore * boost),
        source: existing.source || 'fulltext'
      });
    });
    
    // Convert to array and sort by score
    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score);
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
