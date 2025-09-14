/**
 * Enhanced End-to-End Pipeline Test - Complete LLM Orchestration Flow
 * Tests the complete flow: F → G → H → I
 * F (Incident Trigger) → G (LLM Orchestrator) → H (Vector + Full-text Retrieval) → I (LLM Plan Generation)
 */

const { runManualIngestion, runQuickIngestion } = require('../ingestion/orchestrator');
const { responseOrchestrator } = require('./responseOrchestratorService');
const { retrieveAndGenerate } = require('./retrieverService');
const { hybridSearch, vectorSearch, fullTextSearch, getJinaEmbedding, healthCheck } = require('./searchService');
const { ActionOrchestrator } = require('./actionServices');
const { prisma } = require('../db');
const pino = require('pino');
const { createClient } = require('redis');
const express = require('express');
const request = require('supertest');

const logger = pino({ name: 'end-to-end-pipeline-test' });

/**
 * Complete End-to-End Pipeline Test Suite
 * Tests the full LLM Orchestration Pipeline with real scenarios
 */
async function testCompleteOrchestrationFlow() {
  console.log('🚀 Complete LLM Orchestration Pipeline Test');
  console.log('===========================================\n');

  const testResults = {
    // Infrastructure Tests
    database: false,
    redis: false,
    searchService: false,
    
    // Data Pipeline Tests (A → B → C from your original description)
    dataIngestion: false,
    dataStorage: false,
    embeddingGeneration: false,
    
    // LLM Orchestration Pipeline Tests (F → G → H → I)
    incidentTrigger: false,           // F: API endpoints receive requests
    llmOrchestrator: false,           // G: responseOrchestratorService coordination
    retrievalSystem: false,           // H: Vector + Full-text retrieval
    planGeneration: false,            // I: LLM generates structured response
    
    // Integration Tests
    endToEndAPI: false,
    caching: false,
    errorHandling: false,
    performanceTest: false
  };

  const performanceMetrics = {
    dataIngestionTime: 0,
    retrievalTime: 0,
    planGenerationTime: 0,
    totalOrchestrationTime: 0,
    apiResponseTime: 0
  };

  const testScenarios = [
    {
      name: 'Wildfire Emergency',
      query: 'Fast-spreading wildfire threatening residential areas with strong winds and dry conditions',
      type: 'wildfire',
      location: 'California, Napa Valley',
      severity: 'high',
      metadata: { wind_speed: '35 mph', humidity: '10%', temp: '105F' }
    },
    {
      name: 'Urban Flooding',
      query: 'Severe urban flooding due to heavy rainfall overwhelming drainage systems',
      type: 'flood',
      location: 'Mumbai, Maharashtra',
      severity: 'severe',
      metadata: { rainfall: '250mm in 4 hours', affected_population: '75000' }
    },
    {
      name: 'Earthquake with Aftershocks',
      query: 'Major earthquake causing structural damage with ongoing aftershock risk',
      type: 'earthquake',
      location: 'Tokyo, Japan',
      severity: 'critical',
      metadata: { magnitude: '7.4', depth: '15 km', aftershocks: 'expected' }
    }
  ];

  let redisClient = null;
  let testApp = null;

  try {
    // ===== PHASE 1: INFRASTRUCTURE VALIDATION =====
    console.log('🔧 PHASE 1: Infrastructure & Prerequisites');
    console.log('=========================================\n');

    // Test 1: Database Connection
    console.log('1️⃣ Testing database connection...');
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1 as test`;
      testResults.database = true;
      console.log('✅ Database connected successfully');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      return { success: false, testResults, error: 'Database connection failed' };
    }

    // Test 2: Redis Connection
    console.log('\n2️⃣ Testing Redis connection...');
    try {
      redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });
      await redisClient.connect();
      await redisClient.ping();
      testResults.redis = true;
      console.log('✅ Redis connected successfully');
    } catch (error) {
      console.error('❌ Redis connection failed:', error.message);
      testResults.redis = false;
    }

    // Test 3: Search Service Health
    console.log('\n3️⃣ Testing search service health...');
    try {
      const healthStatus = await healthCheck();
      testResults.searchService = healthStatus.database && healthStatus.redis;
      console.log(testResults.searchService ? '✅ Search service healthy' : '⚠️ Search service issues detected');
    } catch (error) {
      console.error('❌ Search service health check failed:', error.message);
    }

    // ===== PHASE 2: DATA PIPELINE SETUP =====
    console.log('\n📥 PHASE 2: Data Pipeline Preparation');
    console.log('=====================================\n');

    // Test 4: Clear and Prepare Test Data
    console.log('4️⃣ Preparing test data...');
    const startIngestionTime = Date.now();
    
    // Clear existing test data
    await prisma.document.deleteMany({
      where: {
        OR: [
          { title: { contains: 'Test' } },
          { category: 'protocol' }
        ]
      }
    });
    await prisma.alert.deleteMany({
      where: { source: { in: ['weather', 'twitter', 'satellite', 'protocol'] } }
    });

    // Run ingestion to populate database with test data
    const ingestionResult = await runManualIngestion('all');
    performanceMetrics.dataIngestionTime = Date.now() - startIngestionTime;

    if (ingestionResult.success) {
      testResults.dataIngestion = true;
      testResults.dataStorage = true;
      console.log('✅ Test data prepared successfully');
      console.log(`📊 Ingested: ${ingestionResult.stats?.total_inserted || 0} documents`);
    } else {
      console.log('⚠️ Data ingestion had issues, continuing with existing data');
    }

    // Test 5: Verify Embeddings
    console.log('\n5️⃣ Testing embedding generation...');
    try {
      const testEmbedding = await getJinaEmbedding('Emergency flood response protocol test');
      if (testEmbedding && Array.isArray(testEmbedding) && testEmbedding.length === 1024) {
        testResults.embeddingGeneration = true;
        console.log('✅ Embedding generation working');
      }
    } catch (error) {
      console.error('❌ Embedding generation failed:', error.message);
    }

    // ===== PHASE 3: LLM ORCHESTRATION PIPELINE (F → G → H → I) =====
    console.log('\n🧠 PHASE 3: LLM Orchestration Pipeline Testing');
    console.log('==============================================\n');

    // Test 6: F - Incident Trigger (API Endpoints)
    console.log('6️⃣ Testing F - Incident Trigger (API Endpoints)...');
    try {
      // Create test Express app with orchestrator routes
      testApp = express();
      testApp.use(express.json());
      testApp.use('/api/orchestrate', require('../routes/orchestratorRoutes'));
      testApp.use('/api', require('../routes/respond'));

      // Test /api/orchestrate endpoint
      const apiStartTime = Date.now();
      const testScenario = testScenarios[0]; // Use wildfire scenario
      
      const apiResponse = await request(testApp)
        .post('/api/orchestrate')
        .send(testScenario)
        .expect(200);

      performanceMetrics.apiResponseTime = Date.now() - apiStartTime;

      if (apiResponse.body.success && apiResponse.body.action_plan) {
        testResults.incidentTrigger = true;
        console.log('✅ F - Incident Trigger working');
        console.log(`📊 API Response Time: ${performanceMetrics.apiResponseTime}ms`);
      }
    } catch (error) {
      console.error('❌ F - Incident Trigger failed:', error.message);
    }

    // Test 7: G - LLM Orchestrator Service
    console.log('\n7️⃣ Testing G - LLM Orchestrator (Response Orchestration)...');
    try {
      const orchestratorStartTime = Date.now();
      const testScenario = testScenarios[1]; // Use flood scenario

      const orchestrationResult = await responseOrchestrator.generateActionPlan(testScenario);
      const orchestratorTime = Date.now() - orchestratorStartTime;

      if (orchestrationResult && orchestrationResult.situation_assessment) {
        testResults.llmOrchestrator = true;
        performanceMetrics.totalOrchestrationTime = orchestratorTime;
        console.log('✅ G - LLM Orchestrator working');
        console.log(`📊 Orchestration Time: ${orchestratorTime}ms`);
        console.log(`🎯 Plan Generated: ${orchestrationResult.immediate_actions?.length || 0} immediate actions`);
      }
    } catch (error) {
      console.error('❌ G - LLM Orchestrator failed:', error.message);
    }

    // Test 8: H - Vector + Full-text Retrieval System
    console.log('\n8️⃣ Testing H - Retrieval System (Vector + Full-text)...');
    try {
      const retrievalStartTime = Date.now();
      const testQuery = 'earthquake emergency response evacuation procedures';

      // Test hybrid search
      const hybridResults = await hybridSearch(testQuery, {
        type: 'document',
        limit: 5,
        filters: { category: 'protocol' }
      });

      // Test retriever service (RAG preparation)
      const ragResults = await retrieveAndGenerate(testQuery, {
        maxResults: 5,
        includeProtocols: true,
        includeSimilarIncidents: true
      });

      performanceMetrics.retrievalTime = Date.now() - retrievalStartTime;

      if (hybridResults.length > 0 && ragResults.retrievedContext) {
        testResults.retrievalSystem = true;
        console.log('✅ H - Retrieval System working');
        console.log(`📊 Retrieval Time: ${performanceMetrics.retrievalTime}ms`);
        console.log(`🔍 Retrieved: ${hybridResults.length} documents, ${ragResults.metadata.totalIncidents} incidents`);
      }
    } catch (error) {
      console.error('❌ H - Retrieval System failed:', error.message);
    }

    // Test 9: I - LLM Plan Generation
    console.log('\n9️⃣ Testing I - LLM Plan Generation...');
    try {
      const planGenStartTime = Date.now();
      const testScenario = testScenarios[2]; // Use earthquake scenario

      // Test the complete RAG pipeline
      const ragResult = await retrieveAndGenerate(
        `${testScenario.query} in ${testScenario.location}`,
        {
          disasterType: testScenario.type,
          location: testScenario.location,
          maxResults: 5
        }
      );

      performanceMetrics.planGenerationTime = Date.now() - planGenStartTime;

      if (ragResult.ragResponse && ragResult.ragResponse.length > 100) {
        testResults.planGeneration = true;
        console.log('✅ I - LLM Plan Generation working');
        console.log(`📊 Plan Generation Time: ${performanceMetrics.planGenerationTime}ms`);
        console.log(`📝 Generated Plan Length: ${ragResult.ragResponse.length} characters`);
      }
    } catch (error) {
      console.error('❌ I - LLM Plan Generation failed:', error.message);
    }

    // ===== PHASE 4: INTEGRATION & END-TO-END TESTS =====
    console.log('\n🔗 PHASE 4: Integration & End-to-End Testing');
    console.log('============================================\n');

    // Test 10: Complete End-to-End API Flow
    console.log('🔟 Testing complete end-to-end API flow...');
    try {
      const e2eStartTime = Date.now();
      
      // Test the complete /api/respond endpoint
      const respondPayload = {
        incident_type: 'wildfire',
        location: {
          lat: 38.5816,
          lon: -122.5016,
          name: 'Napa Valley, California'
        },
        severity: 'high',
        description: 'Fast-spreading wildfire with strong winds threatening residential areas',
        options: {
          max_evacuation_points: 3,
          include_sms: false, // Skip SMS for testing
          generate_routes: false, // Skip route generation for testing
          max_results: 5
        }
      };

      const e2eResponse = await request(testApp)
        .post('/api/respond')
        .send(respondPayload)
        .expect(200);

      const e2eTime = Date.now() - e2eStartTime;

      if (e2eResponse.body.status === 'success' && e2eResponse.body.plan) {
        testResults.endToEndAPI = true;
        console.log('✅ End-to-End API flow working');
        console.log(`📊 E2E Response Time: ${e2eTime}ms`);
        console.log(`🎯 Generated Plan: ${e2eResponse.body.plan.steps?.length || 0} steps`);
      }
    } catch (error) {
      console.error('❌ End-to-End API flow failed:', error.message);
    }

    // Test 11: Caching System
    console.log('\n1️⃣1️⃣ Testing caching system...');
    if (testResults.redis) {
      try {
        const cacheTestScenario = testScenarios[0];
        
        // First call (should cache)
        const firstCallTime = Date.now();
        await responseOrchestrator.generateActionPlan(cacheTestScenario);
        const firstCallDuration = Date.now() - firstCallTime;

        // Second call (should be cached)
        const secondCallTime = Date.now();
        const cachedResult = await responseOrchestrator.generateActionPlan(cacheTestScenario);
        const secondCallDuration = Date.now() - secondCallTime;

        if (cachedResult.metadata?.cached || secondCallDuration < firstCallDuration * 0.5) {
          testResults.caching = true;
          console.log('✅ Caching system working');
          console.log(`📊 Cache speedup: ${Math.round((firstCallDuration/secondCallDuration) * 100) / 100}x faster`);
        }
      } catch (error) {
        console.error('❌ Caching test failed:', error.message);
      }
    } else {
      console.log('⚠️ Skipping cache test (Redis not available)');
    }

    // Test 12: Error Handling & Fallback
    console.log('\n1️⃣2️⃣ Testing error handling and fallbacks...');
    try {
      // Test with invalid input
      const fallbackResult = await responseOrchestrator.generateActionPlan({
        query: 'invalid',
        type: 'unknown_disaster',
        location: 'nowhere',
        severity: 'invalid'
      });

      if (fallbackResult && fallbackResult.situation_assessment) {
        testResults.errorHandling = true;
        console.log('✅ Error handling working');
        console.log(`🛡️ Fallback reason: ${fallbackResult.fallback_reason || 'None'}`);
      }
    } catch (error) {
      console.error('❌ Error handling test failed:', error.message);
    }

    // Test 13: Performance Benchmark
    console.log('\n1️⃣3️⃣ Running performance benchmark...');
    try {
      const benchmarkScenarios = testScenarios.slice(0, 2);
      const benchmarkTimes = [];

      for (const scenario of benchmarkScenarios) {
        const startTime = Date.now();
        await responseOrchestrator.generateActionPlan(scenario);
        benchmarkTimes.push(Date.now() - startTime);
      }

      const avgTime = benchmarkTimes.reduce((sum, time) => sum + time, 0) / benchmarkTimes.length;
      
      if (avgTime > 0 && avgTime < 30000) { // Should complete within 30 seconds
        testResults.performanceTest = true;
        console.log('✅ Performance benchmark passed');
        console.log(`📊 Average Response Time: ${Math.round(avgTime)}ms`);
      }
    } catch (error) {
      console.error('❌ Performance benchmark failed:', error.message);
    }

    // ===== PHASE 5: RESULTS & ANALYSIS =====
    console.log('\n📊 PHASE 5: Test Results & Analysis');
    console.log('===================================\n');

    const passedTests = Object.values(testResults).filter(Boolean).length;
    const totalTests = Object.keys(testResults).length;
    const successRate = ((passedTests / totalTests) * 100).toFixed(1);

    console.log(`✅ Tests Passed: ${passedTests}/${totalTests} (${successRate}%)`);
    
    console.log('\n📈 Test Results Breakdown:');
    console.log('📱 Infrastructure Tests:');
    console.log(`  ${testResults.database ? '✅' : '❌'} Database Connection`);
    console.log(`  ${testResults.redis ? '✅' : '❌'} Redis Connection`);
    console.log(`  ${testResults.searchService ? '✅' : '❌'} Search Service Health`);

    console.log('\n📥 Data Pipeline Tests:');
    console.log(`  ${testResults.dataIngestion ? '✅' : '❌'} Data Ingestion`);
    console.log(`  ${testResults.dataStorage ? '✅' : '❌'} Data Storage`);
    console.log(`  ${testResults.embeddingGeneration ? '✅' : '❌'} Embedding Generation`);

    console.log('\n🧠 LLM Orchestration Pipeline Tests:');
    console.log(`  ${testResults.incidentTrigger ? '✅' : '❌'} F - Incident Trigger (API)`);
    console.log(`  ${testResults.llmOrchestrator ? '✅' : '❌'} G - LLM Orchestrator`);
    console.log(`  ${testResults.retrievalSystem ? '✅' : '❌'} H - Vector + Full-text Retrieval`);
    console.log(`  ${testResults.planGeneration ? '✅' : '❌'} I - LLM Plan Generation`);

    console.log('\n🔗 Integration Tests:');
    console.log(`  ${testResults.endToEndAPI ? '✅' : '❌'} End-to-End API Flow`);
    console.log(`  ${testResults.caching ? '✅' : '❌'} Caching System`);
    console.log(`  ${testResults.errorHandling ? '✅' : '❌'} Error Handling`);
    console.log(`  ${testResults.performanceTest ? '✅' : '❌'} Performance Benchmark`);

    console.log('\n⚡ Performance Metrics:');
    console.log(`  Data Ingestion: ${performanceMetrics.dataIngestionTime}ms`);
    console.log(`  Retrieval System: ${performanceMetrics.retrievalTime}ms`);
    console.log(`  Plan Generation: ${performanceMetrics.planGenerationTime}ms`);
    console.log(`  Total Orchestration: ${performanceMetrics.totalOrchestrationTime}ms`);
    console.log(`  API Response: ${performanceMetrics.apiResponseTime}ms`);

    const pipelineStatus = {
      'Infrastructure': testResults.database && testResults.redis && testResults.searchService,
      'Data Pipeline': testResults.dataIngestion && testResults.dataStorage && testResults.embeddingGeneration,
      'LLM Orchestration': testResults.incidentTrigger && testResults.llmOrchestrator && testResults.retrievalSystem && testResults.planGeneration,
      'Integration': testResults.endToEndAPI && testResults.errorHandling
    };

    console.log('\n🎯 Pipeline Status Summary:');
    Object.entries(pipelineStatus).forEach(([phase, status]) => {
      console.log(`  ${status ? '🟢' : '🔴'} ${phase}: ${status ? 'OPERATIONAL' : 'ISSUES DETECTED'}`);
    });

    const overallSuccess = passedTests >= (totalTests * 0.75); // 75% pass rate for complex system
    const llmPipelineWorking = testResults.incidentTrigger && testResults.llmOrchestrator && 
                              testResults.retrievalSystem && testResults.planGeneration;

    console.log(`\n${overallSuccess && llmPipelineWorking ? '🎉' : '⚠️'} Overall Status: ${overallSuccess && llmPipelineWorking ? 'SUCCESS' : 'NEEDS ATTENTION'}`);
    
    if (llmPipelineWorking) {
      console.log('✅ Complete LLM Orchestration Pipeline (F → G → H → I) is OPERATIONAL');
    } else {
      console.log('❌ LLM Orchestration Pipeline has issues - check individual components');
    }

    return {
      success: overallSuccess && llmPipelineWorking,
      testResults,
      performanceMetrics,
      successRate: parseFloat(successRate),
      llmPipelineOperational: llmPipelineWorking
    };

  } catch (error) {
    console.error('💥 Test suite crashed:', error.message);
    logger.error(error, 'Complete orchestration test failed');

    return {
      success: false,
      testResults,
      error: error.message,
      performanceMetrics
    };
    
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up test environment...');
    
    try {
      if (redisClient && redisClient.isOpen) {
        await redisClient.quit();
      }
      await prisma.$disconnect();
      console.log('✅ Cleanup completed');
    } catch (cleanupError) {
      console.error('⚠️ Cleanup warning:', cleanupError.message);
    }
  }
}

/**
 * Quick LLM Pipeline Test - Focused on core orchestration
 */
async function testLLMPipelineQuick() {
  console.log('⚡ Quick LLM Orchestration Pipeline Test');
  console.log('=======================================\n');

  const testScenario = {
    query: 'Severe flood emergency in downtown area with rising water levels',
    type: 'flood',
    location: 'Mumbai, India',
    severity: 'high'
  };

  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    // Test G: LLM Orchestrator
    console.log('\n🧠 Testing LLM Orchestrator...');
    const orchestrationResult = await responseOrchestrator.generateActionPlan(testScenario);
    
    if (orchestrationResult && orchestrationResult.situation_assessment) {
      console.log('✅ LLM Orchestration successful');
      console.log(`📋 Generated ${orchestrationResult.immediate_actions?.length || 0} immediate actions`);
    }

    // Test H: Retrieval System
    console.log('\n🔍 Testing Retrieval System...');
    const retrievalResult = await retrieveAndGenerate(testScenario.query, {
      disasterType: testScenario.type,
      location: testScenario.location
    });

    if (retrievalResult.ragResponse) {
      console.log('✅ Retrieval & RAG successful');
      console.log(`📊 Found ${retrievalResult.metadata.totalIncidents} incidents, ${retrievalResult.metadata.totalProtocols} protocols`);
    }

    console.log('\n⚡ Quick LLM pipeline test completed!');
    
    return { 
      success: true, 
      orchestrationWorking: !!orchestrationResult.situation_assessment,
      retrievalWorking: !!retrievalResult.ragResponse
    };

  } catch (error) {
    console.error('💥 Quick LLM pipeline test failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Test specific orchestration component
 */
async function testOrchestrationComponent(componentName) {
  console.log(`🧪 Testing LLM Orchestration Component: ${componentName}`);
  console.log('===============================================\n');

  try {
    await prisma.$connect();

    switch (componentName.toLowerCase()) {
      case 'trigger':
      case 'f':
        return await testIncidentTrigger();
      case 'orchestrator':
      case 'g':
        return await testLLMOrchestrator();
      case 'retrieval':
      case 'h':
        return await testRetrievalSystem();
      case 'generation':
      case 'i':
        return await testPlanGeneration();
      default:
        throw new Error(`Unknown component: ${componentName}. Use: trigger/f, orchestrator/g, retrieval/h, generation/i`);
    }

  } catch (error) {
    console.error(`💥 Component test failed:`, error.message);
    return { success: false, error: error.message };
  } finally {
    await prisma.$disconnect();
  }
}

async function testIncidentTrigger() {
  const app = express();
  app.use(express.json());
  app.use('/api/orchestrate', require('../routes/orchestratorRoutes'));
  
  const response = await request(app)
    .post('/api/orchestrate')
    .send({
      query: 'Emergency wildfire spreading rapidly',
      type: 'wildfire',
      location: 'California',
      severity: 'high'
    });

  const success = response.status === 200 && response.body.success;
  console.log(success ? '✅ F - Incident Trigger working' : '❌ F - Incident Trigger failed');
  return { success, responseTime: response.body?.response_time_ms || 0 };
}

async function testLLMOrchestrator() {
  const result = await responseOrchestrator.generateActionPlan({
    query: 'Urban flood emergency with infrastructure damage',
    type: 'flood',
    location: 'Mumbai',
    severity: 'severe'
  });

  const success = result && result.situation_assessment;
  console.log(success ? '✅ G - LLM Orchestrator working' : '❌ G - LLM Orchestrator failed');
  return { success, planGenerated: !!result };
}

async function testRetrievalSystem() {
  const results = await hybridSearch('earthquake emergency response protocol', {
    type: 'document',
    limit: 5
  });

  const success = results.length > 0;
  console.log(success ? '✅ H - Retrieval System working' : '❌ H - Retrieval System failed');
  return { success, resultsFound: results.length };
}

async function testPlanGeneration() {
  const ragResult = await retrieveAndGenerate('severe cyclone approaching coastal area', {
    disasterType: 'cyclone',
    maxResults: 3
  });

  const success = ragResult.ragResponse && ragResult.ragResponse.length > 50;
  console.log(success ? '✅ I - Plan Generation working' : '❌ I - Plan Generation failed');
  return { success, responseLength: ragResult.ragResponse?.length || 0 };
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'complete';

  switch (command) {
    case 'complete':
    case 'full':
    case 'e2e':
      testCompleteOrchestrationFlow()
        .then((result) => {
          process.exit(result.success ? 0 : 1);
        })
        .catch((error) => {
          console.error('💥 Complete orchestration test crashed:', error.message);
          process.exit(1);
        });
      break;

    case 'quick':
    case 'llm':
      testLLMPipelineQuick()
        .then((result) => {
          process.exit(result.success ? 0 : 1);
        })
        .catch(() => process.exit(1));
      break;

    case 'component':
      const component = args[1];
      if (!component) {
        console.error('Usage: node test-pipeline.js component <trigger|orchestrator|retrieval|generation>');
        console.error('       or: node test-pipeline.js component <f|g|h|i>');
        process.exit(1);
      }
      testOrchestrationComponent(component)
        .then((result) => {
          process.exit(result.success ? 0 : 1);
        })
        .catch(() => process.exit(1));
      break;

    default:
      console.log('Enhanced LLM Orchestration Pipeline Test Suite');
      console.log('=============================================');
      console.log('Usage:');
      console.log('  node test-pipeline.js complete             - Run complete end-to-end test (recommended)');
      console.log('  node test-pipeline.js quick               - Run quick LLM pipeline test');
      console.log('  node test-pipeline.js component <name>    - Test specific component');
      console.log('');
      console.log('Available components:');
      console.log('  trigger (F)      - Test incident trigger API endpoints');
      console.log('  orchestrator (G) - Test LLM orchestrator service');
      console.log('  retrieval (H)    - Test vector + full-text retrieval');
      console.log('  generation (I)   - Test LLM plan generation');
      console.log('');
      console.log('LLM Orchestration Pipeline Flow: F → G → H → I');
      console.log('  F: Incident Trigger → G: LLM Orchestrator → H: Retrieval → I: Plan Generation');
      process.exit(1);
  }
}

module.exports = {
  testCompleteOrchestrationFlow,
  testLLMPipelineQuick,
  testOrchestrationComponent,
  testIncidentTrigger,
  testLLMOrchestrator,
  testRetrievalSystem,
  testPlanGeneration
};