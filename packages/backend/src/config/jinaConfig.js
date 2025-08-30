/**
 * Jina Embeddings Configuration
 * Manages environment variables and default settings for Jina Embeddings v3
 */

require('dotenv').config();

const JINA_CONFIG = {
  // API Configuration
  API_KEY: process.env.JINA_API_KEY,
  BASE_URL: process.env.JINA_API_URL || 'https://api.jina.ai/v1',
  
  // Model Configuration
  MODEL: 'jina-embeddings-v3',
  DIMENSIONS: parseInt(process.env.JINA_EMBEDDING_DIMENSIONS || '1024'),
  
  // Request Configuration
  TIMEOUT: parseInt(process.env.JINA_TIMEOUT_MS || '30000'),
  MAX_RETRIES: parseInt(process.env.JINA_MAX_RETRIES || '3'),
  RETRY_DELAY: parseInt(process.env.JINA_RETRY_DELAY_MS || '1000'),
  
  // Batch Processing
  BATCH_SIZE: parseInt(process.env.JINA_BATCH_SIZE || '10'),
  CONCURRENCY: parseInt(process.env.JINA_CONCURRENCY || '5'),
  
  // Rate Limiting (requests per minute)
  RATE_LIMIT: parseInt(process.env.JINA_RATE_LIMIT || '60')
};

// Validate required configuration
if (!JINA_CONFIG.API_KEY) {
  console.warn('JINA_API_KEY is not set. Embedding generation will fail.');
}

module.exports = JINA_CONFIG;
