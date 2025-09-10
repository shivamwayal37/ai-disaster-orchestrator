/**
 * Database Insertion Service - Day 3
 * Handles inserting normalized alerts into TiDB with embeddings
 */

const { prisma } = require('../db');
const pino = require('pino');
const { getVectorStore } = require('../services/vectorStore');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');

const logger = pino({ name: 'db-insert' });
const vectorStore = getVectorStore();

// Singleton Redis client with better error handling
class RedisManager {
    constructor() {
        this.client = null;
        this.isConnecting = false;
    }

    async getClient() {
        if (this.client && this.client.isOpen) {
            return this.client;
        }

        if (this.isConnecting) {
            // Wait for existing connection attempt
            await this.waitForConnection();
            return this.client;
        }

        return this.connect();
    }

    async connect() {
        if (this.isConnecting) return;
        
        this.isConnecting = true;
        
        try {
            this.client = redis.createClient({
                url: process.env.REDIS_URL || 'redis://localhost:6379',
                socket: {
                    reconnectStrategy: (retries) => {
                        if (retries > 10) return false;
                        return Math.min(retries * 100, 3000);
                    }
                }
            });

            this.client.on('error', (error) => {
                logger.error(`Redis client error: ${error.message}`);
            });

            this.client.on('connect', () => {
                logger.info('Redis client connected');
            });

            this.client.on('ready', () => {
                logger.info('Redis client ready');
            });

            await this.client.connect();
            this.isConnecting = false;
            return this.client;
            
        } catch (error) {
            this.isConnecting = false;
            logger.error(`Redis connection failed: ${error.message}`);
            throw error;
        }
    }

