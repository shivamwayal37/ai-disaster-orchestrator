/**
 * Ingestion Orchestrator - Day 3
 * Coordinates all data sources and manages pipeline scheduling
 */

const { runWeatherIngestion, runQuickWeatherIngestion } = require('./weatherIngest');
const { runTwitterIngestion, runQuickTwitterIngestion } = require('./twitterIngest');
const { runSatelliteIngestion, runQuickSatelliteIngestion } = require('./satelliteIngest');
const { runProtocolIngestion, runQuickProtocolIngestion } = require('./protocolIngest');
const { logIngestionRun } = require('./dbInsert');
const pino = require('pino');

const logger = pino({ name: 'ingestion-orchestrator' });

/**
 * Run all ingestion sources in parallel
 */
async function runFullIngestionPipeline() {
  const startTime = Date.now();
  logger.info('Starting full ingestion pipeline');

  try {
    // Run all ingestion sources in parallel
    const [weatherResult, twitterResult, satelliteResult, protocolResult] = await Promise.allSettled([
      runWeatherIngestion(),
      runTwitterIngestion(), 
      runSatelliteIngestion(),
      runProtocolIngestion()
    ]);

    // Aggregate results
    const results = {
      weather: weatherResult.status === 'fulfilled' ? weatherResult.value : { success: false, error: weatherResult.reason?.message },
      twitter: twitterResult.status === 'fulfilled' ? twitterResult.value : { success: false, error: twitterResult.reason?.message },
      satellite: satelliteResult.status === 'fulfilled' ? satelliteResult.value : { success: false, error: satelliteResult.reason?.message },
      protocol: protocolResult.status === 'fulfilled' ? protocolResult.value : { success: false, error: protocolResult.reason?.message }
    };

    // Calculate overall stats
    const overallStats = {
      sources_processed: 4,
      sources_successful: Object.values(results).filter(r => r.success).length,
      total_fetched: Object.values(results).reduce((sum, r) => sum + (r.stats?.fetched || 0), 0),
      total_inserted: Object.values(results).reduce((sum, r) => sum + (r.stats?.inserted || 0), 0),
      total_errors: Object.values(results).reduce((sum, r) => sum + (r.stats?.errors || 0), 0),
      duration_ms: Date.now() - startTime
    };

    const overallSuccess = results.weather.success && results.twitter.success && 
                          results.satellite.success && results.protocol.success;

    // Log pipeline run
    await logIngestionRun('pipeline', overallSuccess ? 'success' : 'partial', overallStats);

    logger.info({
      results,
      overallStats
    }, 'Full ingestion pipeline completed');

    return {
      success: overallSuccess,
      results,
      stats: overallStats
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(error, 'Full ingestion pipeline failed');
    
    await logIngestionRun('pipeline', 'error', { duration_ms: duration }, error);
    
    return {
      success: false,
      error: error.message,
      stats: { duration_ms: duration }
    };
  }
}

/**
 * Run individual source ingestion
 */
async function runSourceIngestion(source) {
  const sourceMap = {
    'weather': runWeatherIngestion,
    'twitter': runTwitterIngestion,
    'satellite': runSatelliteIngestion,
    'protocol': runProtocolIngestion
  };

  const ingestFunction = sourceMap[source];
  if (!ingestFunction) {
    throw new Error(`Unknown ingestion source: ${source}`);
  }

  logger.info({ source }, 'Running single source ingestion');
  return await ingestFunction();
}

/**
 * Schedule ingestion jobs (basic cron-like scheduler)
 */
class IngestionScheduler {
  constructor() {
    this.intervals = new Map();
    this.isRunning = false;
  }

  /**
   * Start scheduled ingestion
   */
  start() {
    if (this.isRunning) {
      logger.warn('Scheduler already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting ingestion scheduler');

    // Schedule weather alerts every 15 minutes
    this.intervals.set('weather', setInterval(async () => {
      try {
        await runSourceIngestion('weather');
      } catch (error) {
        logger.error(error, 'Scheduled weather ingestion failed');
      }
    }, 15 * 60 * 1000));

    // Schedule Twitter alerts every 5 minutes
    this.intervals.set('twitter', setInterval(async () => {
      try {
        await runSourceIngestion('twitter');
      } catch (error) {
        logger.error(error, 'Scheduled Twitter ingestion failed');
      }
    }, 5 * 60 * 1000));

    // Schedule satellite data every 30 minutes
    this.intervals.set('satellite', setInterval(async () => {
      try {
        await runSourceIngestion('satellite');
      } catch (error) {
        logger.error(error, 'Scheduled satellite ingestion failed');
      }
    }, 30 * 60 * 1000));

    // Schedule protocol updates every 6 hours
    this.intervals.set('protocol', setInterval(async () => {
      try {
        await runSourceIngestion('protocol');
      } catch (error) {
        logger.error(error, 'Scheduled protocol ingestion failed');
      }
    }, 6 * 60 * 60 * 1000));

    logger.info('All ingestion schedules started');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Scheduler not running');
      return;
    }

    for (const [source, interval] of this.intervals) {
      clearInterval(interval);
      logger.debug({ source }, 'Stopped scheduled ingestion');
    }

    this.intervals.clear();
    this.isRunning = false;
    logger.info('Ingestion scheduler stopped');
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: Array.from(this.intervals.keys()),
      jobCount: this.intervals.size
    };
  }
}

