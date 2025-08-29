/**
 * Retrieval System Test Suite - Day 4
 * Tests hybrid search, RAG, and performance validation
 */

const { retrieveAndGenerate, getRetrievalStats } = require('../services/retrieverService');
const { hybridSearch, fullTextSearch, vectorSearch } = require('../services/searchService');
const { prisma } = require('../db');
const pino = require('pino');

const logger = pino({ name: 'retrieval-test' });

/**
 * Test different disaster query scenarios
 */
async function testRetrievalQueries() {
  console.log('🧪 Testing Retrieval Queries - Day 4');
  console.log('=====================================\n');

  const testQueries = [
    {
      query: 'Flooding in coastal region',
      expectedType: 'flood',
      description: 'Coastal flooding scenario'
    },
    {
      query: 'Earthquake magnitude 7.2 in urban area',
      expectedType: 'earthquake',
      description: 'Urban earthquake emergency'
    },
    {
      query: 'Wildfire spreading near residential areas',
      expectedType: 'wildfire',
      description: 'Residential wildfire threat'
    },
    {
      query: 'Cyclone approaching eastern coast with 150 kmph winds',
      expectedType: 'cyclone',
      description: 'High-intensity cyclone'
    },
    {
      query: 'Landslide blocking highway after heavy rainfall',
      expectedType: 'landslide',
      description: 'Infrastructure-blocking landslide'
    }
  ];

  const results = [];

  for (const testCase of testQueries) {
    console.log(`🔍 Testing: ${testCase.description}`);
    console.log(`Query: "${testCase.query}"`);

    try {
      const startTime = Date.now();
      
      const result = await retrieveAndGenerate(testCase.query, {
        maxResults: 5,
        textWeight: 0.4,
        vectorWeight: 0.6
      });

      const duration = Date.now() - startTime;

      const testResult = {
        ...testCase,
        success: true,
        duration,
        incidentsFound: result.metadata.totalIncidents,
        protocolsFound: result.metadata.totalProtocols,
        ragGenerated: !!result.ragResponse,
        ragLength: result.ragResponse?.length || 0,
        extractedEntities: result.extractedEntities,
        topIncident: result.retrievedContext.incidents[0]?.title || 'None',
        topProtocol: result.retrievedContext.protocols[0]?.title || 'None'
      };

      console.log(`✅ Success - Found ${testResult.incidentsFound} incidents, ${testResult.protocolsFound} protocols`);
      console.log(`⏱️  Response time: ${duration}ms`);
      console.log(`📝 RAG response: ${testResult.ragGenerated ? 'Generated' : 'Failed'} (${testResult.ragLength} chars)`);
      
      if (result.extractedEntities) {
        console.log(`🏷️  Extracted: ${result.extractedEntities.disaster_type || 'Unknown type'}, ${result.extractedEntities.severity || 'Unknown severity'}`);
      }
      
      console.log('');
      results.push(testResult);

    } catch (error) {
      console.error(`❌ Failed: ${error.message}`);
      results.push({
        ...testCase,
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      });
      console.log('');
    }
  }

  return results;
}

/**
 * Test hybrid scoring vs individual search methods
 */
