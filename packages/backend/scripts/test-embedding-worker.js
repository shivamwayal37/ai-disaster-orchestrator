#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.EMBEDDING_WORKER_ENABLED = 'true';
process.env.EMBEDDING_WORKER_BATCH_SIZE = '10';
process.env.EMBEDDING_WORKER_POLL_INTERVAL = '5000';

// Simple console logger for the test runner
const logger = {
  info: (...args) => console.log('ℹ️', ...args),
  error: (...args) => console.error('❌', ...args),
  success: (...args) => console.log('✅', ...args)
};

async function runTests() {
  logger.info('Starting Embedding Worker Tests...');
  console.log('----------------------------------------');

  try {
    // Run Jest tests
    execSync('jest tests/unit/embeddingWorker.test.js --coverage --passWithNoTests', {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        // Ensure colors work in the terminal
        FORCE_COLOR: '1',
        // Disable pino-pretty for test runner
        PINO_PRETTIFY: 'false'
      },
    });

    logger.success('All tests passed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Tests failed');
    if (error.stderr) {
      console.error(error.stderr.toString());
    }
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  logger.error('Unexpected error:', error);
  process.exit(1);
});

try {
  // 1. Test worker initialization
  logger.info('\n🔧 Testing worker initialization...');
  const worker = new EmbeddingWorker(TEST_CONFIG);
  logger.info('✅ Worker initialized successfully');

  // 2. Test document queuing
  logger.info('\n📝 Testing document queuing...');
  const testDocId = `test-doc-${Date.now()}`;
  const testContent = 'This is a test document for integration testing. It contains sample text to generate embeddings.';

  const queueResult = await EmbeddingWorker.queueDocumentForEmbedding(testDocId, testContent);
  logger.info(`✅ Queued document for embedding (Task ID: ${queueResult.taskId})`);

  // 3. Test task processing
  logger.info('\n⚙️ Testing task processing...');
  const processResult = await worker.processPendingTasks();
  logger.info(`✅ Processed ${processResult.processed} tasks (${processResult.errors} errors)`);

  // 4. Verify document was updated with embedding
  const updatedDoc = await prisma.document.findUnique({
    where: { id: testDocId },
    select: { id: true, embedding: true, updatedAt: true }
  });

  if (updatedDoc && updatedDoc.embedding) {
    logger.info(`✅ Document ${testDocId} updated with embedding (${updatedDoc.embedding.length} dimensions)`);
  } else {
    throw new Error('Document embedding not found');
  }

  // 5. Test stats retrieval
  logger.info('\n📊 Testing stats retrieval...');
  const stats = await worker.getStats();
  logger.info('📈 Current worker stats:', {
    status: stats.status,
    tasks: stats.tasks,
    documents: stats.documents,
    recentErrors: stats.recentErrors.length
  });

  logger.info('\n🎉 All tests completed successfully!');
  process.exit(0);

} catch (error) {
  logger.error('❌ Test failed:', error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}

// CLI setup
program
  .name('test-embedding-worker')
  .description('Run integration tests for the embedding worker')
  .action(runTests);

program.parseAsync(process.argv);