// Global scheduler instance
const scheduler = new IngestionScheduler();

/**
 * CLI interface for manual runs
 */
async function runManualIngestion(source = 'all') {
  console.log(`🚀 Starting manual ingestion: ${source}`);
  
  try {
    let result;
    
    if (source === 'all') {
      result = await runFullIngestionPipeline();
    } else {
      result = await runSourceIngestion(source);
    }
    
    if (result.success) {
      console.log(`✅ Manual ingestion completed successfully`);
      console.log(`📊 Stats:`, JSON.stringify(result.stats, null, 2));
    } else {
      console.error(`❌ Manual ingestion failed:`, result.error);
      if (result.stats) {
        console.log(`📊 Stats:`, JSON.stringify(result.stats, null, 2));
      }
    }
    
    return result;
  } catch (error) {
    console.error('💥 Manual ingestion crashed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Run a quick ingestion with minimal data (for testing)
 */
async function runQuickIngestion() {
  const startTime = Date.now();
  logger.info('Starting quick ingestion (test mode)');

  try {
    // Run a single source with minimal data
    const result = await runQuickWeatherIngestion();
    
    const stats = {
      sources_processed: 1,
      sources_successful: result.success ? 1 : 0,
      total_fetched: result.stats?.fetched || 0,
      total_inserted: result.stats?.inserted || 0,
      total_errors: result.stats?.errors || 0,
      duration_ms: Date.now() - startTime
    };

    logger.info({ stats }, 'Quick ingestion completed');
    return { success: result.success, stats };
  } catch (error) {
    logger.error({ error }, 'Quick ingestion failed');
    return { success: false, error: error.message };
  }
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'run';
  
  // Quick mode handling
  if (command === 'quick') {
    runQuickIngestion()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
    return;
  }
  const source = args[1] || 'all';

  switch (command) {
    case 'run':
      runManualIngestion(source)
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    case 'start':
      scheduler.start();
      console.log('📅 Ingestion scheduler started');
      console.log('Press Ctrl+C to stop...');
      
      // Keep process alive
      process.on('SIGINT', () => {
        console.log('\n🛑 Stopping scheduler...');
        scheduler.stop();
        process.exit(0);
      });
      break;
      
    case 'status':
      console.log('📊 Scheduler Status:', scheduler.getStatus());
      process.exit(0);
      break;
      
    default:
      console.log('Usage:');
      console.log('  node orchestrator.js run [source]     - Run ingestion once (all|weather|twitter|satellite|protocol)');
      console.log('  node orchestrator.js start            - Start scheduled ingestion');
      console.log('  node orchestrator.js status           - Check scheduler status');
      process.exit(1);
  }
}

module.exports = {
  runFullIngestionPipeline,
  runSourceIngestion,
  runManualIngestion,
  IngestionScheduler,
  scheduler
};
