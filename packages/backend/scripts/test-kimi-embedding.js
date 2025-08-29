/**
 * Test script to verify Kimi embedding integration
 * Run with: node scripts/test-kimi-embedding.js
 */

require('dotenv').config();
const { generateEmbeddings } = require('../src/services/kimiClient');
const pino = require('pino');

const logger = pino({ name: 'test-kimi-embedding' });

async function testEmbedding() {
  try {
    const testTexts = [
      'Earthquake reported in downtown area',
      'Flood warning issued for coastal regions',
      'Wildfire spreading rapidly in the national park'
    ];

    logger.info('Generating embeddings for test texts...');
    const embeddings = await generateEmbeddings(testTexts);
    
    logger.info('Embeddings generated successfully!');
    logger.info(`Number of embeddings: ${embeddings.length}`);
    logger.info(`Dimensions per embedding: ${embeddings[0]?.length || 0}`);
    
    // Log first few dimensions of first embedding
    if (embeddings.length > 0) {
      logger.info('First embedding sample (first 5 dimensions):');
      logger.info(embeddings[0].slice(0, 5).map(n => n.toFixed(6)).join(', '));
    }
    
    return { success: true, dimensions: embeddings[0]?.length || 0 };
  } catch (error) {
    logger.error({ error }, 'Error testing Kimi embeddings');
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testEmbedding()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testEmbedding };
