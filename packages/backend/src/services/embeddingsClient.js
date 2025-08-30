/**
 * Jina Embeddings Client
 * Handles text embedding generation using Jina Embeddings API
 */

const pino = require('pino');
const fetch = require('node-fetch');

const logger = pino({ name: 'jina-embeddings' });

// Supported models and their dimensions
const MODEL_DIMENSIONS = {
  'jina-embeddings-v2-base-en': 768,
  'jina-embeddings-v2-base-zh': 768,
  'jina-embeddings-v2-base-de': 768,
  'jina-embeddings-v2-base-es': 768,
  'jina-embeddings-v2-base-code': 768,
  'jina-embeddings-v3': 1536,
  'jina-embeddings-v4': 1024
};

// Default retry configuration
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000,    // 10 seconds
  factor: 2
};

class JinaEmbeddingsClient {
  constructor(apiKey = process.env.JINA_API_KEY, model = 'jina-embeddings-v2-base-en') {
    if (!apiKey) {
      throw new Error('Jina API key is required');
    }
    
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = 'https://api.jina.ai/v1';
    this.dimensions = MODEL_DIMENSIONS[model] || 768;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG };
    
    if (!this.apiKey) {
      logger.warn('No Jina API key provided. Embedding generation will fail.');
    }
  }

  /**
   * Generate embeddings for input text(s)
   * @param {string|string[]} input - Single text string or array of text strings
   * @returns {Promise<number[]|number[][]>} Single embedding vector or array of vectors
   */
  async generateEmbeddings(input) {
    const texts = Array.isArray(input) ? input : [input];
    const isSingle = !Array.isArray(input);
    
    if (!this.apiKey) {
      throw new Error('Jina API key is required');
    }

    let lastError;
    let attempt = 0;
    const { maxRetries, initialDelay, maxDelay, factor } = this.retryConfig;

    while (attempt <= maxRetries) {
      try {
        logger.debug({
          attempt: attempt + 1,
          textsCount: texts.length,
          model: this.model,
          dimensions: this.dimensions,
          endpoint: '/embeddings'
        }, 'Sending request to Jina API for embeddings');
        
        const response = await fetch(`${this.baseURL}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            model: this.model,
            input: texts,
            encoding_format: 'float'
          }),
          timeout: 30000 // 30 second timeout
        });

        if (!response.ok) {
          const errorBody = await response.text();
          const error = new Error(`Jina API error: ${response.status} ${response.statusText} - ${errorBody}`);
          
          // Don't retry on 4xx errors (except 429 - Too Many Requests)
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            throw error;
          }
          throw error; // Will be caught by retry logic
        }

        const data = await response.json();
        
        if (!data.data || !Array.isArray(data.data)) {
          throw new Error('Invalid response format from Jina API');
        }

        // Sort embeddings by input order (Jina API returns them in arbitrary order)
        const embeddings = new Array(texts.length);
        for (const item of data.data) {
          if (item.embedding && item.index !== undefined) {
            embeddings[item.index] = item.embedding;
          }
        }

        // Verify all texts got embeddings
        if (embeddings.some(emb => !emb)) {
          throw new Error('Missing embeddings in Jina API response');
        }

        logger.debug({
          attempt: attempt + 1,
          textsCount: texts.length,
          model: this.model,
          dimensions: this.dimensions
        }, 'Successfully generated embeddings');
        
        return isSingle ? embeddings[0] : embeddings;

      } catch (error) {
        lastError = error;
        attempt++;
        
        if (attempt > maxRetries) break;
        
        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          initialDelay * Math.pow(factor, attempt - 1) * (0.5 + Math.random() * 0.5),
          maxDelay
        );
        
        logger.warn({
          attempt,
          error: error.message,
          retryIn: `${delay}ms`,
          model: this.model,
          status: error.response?.status
        }, 'Embedding generation failed, retrying...');
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we get here, all retries failed
    logger.error({
      error: lastError.message,
      stack: lastError.stack,
      model: this.model,
      textsCount: texts.length,
      attempts: attempt
    }, 'All retry attempts failed for embedding generation');
    
    throw lastError;
  }

  /**
   * Get the embedding dimensions for the current model
   * @returns {number} Number of dimensions in the embedding vector
   */
  getDimensions() {
    return this.dimensions;
  }
}

// Create and export a singleton instance
let embeddingsClient = null;

function getEmbeddingsClient() {
  if (!embeddingsClient) {
    const apiKey = process.env.JINA_API_KEY;
    if (!apiKey) {
      throw new Error('JINA_API_KEY environment variable is required');
    }
    embeddingsClient = new JinaEmbeddingsClient(apiKey);
  }
  return embeddingsClient;
}

module.exports = {
  JinaEmbeddingsClient,
  getEmbeddingsClient,
  // For testing
  _resetClient: () => { embeddingsClient = null; }
};
