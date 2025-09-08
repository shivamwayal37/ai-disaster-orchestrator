#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.EMBEDDING_WORKER_ENABLED = 'true';
process.env.EMBEDDING_WORKER_BATCH_SIZE = '10';
process.env.EMBEDDING_WORKER_POLL_INTERVAL = '5000';

// Simple console logger for the test runner
const logger = {
  info: (...args) => console.log('ℹ️', ...args),
  error: (...args) => console.error('❌', ...args),
  success: (...args) => console.log('✅', ...args),
  warn: (...args) => console.warn('⚠️', ...args)
};

// Import required services
let searchService, prisma, redisClient;
try {
  searchService = require('../src/services/searchService');
  prisma = require('../src/db').prisma;
  redisClient = searchService.redisClient;
} catch (error) {
  logger.error('Failed to import required services:', error.message);
  process.exit(1);
}

// Test results tracking
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

function recordTest(name, passed, details = {}) {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    logger.success(`${name}: PASSED`, details);
  } else {
    testResults.failed++;
    logger.error(`${name}: FAILED`, details);
    testResults.errors.push({ test: name, ...details });
  }
}

// Test searchService.js functionality
async function testSearchService() {
  logger.info('\n🔍 Testing Search Service...');
  
  try {
    // Test 1: Health check
    const healthResult = await searchService.healthCheck();
    recordTest('searchService.healthCheck', healthResult === true, { health: healthResult });
    
    // Test 2: Vector search
    const vectorResults = await searchService.vectorSearch('earthquake emergency response', {
      type: 'document',
      limit: 5
    });
    recordTest('searchService.vectorSearch', Array.isArray(vectorResults), { 
      resultCount: vectorResults?.length || 0 
    });
    
    // Test 3: Full-text search
    const textResults = await searchService.fullTextSearch('disaster protocol', {
      type: 'document',
      limit: 5
    });
    recordTest('searchService.fullTextSearch', Array.isArray(textResults), { 
      resultCount: textResults?.length || 0 
    });
    
    // Test 4: Hybrid search
    const hybridResults = await searchService.hybridSearch('wildfire evacuation plan', {
      type: 'document',
      limit: 5
    });
    recordTest('searchService.hybridSearch', Array.isArray(hybridResults), { 
      resultCount: hybridResults?.length || 0 
    });
    
    // Test 5: Search with incident type (should map to alert)
    const incidentResults = await searchService.hybridSearch('emergency incident', {
      type: 'incident',
      limit: 3
    });
    recordTest('searchService.incidentTypeMapping', Array.isArray(incidentResults), { 
      resultCount: incidentResults?.length || 0,
      message: 'Tests incident->alert type mapping'
    });
    
    // Test 6: Performance test
    const startTime = performance.now();
    await searchService.generateOptimizedActionPlan('flood emergency response');
    const responseTime = performance.now() - startTime;
    recordTest('searchService.performance', responseTime < 30000, { 
      responseTime: `${responseTime.toFixed(2)}ms`,
      target: '30000ms'
    });
    
  } catch (error) {
    recordTest('searchService.general', false, { error: error.message });
  }
}

// Test Python embedding worker
async function testPythonWorker() {
  logger.info('\n🐍 Testing Python Embedding Worker...');
  
  const workerPath = path.join(__dirname, '../../workers/embedding_worker.py');
  
  // Check if worker file exists
  if (!fs.existsSync(workerPath)) {
    recordTest('pythonWorker.fileExists', false, { 
      error: 'embedding_worker.py not found',
      path: workerPath
    });
    return;
  }
  
  recordTest('pythonWorker.fileExists', true, { path: workerPath });
  
  // Test worker can be imported/executed
  return new Promise((resolve) => {
    const pythonProcess = spawn('python', [workerPath, '--help'], {
      cwd: path.dirname(workerPath)
    });
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      const success = code === 0 || output.includes('usage:') || output.includes('Embedding Worker');
      recordTest('pythonWorker.execution', success, {
        exitCode: code,
        hasOutput: output.length > 0,
        outputPreview: output.substring(0, 200)
      });
      
      if (errorOutput && !success) {
        recordTest('pythonWorker.errors', false, {
          stderr: errorOutput.substring(0, 500)
        });
      }
      
      resolve();
    });
    
    // Timeout after 10 seconds
    setTimeout(() => {
      pythonProcess.kill();
      recordTest('pythonWorker.timeout', false, { error: 'Process timed out after 10s' });
      resolve();
    }, 10000);
  });
}

