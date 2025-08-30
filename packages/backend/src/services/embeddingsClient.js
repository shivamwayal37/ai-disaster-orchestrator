/**
 * Jina Embeddings Client
 * Handles text embedding generation using Jina Embeddings API
 */

const fetch = require('node-fetch');

// Simple console logger
const logger = {
  info: (message, ...args) => console.log(`[Jina] ${message}`, ...args),
  error: (message, error) => console.error(`[Jina] ${message}`, error),
  debug: (message, ...args) => console.log(`[Jina][DEBUG] ${message}`, ...args),
  warn: (message, ...args) => console.warn(`[Jina][WARN] ${message}`, ...args)
};

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

class JinaEmbeddingsClient {
  constructor(apiKey = process.env.JINA_API_KEY, model = 'jina-embeddings-v3') {
    if (!apiKey) {
      throw new Error('Jina API key is required');
    }
    
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = 'https://api.jina.ai/v1';
    this.dimensions = MODEL_DIMENSIONS[model] || 1024; // Default to v3 dimensions
    
    if (!this.apiKey) {
      logger.error('No Jina API key provided. Embedding generation will fail.');
    }
  }

  /**
   * Generate embeddings for input text(s)
   * @param {string|string[]} input - Single text string or array of text strings
   * @returns {Promise<number[]|number[][]>} Single embedding vector or array of vectors
   */
  async generateEmbeddings(input) {
    const isSingle = !Array.isArray(input);
    const texts = isSingle ? [input] : input;
    const maxRetries = 3;
    const initialDelay = 1000; // 1 second initial delay
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseURL}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            input: texts,
          }),
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Jina API error: ${response.status} - ${errorData}`);
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

        // Log successful generation
        logger.debug({
          attempt,
          textsCount: texts.length,
          model: this.model,
          dimensions: this.dimensions
        }, 'Successfully generated embeddings');
        
        return isSingle ? embeddings[0] : embeddings;

      } catch (error) {
        logger.error(`[JinaEmbedding] Error generating embedding (attempt ${attempt}/${maxRetries}): ${error.message}`, { 
          stack: error.stack,
          attempt,
          maxRetries
        });
        
        if (attempt === maxRetries) {
          throw error; // Re-throw on last attempt
        }
        
        // Exponential backoff with jitter
        const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), 10000); // Max 10s delay
        const jitter = Math.random() * 1000; // Add up to 1s jitter
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
      }
    }
    
    // This should theoretically never be reached due to the throw in the catch block
    throw new Error('Failed to generate embeddings after maximum retries');  
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

// For testing
function _resetClient() {
  embeddingsClient = null;
}

module.exports = {
  JinaEmbeddingsClient,
  getEmbeddingsClient,
  _resetClient
};