    async waitForConnection(timeout = 5000) {
        const start = Date.now();
        while (this.isConnecting && Date.now() - start < timeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}

const redisManager = new RedisManager();

require('../utils/bigIntSerialization');

/**
 * Insert normalized alert into TiDB documents table
 */
async function insertAlert(normalizedAlert, kimiProcessed = null) {
  try {
    const { id, source, timestamp, text, location, meta } = normalizedAlert;
    
    // Prepare document data for insertion
    const documentData = {
      title: generateTitle(normalizedAlert),
      content: text,
      summary: kimiProcessed?.summary || null,
      category: getCategoryFromSource(source),
      sourceUrl: meta?.web_url || null,
      mediaUrl: meta?.media_url || null,
      confidence: kimiProcessed?.entities?.confidence || 0.8,
      location: location ? `${location.lat},${location.lng}` : null,
      publishedAt: new Date(timestamp),
      // Note: embedding will be added by embedding worker
    };

    // Insert into documents table
    const document = await prisma.document.create({
      data: documentData
    });

    // Create corresponding alert record if it's a real-time alert
    let alertRecord = null;
    if (source !== 'protocol') {
      const alertData = {
        alert_uid: uuidv4(),   // ✅ unique string UID
        source: source,
        alertType: kimiProcessed?.entities?.disaster_type || meta?.event_type || 'other',
        title: documentData.title,
        description: text,
        severity: mapSeverityToNumber(kimiProcessed?.entities?.severity || meta?.severity),
        location: meta?.location_name || meta?.areas?.[0] || null,
        latitude: location?.lat || null,
        longitude: location?.lng || null,
        startTime: new Date(timestamp),
        endTime: meta?.expires ? new Date(meta.expires) : null,
        rawData: normalizedAlert
      };

      alertRecord = await prisma.alert.create({
        data: alertData
      });

      // Link document to alert
      await prisma.document.update({
        where: { id: document.id },
        data: { alertId: alertRecord.id }
      });
    }

    try {
      // Queue embedding generation task
      await queueEmbeddingTask(document.id, text);
      
      logger.info({
        documentId: document.id,
        alertId: alertRecord?.id,
        source,
        textLength: text.length
      }, 'Alert inserted and queued for embedding');

      return {
        document,
        alert: alertRecord,
        queued_for_embedding: true
      };
    } catch (error) {
      logger.error({ 
        documentId: document.id,
        error: error.message,
        stack: error.stack 
      }, 'Failed to queue embedding task');
      
      // Still return success since the document was inserted
      return {
        document,
        alert: alertRecord,
        queued_for_embedding: false,
        error: 'Failed to queue embedding task'
      };
    }

  } catch (error) {
    logger.error({ 
      error: error.message, 
      stack: error.stack,
      alertId: normalizedAlert.id,
      source: normalizedAlert.source
    }, 'Failed to insert alert');
    
    // Rethrow to allow calling function to handle
    throw error;
  }
}

/**
 * Queue embedding generation task
 */
/**
 * Queue embedding generation task using Redis
 * @param {number} documentId - ID of the document to embed
 * @param {string} text - Text content to generate embedding for
 * @returns {Promise<boolean>} True if queued successfully
 */
async function queueEmbeddingTask(documentId, text) {
    if (!documentId || !text) {
        logger.warn({ documentId, hasText: !!text }, 'Invalid arguments for queueEmbeddingTask');
        return false;
    }

    try {
        const redisClient = await redisManager.getClient();
        
        const jobPayload = {
            id: documentId,
            content: text.substring(0, 8000), // Reasonable limit
            timestamp: new Date().toISOString(),
            model: 'jina-embeddings-v3',
            dimensions: 1024
        };

        await redisClient.lPush('embedding-queue', JSON.stringify(jobPayload));

        logger.debug({ 
            documentId,
            textLength: text.length,
            queueName: 'embedding-queue'
        }, 'Embedding task queued successfully');
        
        return true;
    } catch (error) {
        logger.error({ 
            error: error.message,
            documentId,
            stack: error.stack 
        }, 'Failed to queue embedding task');
        
        return false;
    }
}

/**
 * Batch insert multiple alerts
 */
async function batchInsertAlerts(normalizedAlerts, kimiProcessedList = []) {
  const results = [];
  const errors = [];

  for (let i = 0; i < normalizedAlerts.length; i++) {
    try {
      const alert = normalizedAlerts[i];
      const processed = kimiProcessedList[i] || null;
      
      const result = await insertAlert(alert, processed);
      results.push(result);
      
    } catch (error) {
      logger.error({ 
        alertId: normalizedAlerts[i]?.id,
        error: error.message 
      }, 'Failed to insert alert in batch');
      
      errors.push({
        alert: normalizedAlerts[i],
        error: error.message
      });
    }
  }

  logger.info({
    successful: results.length,
    failed: errors.length,
    total: normalizedAlerts.length
  }, 'Batch insertion completed');

  return { results, errors };
}

/**
 * Insert ingestion log entry
 */
async function logIngestionRun(source, status, stats, error = null) {
  try {
    // Use action_audit table for ingestion logging
    await prisma.actionAudit.create({
      data: {
        action: `INGEST_${source.toUpperCase()}`,
        payload: {
          stats,
          timestamp: new Date().toISOString()
        },
        status: status.toUpperCase(),
        errorMsg: error?.message || null
      }
    });

    logger.info({ source, status, stats }, 'Ingestion run logged');
  } catch (logError) {
    logger.error(logError, 'Failed to log ingestion run');
    // Don't throw - logging failure shouldn't stop ingestion
  }
}

// Helper functions
function generateTitle(normalizedAlert) {
  const { source, meta } = normalizedAlert;
  
  if (source === 'weather') {
    return `Weather Alert: ${meta.event_type?.replace('_', ' ') || 'Unknown Event'}`;
  } else if (source === 'twitter') {
    return `Social Media: ${meta.disaster_type || 'Alert'} reported in ${meta.location_name}`;
  } else if (source === 'satellite') {
    return `Satellite: ${meta.event_type?.replace('_', ' ') || 'Unknown Event'} detected`;
  } else if (source === 'protocol') {
    return normalizedAlert.text.split('\n')[0]; // First line as title
  }
  
  return 'Disaster Alert';
}

function getCategoryFromSource(source) {
  const mapping = {
    'weather': 'report',
    'twitter': 'social_media', 
    'satellite': 'report',
    'protocol': 'protocol'
  };
  return mapping[source] || 'report';
}

function mapSeverityToNumber(severity) {
  const mapping = {
    'low': 1,
    'moderate': 2,
    'high': 3,
    'severe': 4,
    'extreme': 5
  };
  return mapping[severity?.toLowerCase()] || 3;
}

/**
 * Validate normalized alert structure
 */
function validateNormalizedAlert(alert) {
  const required = ['id', 'source', 'timestamp', 'text'];
  const missing = required.filter(field => !alert[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  if (!['weather', 'twitter', 'satellite', 'protocol'].includes(alert.source)) {
    throw new Error(`Invalid source: ${alert.source}`);
  }

  if (alert.location && (!alert.location.lat || !alert.location.lng)) {
    throw new Error('Invalid location coordinates');
  }

  return true;
}

module.exports = {
  insertAlert,
  batchInsertAlerts,
  logIngestionRun,
  validateNormalizedAlert,
  generateTitle,
  getCategoryFromSource,
  mapSeverityToNumber
};