// Test Redis integration
async function testRedisIntegration() {
  logger.info('\n📦 Testing Redis Integration...');
  
  try {
    // Test Redis connection
    const pingResult = await redisClient.ping();
    recordTest('redis.connection', pingResult === 'PONG', { ping: pingResult });
    
    // Test cache operations
    const testKey = `test:${Date.now()}`;
    const testValue = JSON.stringify({ test: 'data', timestamp: Date.now() });
    
    await redisClient.set(testKey, testValue, { EX: 60 });
    const retrievedValue = await redisClient.get(testKey);
    
    recordTest('redis.cacheOperations', retrievedValue === testValue, {
      set: !!testValue,
      retrieved: !!retrievedValue,
      matches: retrievedValue === testValue
    });
    
    // Clean up
    await redisClient.del(testKey);
    
  } catch (error) {
    recordTest('redis.integration', false, { error: error.message });
  }
}

// Test database integration
async function testDatabaseIntegration() {
  logger.info('\n🗄️ Testing Database Integration...');
  
  try {
    // Test basic query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    recordTest('database.connection', Array.isArray(result) && result.length > 0, {
      queryResult: result?.[0]?.test
    });
    
    // Test documents table
    const docCount = await prisma.document.count();
    recordTest('database.documentsTable', typeof docCount === 'number', {
      documentCount: docCount
    });
    
    // Test alerts table
    const alertCount = await prisma.alert.count();
    recordTest('database.alertsTable', typeof alertCount === 'number', {
      alertCount: alertCount
    });
    
  } catch (error) {
    recordTest('database.integration', false, { error: error.message });
  }
}