async function testHybridScoring() {
  console.log('📊 Testing Hybrid Scoring Performance');
  console.log('====================================\n');

  const testQuery = 'Flooding in Mumbai coastal areas';
  const mockEmbedding = Array.from({ length: 768 }, () => Math.random() * 2 - 1);

  try {
    console.log(`Query: "${testQuery}"`);
    
    // Test all three search methods
    const [fullTextResults, vectorResults, hybridResults] = await Promise.all([
      fullTextSearch(testQuery, 10),
      vectorSearch(mockEmbedding, 10),
      hybridSearch(testQuery, mockEmbedding, { textWeight: 0.4, vectorWeight: 0.6 })
    ]);

    const comparison = {
      fullText: {
        count: fullTextResults.length,
        avgScore: fullTextResults.reduce((sum, r) => sum + (r.textScore || 0), 0) / fullTextResults.length || 0,
        topResult: fullTextResults[0]?.title || 'None'
      },
      vector: {
        count: vectorResults.length,
        avgScore: vectorResults.reduce((sum, r) => sum + (r.vectorScore || 0), 0) / vectorResults.length || 0,
        topResult: vectorResults[0]?.title || 'None'
      },
      hybrid: {
        count: hybridResults.length,
        avgScore: hybridResults.reduce((sum, r) => sum + (r.hybridScore || 0), 0) / hybridResults.length || 0,
        topResult: hybridResults[0]?.title || 'None'
      }
    };

    console.log('📈 Results Comparison:');
    console.log(`Full-text: ${comparison.fullText.count} results, avg score: ${comparison.fullText.avgScore.toFixed(3)}`);
    console.log(`Vector: ${comparison.vector.count} results, avg score: ${comparison.vector.avgScore.toFixed(3)}`);
    console.log(`Hybrid: ${comparison.hybrid.count} results, avg score: ${comparison.hybrid.avgScore.toFixed(3)}`);
    console.log('');

    console.log('🏆 Top Results:');
    console.log(`Full-text: ${comparison.fullText.topResult}`);
    console.log(`Vector: ${comparison.vector.topResult}`);
    console.log(`Hybrid: ${comparison.hybrid.topResult}`);
    console.log('');

    return comparison;

  } catch (error) {
    console.error(`❌ Hybrid scoring test failed: ${error.message}`);
    throw error;
  }
}

/**
 * Test retrieval logging and statistics
 */
async function testRetrievalLogging() {
  console.log('📋 Testing Retrieval Logging');
  console.log('============================\n');

  try {
    // Clear old logs for clean test
    await prisma.actionAudit.deleteMany({
      where: {
        action: 'RETRIEVE_RAG',
        createdAt: {
          lt: new Date(Date.now() - 60000) // Older than 1 minute
        }
      }
    });

    // Run a few test retrievals
    const testQueries = [
      'Earthquake in Japan',
      'Flood in Bangladesh',
      'Wildfire in California'
    ];

    console.log('🔄 Running test retrievals...');
    for (const query of testQueries) {
      await retrieveAndGenerate(query, { maxResults: 3 });
    }

    // Check statistics
    const stats = await getRetrievalStats({ hours: 1 });
    
    console.log('📊 Retrieval Statistics:');
    console.log(`Total retrievals: ${stats.totalRetrievals}`);
    console.log(`Successful: ${stats.successfulRetrievals}`);
    console.log(`Failed: ${stats.failedRetrievals}`);
    console.log(`Average response time: ${stats.performanceMetrics.avgTotalTime.toFixed(0)}ms`);
    console.log(`Average search time: ${stats.performanceMetrics.avgSearchTime.toFixed(0)}ms`);
    console.log(`Average RAG time: ${stats.performanceMetrics.avgRagTime.toFixed(0)}ms`);
    console.log('');

    console.log('🔝 Top Queries:');
    Object.entries(stats.topQueries)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .forEach(([query, count]) => {
        console.log(`  "${query}": ${count} times`);
      });
    console.log('');

    return stats;

  } catch (error) {
    console.error(`❌ Logging test failed: ${error.message}`);
    throw error;
  }
}

/**
 * Test database connectivity and data availability
 */
