/**
 * Database Insertion Service - Day 3
 * Handles inserting normalized alerts into TiDB with embeddings
 */

const { prisma } = require('../db');
const pino = require('pino');
const { getVectorStore } = require('../services/vectorStore');

const logger = pino({ name: 'db-insert' });
const vectorStore = getVectorStore();

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
    
    // Generate and store embeddings in the background
    try {
      await vectorStore.embedAndStore(document, 'documents');
    } catch (error) {
      logger.error({ error: error.message, documentId: document.id }, 'Failed to generate embeddings');
      // Continue even if embedding fails - the document is still inserted
    }

    // Create corresponding alert record if it's a real-time alert
    let alertRecord = null;
    if (source !== 'protocol') {
      const alertData = {
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

    // Queue embedding generation task
    await queueEmbeddingTask(document.id, text);

    logger.info({
      documentId: document.id,
      alertId: alertRecord?.id,
      source,
      textLength: text.length
    }, 'Alert inserted successfully');

    return {
      document,
      alert: alertRecord,
      queued_for_embedding: true
    };

  } catch (error) {
    logger.error(error, 'Failed to insert alert');
    throw error;
  }
}

/**
 * Queue embedding generation task
 */
async function queueEmbeddingTask(documentId, text) {
  try {
    await prisma.workQueue.create({
      data: {
        taskType: 'EMBED',
        payload: {
          document_id: documentId,
          text: text,
          embedding_type: 'text'
        },
        priority: 3 // Medium priority
      }
    });

    logger.debug({ documentId }, 'Embedding task queued');
  } catch (error) {
    logger.error(error, 'Failed to queue embedding task');
    // Don't throw - embedding is not critical for initial insertion
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
