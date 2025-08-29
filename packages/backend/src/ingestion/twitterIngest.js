/**
 * Twitter/Social Media Data Ingestion Script - Day 3
 * Fetches social media alerts, normalizes, processes with Kimi, and inserts to DB
 */

const { getTwitterAlerts } = require('../data/mock-feeds');
const { normalizeTwitterData } = require('./normalize');
const { summarizeAlert, extractEntities } = require('../services/kimiClient');
const { insertAlert, logIngestionRun } = require('./dbInsert');
const pino = require('pino');

const logger = pino({ name: 'twitter-ingest' });

/**
 * Main Twitter ingestion function
 */
async function ingestTwitterAlerts() {
  const startTime = Date.now();
  const stats = {
    fetched: 0,
    normalized: 0,
    processed_by_kimi: 0,
    inserted: 0,
    errors: 0
  };

  try {
    logger.info('Starting Twitter alerts ingestion');

    // Step 1: Fetch raw Twitter data
    const rawAlerts = await getTwitterAlerts();
    stats.fetched = rawAlerts.length;
    logger.info({ count: stats.fetched }, 'Fetched Twitter alerts');

    if (stats.fetched === 0) {
      await logIngestionRun('twitter', 'success', stats);
      return { success: true, stats };
    }

    // Step 2: Normalize each alert
    const normalizedAlerts = [];
    for (const rawAlert of rawAlerts) {
      try {
        const normalized = normalizeTwitterData(rawAlert);
        normalizedAlerts.push(normalized);
        stats.normalized++;
      } catch (error) {
        logger.error({ error: error.message, alert: rawAlert }, 'Failed to normalize Twitter alert');
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
        
        // Add fallback processing for social media
        kimiProcessedAlerts.push({
          summary: alert.text.length > 100 ? alert.text.substring(0, 100) + '...' : alert.text,
          entities: {
            disaster_type: alert.meta.disaster_type || 'unknown',
            severity: alert.meta.severity || 'low',
            locations: [alert.meta.location_name || 'Unknown'],
            urgency: 'moderate',
            key_actions: ['Verify information', 'Monitor situation'],
            confidence: 0.5 // Lower confidence for social media
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
        }, 'Failed to insert Twitter alert');
        stats.errors++;
      }
    }

    const duration = Date.now() - startTime;
    stats.duration_ms = duration;

    // Log successful run
    await logIngestionRun('twitter', 'success', stats);
    
    logger.info({
      stats,
      duration_ms: duration
    }, 'Twitter ingestion completed successfully');

    return { success: true, stats };

  } catch (error) {
    const duration = Date.now() - startTime;
    stats.duration_ms = duration;
    
    logger.error(error, 'Twitter ingestion failed');
    await logIngestionRun('twitter', 'error', stats, error);
    
    return { success: false, error: error.message, stats };
  }
}

/**
 * Run Twitter ingestion with error handling
 */
async function runTwitterIngestion() {
  try {
    const result = await ingestTwitterAlerts();
    
    if (result.success) {
      console.log('✅ Twitter ingestion completed successfully');
      console.log(`📊 Stats: ${JSON.stringify(result.stats, null, 2)}`);
    } else {
      console.error('❌ Twitter ingestion failed:', result.error);
      console.log(`📊 Stats: ${JSON.stringify(result.stats, null, 2)}`);
    }
    
    return result;
  } catch (error) {
    console.error('💥 Twitter ingestion crashed:', error.message);
    return { success: false, error: error.message };
  }
}

// Allow running as standalone script
if (require.main === module) {
  runTwitterIngestion()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

/**
 * Quick ingestion with a single test Twitter alert
 */
async function runQuickTwitterIngestion() {
  const startTime = Date.now();
  const stats = {
    fetched: 0,
    normalized: 0,
    processed_by_kimi: 0,
    inserted: 0,
    errors: 0
  };

  try {
    logger.info('Starting quick Twitter ingestion (test mode)');
    
    // Create a single test alert
    const testAlert = {
      id: 'TEST-TWITTER-001',
      text: 'Test tweet about a disaster situation',
      user: 'test_user',
      createdAt: new Date().toISOString(),
      location: 'Test Location',
      coordinates: { lat: 0, lng: 0 },
      retweetCount: 0,
      favoriteCount: 0,
      hashtags: ['test', 'disaster'],
      urls: [],
      media: []
    };

    stats.fetched = 1;
    
    // Normalize the test alert
    const normalized = normalizeTwitterData(testAlert);
    stats.normalized = 1;

    // Process with Kimi
    const [summary, entities] = await Promise.all([
      summarizeAlert(normalized),
      extractEntities(normalized)
    ]);
    
    stats.processed_by_kimi = 1;
    
    // Insert into database
    await insertAlert({
      ...normalized,
      summary: summary.summary,
      entities: JSON.stringify(entities.entities)
    });
    
    stats.inserted = 1;
    
    logger.info({ stats }, 'Quick Twitter ingestion completed');
    return { success: true, stats };
    
  } catch (error) {
    logger.error({ error: error.message }, 'Quick Twitter ingestion failed');
    stats.errors = 1;
    return { success: false, stats, error: error.message };
  } finally {
    await logIngestionRun('twitter', stats.errors === 0 ? 'success' : 'error', stats);
  }
}

module.exports = {
  ingestTwitterAlerts,
  runTwitterIngestion,
  runQuickTwitterIngestion
};
