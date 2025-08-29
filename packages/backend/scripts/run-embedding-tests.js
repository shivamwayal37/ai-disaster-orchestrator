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
    // Ensure pino-pretty is installed
    try {
      require.resolve('pino-pretty');
    } catch (e) {
      logger.info('Installing pino-pretty...');
      execSync('npm install --save-dev pino-pretty', {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
    }

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
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  logger.error('Unexpected error:', error);
  process.exit(1);
});
