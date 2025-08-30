const { JinaEmbeddingsClient } = require('./embeddingsClient');

// Simple logger replacement
const logger = {
  error: (message, error) => {
    console.error(`[JinaEmbedding] ${message}`, error);
  },
  info: (message) => {
    console.log(`[JinaEmbedding] ${message}`);
  }
};

class JinaEmbeddingService {
  constructor() {
    this.client = new JinaEmbeddingsClient(
      process.env.JINA_API_KEY,
      'jina-embeddings-v3',
      1024 // dimensions
    );
  }

  /**
   * Generate embeddings for a single text
   * @param {string} text - The text to generate embeddings for
   * @returns {Promise<number[]>} The embedding vector
   */
  async generateEmbedding(text) {
    try {
      const embedding = await this.client.generateEmbeddings(text);
      return embedding;
    } catch (error) {
      logger.error('Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * @param {string[]} texts - Array of texts to generate embeddings for
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async generateBatchEmbeddings(texts) {
    try {
      const embeddings = await this.client.generateEmbeddings(texts);
      return embeddings;
    } catch (error) {
      logger.error('Error generating batch embeddings:', error);
      throw error;
    }
  }

  /**
   * Get the dimensions of the embeddings
   * @returns {number} The number of dimensions in the embedding vector
   */
  getDimensions() {
    return this.client.getDimensions();
  }
}

// Export a singleton instance
module.exports = new JinaEmbeddingService();
