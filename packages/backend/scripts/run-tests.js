const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const pino = require('pino');
const logger = pino({ name: 'test-runner' });
const { integrationTester } = require('../src/services/integrationTester');

async function main() {
  logger.info('Starting integration test runner...');
  try {
    const report = await integrationTester.runAllTests();
    logger.info('--- Integration Test Report ---');
    logger.info(JSON.stringify(report, null, 2));
    logger.info('Integration tests completed successfully.');

    if (report.summary.failed > 0) {
      logger.warn('Some tests failed. Exiting with status 1.');
      process.exit(1);
    } else {
      logger.info('All tests passed. Exiting with status 0.');
      process.exit(0);
    }
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'An unexpected error occurred during test execution.');
    process.exit(1);
  }
}

main();
