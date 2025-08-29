/**
 * Protocol Document Ingestion Script - Day 3
 * Fetches protocol documents, normalizes, processes with Kimi, and inserts to DB
 */

const { getProtocolDocuments } = require('../data/mock-feeds');
const { normalizeProtocolData } = require('./normalize');
const { summarizeAlert, extractEntities } = require('../services/kimiClient');
const { insertAlert, logIngestionRun } = require('./dbInsert');
const pino = require('pino');

const logger = pino({ name: 'protocol-ingest' });

/**
 * Main protocol ingestion function
 */
async function ingestProtocolDocuments() {
  const startTime = Date.now();
  const stats = {
    fetched: 0,
    normalized: 0,
    processed_by_kimi: 0,
    inserted: 0,
    errors: 0
  };

  try {
    logger.info('Starting protocol documents ingestion');

    // Step 1: Fetch raw protocol data
    const rawDocuments = await getProtocolDocuments();
    stats.fetched = rawDocuments.length;
    logger.info({ count: stats.fetched }, 'Fetched protocol documents');

    if (stats.fetched === 0) {
      await logIngestionRun('protocol', 'success', stats);
      return { success: true, stats };
    }

    // Step 2: Normalize each document
    const normalizedDocuments = [];
    for (const rawDoc of rawDocuments) {
      try {
        const normalized = normalizeProtocolData(rawDoc);
        normalizedDocuments.push(normalized);
        stats.normalized++;
      } catch (error) {
        logger.error({ error: error.message, document: rawDoc }, 'Failed to normalize protocol document');
        stats.errors++;
      }
    }

    // Step 3: Process with Kimi API (summarization + entity extraction)
    const kimiProcessedDocuments = [];
    for (const doc of normalizedDocuments) {
      try {
        // Summarize the document
        const summary = await summarizeAlert(doc.text);
        
        // Extract entities (protocols have different entity types)
        const entities = await extractEntities(doc.text);
        
        kimiProcessedDocuments.push({
          summary,
          entities
        });
        
        stats.processed_by_kimi++;
        logger.debug({ docId: doc.id }, 'Processed document with Kimi');
        
      } catch (error) {
        logger.warn({ 
          docId: doc.id, 
          error: error.message 
        }, 'Kimi processing failed, using fallback');
        
        // Add fallback processing for protocol documents
        kimiProcessedDocuments.push({
          summary: doc.text.substring(0, 300) + '...',
          entities: {
            disaster_type: doc.meta.disaster_type || 'general',
            severity: 'reference', // Protocols are reference material
            locations: doc.meta.applicable_regions || ['Global'],
            urgency: 'reference',
            key_actions: extractKeyActionsFromProtocol(doc.text),
            confidence: 0.9 // High confidence for official protocols
          }
        });
      }
    }

    // Step 4: Insert into database
    for (let i = 0; i < normalizedDocuments.length; i++) {
      try {
        const doc = normalizedDocuments[i];
        const kimiData = kimiProcessedDocuments[i];
        
        await insertAlert(doc, kimiData);
        stats.inserted++;
        
        logger.debug({ 
          docId: doc.id,
          source: doc.source 
        }, 'Document inserted successfully');
        
      } catch (error) {
        logger.error({ 
          docId: normalizedDocuments[i]?.id,
          error: error.message 
        }, 'Failed to insert protocol document');
        stats.errors++;
      }
    }

    const duration = Date.now() - startTime;
    stats.duration_ms = duration;

    // Log successful run
    await logIngestionRun('protocol', 'success', stats);
    
    logger.info({
      stats,
      duration_ms: duration
    }, 'Protocol ingestion completed successfully');

    return { success: true, stats };

  } catch (error) {
    const duration = Date.now() - startTime;
    stats.duration_ms = duration;
    
    logger.error(error, 'Protocol ingestion failed');
    await logIngestionRun('protocol', 'error', stats, error);
    
    return { success: false, error: error.message, stats };
  }
}

/**
 * Extract key actions from protocol text using simple heuristics
 */
function extractKeyActionsFromProtocol(text) {
  const actionKeywords = [
    'evacuate', 'shelter', 'contact', 'notify', 'assess', 'deploy',
    'coordinate', 'establish', 'monitor', 'secure', 'provide', 'activate'
  ];
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const actions = [];
  
  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    if (actionKeywords.some(keyword => lowerSentence.includes(keyword))) {
      actions.push(sentence.trim());
      if (actions.length >= 5) break; // Limit to 5 key actions
    }
  }
  
  return actions.length > 0 ? actions : ['Follow established protocols', 'Coordinate with authorities'];
}

/**
 * Run protocol ingestion with error handling
 */
async function runProtocolIngestion() {
  try {
    const result = await ingestProtocolDocuments();
    
    if (result.success) {
      console.log('✅ Protocol ingestion completed successfully');
      console.log(`📊 Stats: ${JSON.stringify(result.stats, null, 2)}`);
    } else {
      console.error('❌ Protocol ingestion failed:', result.error);
      console.log(`📊 Stats: ${JSON.stringify(result.stats, null, 2)}`);
    }
    
    return result;
  } catch (error) {
    console.error('💥 Protocol ingestion crashed:', error.message);
    return { success: false, error: error.message };
  }
}

// Allow running as standalone script
if (require.main === module) {
  runProtocolIngestion()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = {
  ingestProtocolDocuments,
  runProtocolIngestion
};
