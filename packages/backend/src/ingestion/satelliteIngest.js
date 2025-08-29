/**
 * Satellite Data Ingestion Script - Day 3
 * Fetches satellite alerts, normalizes, processes with Kimi, and inserts to DB
 */

const { getSatelliteData } = require('../data/mock-feeds');
const { normalizeSatelliteData } = require('./normalize');
const { summarizeAlert, extractEntities } = require('../services/kimiClient');
const { insertAlert, logIngestionRun } = require('./dbInsert');
const pino = require('pino');

const logger = pino({ name: 'satellite-ingest' });

/**
 * Main satellite ingestion function
 */
async function ingestSatelliteAlerts() {
  const startTime = Date.now();
  const stats = {
    fetched: 0,
    normalized: 0,
    processed_by_kimi: 0,
    inserted: 0,
    errors: 0
  };

  try {
    logger.info('Starting satellite alerts ingestion');

    // Step 1: Fetch raw satellite data
    const rawAlerts = await getSatelliteData();
    stats.fetched = rawAlerts.length;
    logger.info({ count: stats.fetched }, 'Fetched satellite alerts');

    if (stats.fetched === 0) {
      await logIngestionRun('satellite', 'success', stats);
      return { success: true, stats };
    }

    // Step 2: Normalize each alert
    const normalizedAlerts = [];
    for (const rawAlert of rawAlerts) {
      try {
        const normalized = normalizeSatelliteData(rawAlert);
        normalizedAlerts.push(normalized);
        stats.normalized++;
      } catch (error) {
        logger.error({ error: error.message, alert: rawAlert }, 'Failed to normalize satellite alert');
        stats.errors++;
      }
    }

    // Step 3: Process with Kimi API (summarization + entity extraction)
    const kimiProcessedAlerts = [];
    for (const alert of normalizedAlerts) {
      try {
        // Summarize the alert
        const summary = await summarizeAlert(alert.text);
        
        // Extract entities
        const entities = await extractEntities(alert.text);
        
        kimiProcessedAlerts.push({
          summary,
          entities
        });
        
        stats.processed_by_kimi++;
        logger.debug({ alertId: alert.id }, 'Processed alert with Kimi');
        
      } catch (error) {
        logger.warn({ 
          alertId: alert.id, 
          error: error.message 
        }, 'Kimi processing failed, using fallback');
        
        // Add fallback processing for satellite data
        kimiProcessedAlerts.push({
          summary: alert.text.substring(0, 200) + '...',
          entities: {
            disaster_type: alert.meta.event_type || 'natural_disaster',
            severity: alert.meta.severity || 'moderate',
            locations: [alert.meta.location_name || 'Unknown'],
            urgency: 'moderate',
            key_actions: ['Monitor area', 'Assess damage', 'Deploy resources'],
            confidence: 0.7 // Higher confidence for satellite data
          }
        });
      }
    }

    // Step 4: Insert into database
    for (let i = 0; i < normalizedAlerts.length; i++) {
      try {
        const alert = normalizedAlerts[i];
        const kimiData = kimiProcessedAlerts[i];
        
        await insertAlert(alert, kimiData);
        stats.inserted++;
        
        logger.debug({ 
          alertId: alert.id,
          source: alert.source 
        }, 'Alert inserted successfully');
        
      } catch (error) {
        logger.error({ 
          alertId: normalizedAlerts[i]?.id,
          error: error.message 
        }, 'Failed to insert satellite alert');
        stats.errors++;
      }
    }

    const duration = Date.now() - startTime;
    stats.duration_ms = duration;

    // Log successful run
    await logIngestionRun('satellite', 'success', stats);
    
    logger.info({
      stats,
      duration_ms: duration
    }, 'Satellite ingestion completed successfully');

    return { success: true, stats };

  } catch (error) {
    const duration = Date.now() - startTime;
    stats.duration_ms = duration;
    
    logger.error(error, 'Satellite ingestion failed');
    await logIngestionRun('satellite', 'error', stats, error);
    
    return { success: false, error: error.message, stats };
  }
}

/**
 * Run satellite ingestion with error handling
 */
async function runSatelliteIngestion() {
  try {
    const result = await ingestSatelliteAlerts();
    
    if (result.success) {
      console.log('✅ Satellite ingestion completed successfully');
      console.log(`📊 Stats: ${JSON.stringify(result.stats, null, 2)}`);
    } else {
      console.error('❌ Satellite ingestion failed:', result.error);
      console.log(`📊 Stats: ${JSON.stringify(result.stats, null, 2)}`);
    }
    
    return result;
  } catch (error) {
    console.error('💥 Satellite ingestion crashed:', error.message);
    return { success: false, error: error.message };
  }
}

// Allow running as standalone script
if (require.main === module) {
  runSatelliteIngestion()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = {
  ingestSatelliteAlerts,
  runSatelliteIngestion
};