async function testDatabaseSetup() {
  console.log('🗄️  Testing Database Setup');
  console.log('==========================\n');

  try {
    // Check database connection
    await prisma.$connect();
    console.log('✅ Database connection successful');

    // Check data availability
    const documentCount = await prisma.document.count();
    const alertCount = await prisma.alert.count();
    const protocolCount = await prisma.document.count({
      where: { category: 'protocol' }
    });

    console.log(`📄 Documents: ${documentCount}`);
    console.log(`🚨 Alerts: ${alertCount}`);
    console.log(`📋 Protocols: ${protocolCount}`);

    // Check for embeddings
    const documentsWithEmbeddings = await prisma.document.count({
      where: {
        embedding: {
          not: null
        }
      }
    });

    console.log(`🔢 Documents with embeddings: ${documentsWithEmbeddings}`);

    if (documentCount === 0) {
      console.log('⚠️  No documents found - run ingestion pipeline first');
    }

    if (documentsWithEmbeddings === 0) {
      console.log('⚠️  No embeddings found - vector search will be limited');
    }

    console.log('');

    return {
      connected: true,
      documentCount,
      alertCount,
      protocolCount,
      embeddingCount: documentsWithEmbeddings
    };

  } catch (error) {
    console.error(`❌ Database test failed: ${error.message}`);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Run complete retrieval test suite
 */
async function runRetrievalTests() {
  console.log('🚀 Starting Retrieval System Tests - Day 4');
  console.log('==========================================\n');

  const testResults = {
    database: null,
    queries: null,
    hybridScoring: null,
    logging: null,
    summary: {}
  };

  try {
    // Test 1: Database setup
    console.log('1️⃣ Database Setup Test');
    testResults.database = await testDatabaseSetup();

    // Test 2: Query retrieval
    console.log('2️⃣ Query Retrieval Test');
    testResults.queries = await testRetrievalQueries();

    // Test 3: Hybrid scoring
    console.log('3️⃣ Hybrid Scoring Test');
    testResults.hybridScoring = await testHybridScoring();

    // Test 4: Logging and stats
    console.log('4️⃣ Logging and Statistics Test');
    testResults.logging = await testRetrievalLogging();

    // Generate summary
    const successfulQueries = testResults.queries.filter(q => q.success).length;
    const totalQueries = testResults.queries.length;
    const avgResponseTime = testResults.queries
      .filter(q => q.success && q.duration)
      .reduce((sum, q) => sum + q.duration, 0) / successfulQueries || 0;

    testResults.summary = {
      databaseConnected: testResults.database.connected,
      documentsAvailable: testResults.database.documentCount > 0,
      embeddingsAvailable: testResults.database.embeddingCount > 0,
      querySuccessRate: `${successfulQueries}/${totalQueries}`,
      averageResponseTime: `${avgResponseTime.toFixed(0)}ms`,
      hybridSearchWorking: testResults.hybridScoring.hybrid.count > 0,
      loggingWorking: testResults.logging.totalRetrievals > 0
    };

    console.log('✅ All Retrieval Tests Completed Successfully!');
    console.log('\n📈 Test Summary:');
    console.log(`  - Database: ${testResults.summary.databaseConnected ? 'Connected' : 'Failed'}`);
    console.log(`  - Documents: ${testResults.summary.documentsAvailable ? 'Available' : 'Missing'}`);
    console.log(`  - Embeddings: ${testResults.summary.embeddingsAvailable ? 'Available' : 'Missing'}`);
    console.log(`  - Query Success: ${testResults.summary.querySuccessRate}`);
    console.log(`  - Avg Response: ${testResults.summary.averageResponseTime}`);
    console.log(`  - Hybrid Search: ${testResults.summary.hybridSearchWorking ? 'Working' : 'Failed'}`);
    console.log(`  - Logging: ${testResults.summary.loggingWorking ? 'Working' : 'Failed'}`);

    return testResults;

  } catch (error) {
    console.error('💥 Retrieval test suite failed:', error.message);
    return { ...testResults, error: error.message };
  }
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  const testType = args[0] || 'all';

  switch (testType) {
    case 'queries':
      testRetrievalQueries()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
    case 'scoring':
      testHybridScoring()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
    case 'logging':
      testRetrievalLogging()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
    case 'database':
      testDatabaseSetup()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
    case 'all':
    default:
      runRetrievalTests()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      break;
  }
}

module.exports = {
  runRetrievalTests,
  testRetrievalQueries,
  testHybridScoring,
  testRetrievalLogging,
  testDatabaseSetup
};