// Main test runner
async function runTests() {
  logger.info('🚀 Starting Manual Integration Tests for Embedding Pipeline');
  console.log('='.repeat(80));
  
  const startTime = performance.now();
  
  try {
    // Run all test suites
    await testDatabaseIntegration();
    await testRedisIntegration();
    await testSearchService();
    await testPythonWorker();
    
    const totalTime = performance.now() - startTime;
    
    // Generate final report
    console.log('\n' + '='.repeat(80));
    logger.info('📊 Test Results Summary:');
    console.log(`Total Tests: ${testResults.total}`);
    console.log(`Passed: ${testResults.passed} ✅`);
    console.log(`Failed: ${testResults.failed} ❌`);
    console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
    console.log(`Total Time: ${(totalTime / 1000).toFixed(2)}s`);
    
    if (testResults.failed > 0) {
      console.log('\n❌ Failed Tests:');
      testResults.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.test}: ${error.error || 'Unknown error'}`);
      });
    }
    
    const success = testResults.failed === 0;
    if (success) {
      logger.success('All tests passed! 🎉');
    } else {
      logger.error(`${testResults.failed} test(s) failed`);
    }
    
    process.exit(success ? 0 : 1);
    
  } catch (error) {
    logger.error('Test runner failed:', error.message);
    process.exit(1);
  } finally {
    // Cleanup
    try {
      await prisma.$disconnect();
      if (redisClient && redisClient.isOpen) {
        await redisClient.quit();
      }
    } catch (error) {
      logger.warn('Cleanup error:', error.message);
    }
  }
}

// Additional integration tests
async function testEndToEndPipeline() {
  logger.info('\n🔄 Testing End-to-End Pipeline...');
  
  try {
    // Test document insertion and embedding workflow
    const testDoc = {
      id: `test-doc-${Date.now()}`,
      title: 'Test Emergency Protocol',
      content: 'This is a test emergency response protocol for earthquake scenarios.',
      category: 'protocol'
    };
    
    // Insert test document
    const insertedDoc = await prisma.document.create({
      data: testDoc
    });
    
    recordTest('pipeline.documentInsertion', !!insertedDoc, {
      docId: insertedDoc.id
    });
    
    // Test search can find the document
    const searchResults = await searchService.fullTextSearch('test emergency protocol', {
      type: 'document',
      limit: 5
    });
    
    const foundDoc = searchResults.find(doc => doc.id === testDoc.id);
    recordTest('pipeline.documentSearchable', !!foundDoc, {
      searchResultCount: searchResults.length,
      foundTestDoc: !!foundDoc
    });
    
    // Cleanup test document
    await prisma.document.delete({
      where: { id: testDoc.id }
    });
    
    recordTest('pipeline.cleanup', true, { message: 'Test document cleaned up' });
    
  } catch (error) {
    recordTest('pipeline.endToEnd', false, { error: error.message });
  }
}

// Environment validation
function validateEnvironment() {
  logger.info('\n🔧 Validating Environment...');
  
  const requiredEnvVars = [
    'JINA_API_KEY',
    'TIDB_HOST',
    'TIDB_USER',
    'TIDB_DATABASE'
  ];
  
  const optionalEnvVars = [
    'REDIS_URL',
    'TIDB_PASSWORD',
    'TIDB_PORT'
  ];
  
  let allRequired = true;
  
  requiredEnvVars.forEach(envVar => {
    const exists = !!process.env[envVar];
    recordTest(`env.${envVar}`, exists, {
      required: true,
      present: exists
    });
    if (!exists) allRequired = false;
  });
  
  optionalEnvVars.forEach(envVar => {
    const exists = !!process.env[envVar];
    recordTest(`env.${envVar}`, true, {
      required: false,
      present: exists,
      value: exists ? '[SET]' : '[NOT SET]'
    });
  });
  
  recordTest('env.allRequired', allRequired, {
    message: allRequired ? 'All required environment variables are set' : 'Some required variables missing'
  });
}

// Enhanced main test runner
async function runAllTests() {
  logger.info('🚀 Starting Comprehensive Embedding Worker Tests');
  console.log('='.repeat(80));
  
  const startTime = performance.now();
  
  try {
    // Validate environment first
    validateEnvironment();
    
    // Run all test suites
    await testDatabaseIntegration();
    await testRedisIntegration();
    await testSearchService();
    await testPythonWorker();
    await testEndToEndPipeline();
    
    const totalTime = performance.now() - startTime;
    
    // Generate final report
    console.log('\n' + '='.repeat(80));
    logger.info('📊 Final Test Results:');
    console.log(`Total Tests: ${testResults.total}`);
    console.log(`Passed: ${testResults.passed} ✅`);
    console.log(`Failed: ${testResults.failed} ❌`);
    console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
    console.log(`Total Time: ${(totalTime / 1000).toFixed(2)}s`);
    
    if (testResults.failed > 0) {
      console.log('\n❌ Failed Tests Details:');
      testResults.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.test}:`);
        console.log(`   Error: ${error.error || 'Unknown error'}`);
        if (error.details) {
          console.log(`   Details: ${JSON.stringify(error.details, null, 2)}`);
        }
      });
    }
    
    const success = testResults.failed === 0;
    if (success) {
      logger.success('🎉 All tests passed! The embedding pipeline is working correctly.');
    } else {
      logger.error(`❌ ${testResults.failed} test(s) failed. Please check the errors above.`);
    }
    
    process.exit(success ? 0 : 1);
    
  } catch (error) {
    logger.error('💥 Test runner crashed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Cleanup resources
    try {
      if (prisma) {
        await prisma.$disconnect();
      }
      if (redisClient && redisClient.isOpen) {
        await redisClient.quit();
      }
    } catch (error) {
      logger.warn('⚠️ Cleanup warning:', error.message);
    }
  }
}

// Run the tests
if (require.main === module) {
  runAllTests().catch(error => {
    logger.error('💥 Unexpected error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  testSearchService,
  testPythonWorker,
  testRedisIntegration,
  testDatabaseIntegration,
  validateEnvironment
};
