/**
 * Ingestion Pipeline Test Script - Day 3
 * Tests the complete ingestion flow with sample data
 */

const { runManualIngestion } = require('./orchestrator');
const { prisma } = require('../db');
const pino = require('pino');

const logger = pino({ name: 'pipeline-test' });

/**
 * Test the complete ingestion pipeline
 */
async function testIngestionPipeline() {
  console.log('🧪 Testing Ingestion Pipeline - Day 3');
  console.log('=====================================\n');

  try {
    // Step 1: Check database connection
    console.log('1️⃣ Testing database connection...');
    await prisma.$connect();
    console.log('✅ Database connected successfully\n');

    // Step 2: Clear existing test data (optional)
    console.log('2️⃣ Clearing existing test data...');
    const deleteResults = await prisma.document.deleteMany({
      where: {
        title: {
          contains: 'Test'
        }
      }
    });
    console.log(`✅ Cleared ${deleteResults.count} test documents\n`);

    // Step 3: Run ingestion pipeline
    console.log('3️⃣ Running full ingestion pipeline...');
    const pipelineResult = await runManualIngestion('all');
    
    if (pipelineResult.success) {
      console.log('✅ Pipeline completed successfully');
      console.log('📊 Pipeline Stats:', JSON.stringify(pipelineResult.stats, null, 2));
    } else {
      console.log('⚠️ Pipeline completed with errors:', pipelineResult.error);
      if (pipelineResult.stats) {
        console.log('📊 Pipeline Stats:', JSON.stringify(pipelineResult.stats, null, 2));
      }
    }
    console.log('');

    // Step 4: Verify data insertion
    console.log('4️⃣ Verifying data insertion...');
    const documentCount = await prisma.document.count();
    const alertCount = await prisma.alert.count();
    const workQueueCount = await prisma.workQueue.count();
    
    console.log(`📄 Documents inserted: ${documentCount}`);
    console.log(`🚨 Alerts inserted: ${alertCount}`);
    console.log(`⚙️ Work queue items: ${workQueueCount}`);

    // Step 5: Test search functionality
    console.log('\n5️⃣ Testing search functionality...');
    
    // Test full-text search
    const searchResults = await prisma.document.findMany({
      where: {
        content: {
          contains: 'fire'
        }
      },
      take: 3
    });
    
    console.log(`🔍 Full-text search results: ${searchResults.length} documents found`);
    
    if (searchResults.length > 0) {
      console.log('Sample result:', {
        title: searchResults[0].title,
        category: searchResults[0].category,
        confidence: searchResults[0].confidence
      });
    }

    // Step 6: Check ingestion logs
    console.log('\n6️⃣ Checking ingestion logs...');
    const recentLogs = await prisma.actionAudit.findMany({
      where: {
        action: {
          startsWith: 'INGEST_'
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    });

    console.log(`📋 Recent ingestion logs: ${recentLogs.length}`);
    recentLogs.forEach(log => {
      console.log(`  - ${log.action}: ${log.status} (${log.createdAt.toISOString()})`);
    });

    console.log('\n✅ Pipeline test completed successfully!');
    console.log('\n📈 Summary:');
    console.log(`  - Documents: ${documentCount}`);
    console.log(`  - Alerts: ${alertCount}`);
    console.log(`  - Queue items: ${workQueueCount}`);
    console.log(`  - Search working: ${searchResults.length > 0 ? 'Yes' : 'No'}`);
    console.log(`  - Logging working: ${recentLogs.length > 0 ? 'Yes' : 'No'}`);

    return {
      success: true,
      stats: {
        documents: documentCount,
        alerts: alertCount,
        queueItems: workQueueCount,
        searchWorking: searchResults.length > 0,
        loggingWorking: recentLogs.length > 0
      }
    };

  } catch (error) {
    console.error('❌ Pipeline test failed:', error.message);
    logger.error(error, 'Pipeline test failed');
    
    return {
      success: false,
      error: error.message
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Test individual ingestion source
 */
async function testSingleSource(source) {
  console.log(`🧪 Testing ${source} ingestion...`);
  
  try {
    await prisma.$connect();
    
    const result = await runManualIngestion(source);
    
    if (result.success) {
      console.log(`✅ ${source} ingestion test passed`);
      console.log('📊 Stats:', JSON.stringify(result.stats, null, 2));
    } else {
      console.log(`❌ ${source} ingestion test failed:`, result.error);
    }
    
    return result;
  } catch (error) {
    console.error(`💥 ${source} test crashed:`, error.message);
    return { success: false, error: error.message };
  } finally {
    await prisma.$disconnect();
  }
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'full';

  switch (command) {
    case 'full':
      testIngestionPipeline()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    case 'source':
      const source = args[1];
      if (!source) {
        console.error('Usage: node test-pipeline.js source <weather|twitter|satellite|protocol>');
        process.exit(1);
      }
      testSingleSource(source)
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
      
    default:
      console.log('Usage:');
      console.log('  node test-pipeline.js full           - Test complete pipeline');
      console.log('  node test-pipeline.js source <name>  - Test single source');
      process.exit(1);
  }
}

module.exports = {
  testIngestionPipeline,
  testSingleSource
};
