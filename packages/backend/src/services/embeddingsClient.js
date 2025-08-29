/**
 * Jina Embeddings Client
 * Handles text embedding generation using Jina Embeddings API
 */

const pino = require('pino');
const fetch = require('node-fetch');

const logger = pino({ name: 'jina-embeddings' });

class JinaEmbeddingsClient {
  constructor(apiKey = process.env.JINA_API_KEY, model = 'jina-embeddings-v2-base-en') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = 'https://api.jina.ai/v1';
    this.dimensions = 768; // Default for base model
    
    if (!this.apiKey) {
      logger.warn('No Jina API key provided. Embedding generation will fail.');
    }
  }

  /**
   * Generate embeddings for input texts
   * @param {string[]} texts - Array of text strings to generate embeddings for
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async generateEmbeddings(texts) {
    if (!this.apiKey) {
      throw new Error('Jina API key is required');
    }

    try {
      logger.debug({
        textsCount: texts.length,
        model: this.model,
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
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Jina API error: ${response.status} ${response.statusText} - ${errorBody}`);
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
        textsCount: texts.length,
        model: this.model,
        dimensions: this.dimensions
      }, 'Successfully generated embeddings');
      
      return embeddings;
    } catch (error) {
      logger.error({
        error: error.message,
        stack: error.stack,
        model: this.model,
        textsCount: texts?.length
      }, 'Failed to generate embeddings with Jina API');
      throw error;
    }
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
