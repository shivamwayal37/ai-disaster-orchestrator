/**
 * Vector Store Service
 * Handles vector operations with TiDB
 */

const { PrismaClient } = require('@prisma/client');
const pino = require('pino');
const { embeddingService } = require('./embeddingService');

const logger = pino({ name: 'vector-store' });

class VectorStore {
  constructor() {
    this.prisma = new PrismaClient();
    this.embeddingService = embeddingService;
    this.dimensions = 768; // Jina embeddings v2 base dimension
  }

  /**
   * Generate and store embeddings for a document
   * @param {Object} document - Document to embed
   * @param {string} model - Model name (e.g., 'documents', 'alerts', 'resources')
   * @returns {Promise<Object>} Updated document with embedding
   */
  async embedAndStore(document, model = 'documents') {
    try {
      // Generate text for embedding based on model type
      let textToEmbed;
      switch (model) {
        case 'documents':
          textToEmbed = `${document.title}\n${document.content}`.substring(0, 5000);
          break;
        case 'alerts':
          textToEmbed = `${document.title}\n${document.description}`.substring(0, 5000);
          break;
        case 'resources':
          textToEmbed = [
            document.name,
            document.description,
            document.address,
            document.city,
            document.state
          ].filter(Boolean).join('\n').substring(0, 5000);
          break;
        default:
          throw new Error(`Unsupported model type: ${model}`);
      }

      // Generate embedding
      const embedding = await this.embeddingService.generateVectorEmbedding(textToEmbed);
      
      // Update document with embedding
      const updateData = { embedding };
      let updatedDoc;
      
      switch (model) {
        case 'documents':
          updatedDoc = await this.prisma.document.update({
            where: { id: document.id },
            data: updateData
          });
          break;
        case 'alerts':
          updatedDoc = await this.prisma.alert.update({
            where: { id: document.id },
            data: updateData
          });
          break;
        case 'resources':
          updatedDoc = await this.prisma.resource.update({
            where: { id: document.id },
            data: updateData
          });
          break;
      }

      logger.debug({ model, id: document.id }, 'Stored embedding for document');
      return updatedDoc;
      
    } catch (error) {
      logger.error({ 
        error: error.message,
        model,
        documentId: document?.id 
      }, 'Failed to generate and store embedding');
      throw error;
    }
  }

  /**
   * Find similar documents using hybrid search (vector + fulltext)
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Array of matching documents
   */
  async hybridSearch(query, options = {}) {
    const {
      model = 'documents',
      limit = 5,
      threshold = 0.7,
      includeVectors = false
    } = options;

    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingService.generateVectorEmbedding(query);
      
      // Build the raw SQL query for hybrid search
      let sqlQuery;
      // Parameters in order: [queryEmbedding, query, queryEmbedding, threshold, limit]
      const params = [queryEmbedding, query, queryEmbedding, threshold, limit];
      
      switch (model) {
        case 'documents':
          sqlQuery = `
            SELECT 
              id, 
              title,
              content,
              source,
              category,
              publishedAt as "publishedAt",
              
              -- Calculate hybrid relevance score (0.7 * vector_similarity + 0.3 * fulltext_relevance)
              -- Note: (1 - COSINE_DISTANCE) converts distance to similarity (0-1, higher is better)
              (
                0.7 * (1 - COSINE_DISTANCE(embedding, CAST(? AS VECTOR(768)))) +
                0.3 * (MATCH(title, content) AGAINST (?) IN NATURAL LANGUAGE MODE)
              ) as relevance
              
            FROM documents
            WHERE 
              -- Vector similarity threshold
              COSINE_DISTANCE(embedding, CAST(? AS VECTOR(768))) < ?
              
              -- Optional: Add additional filters from options
              ${options.filters || ''}
              
            ORDER BY relevance DESC
            LIMIT ?
          `;
          break;
          
        case 'alerts':
          sqlQuery = `
            SELECT 
              id,
              title,
              description,
              source,
              alertType as "alertType",
              startTime as "startTime",
              
              -- Calculate hybrid relevance score
              (
                0.7 * (1 - COSINE_DISTANCE(embedding, CAST(? AS VECTOR(768)))) +
                0.3 * (MATCH(title, description) AGAINST (?) IN NATURAL LANGUAGE MODE)
              ) as relevance
              
            FROM alerts
            WHERE 
              COSINE_DISTANCE(embedding, CAST(? AS VECTOR(768))) < ?
              ${options.filters || ''}
            ORDER BY relevance DESC
            LIMIT ?
          `;
          break;
          
        case 'resources':
          sqlQuery = `
            SELECT 
              id,
              name,
              type,
              address,
              city,
              state,
              isEmergency as "isEmergency",
              
              -- Calculate hybrid relevance score with emergency boost
              (
                0.7 * (1 - COSINE_DISTANCE(embedding, CAST(? AS VECTOR(768)))) +
                0.3 * (MATCH(name, description, address, city, state) AGAINST (?) IN NATURAL LANGUAGE MODE)
              ) as relevance
              
            FROM resources
            WHERE 
              isActive = true
              AND COSINE_DISTANCE(embedding, CAST(? AS VECTOR(768))) < ?
              ${options.filters || ''}
            ORDER BY 
              -- Boost emergency resources
              isEmergency DESC,
              relevance DESC
            LIMIT ?
          `;
          break;
          
        default:
          throw new Error(`Unsupported model type: ${model}`);
      }

      // Execute the query with error handling
      let results;
      try {
        logger.debug({ model, query: query.substring(0, 100) }, 'Executing hybrid search');
        results = await this.prisma.$queryRawUnsafe(sqlQuery, ...params);
        
        // Remove vector data if not requested
        if (!includeVectors) {
          results.forEach(doc => delete doc.embedding);
        }
        
        logger.debug({ 
          model, 
          resultCount: results.length,
          queryLength: query.length,
          embeddingDimensions: queryEmbedding.length 
        }, 'Hybrid search completed');
        
        return results;
      } catch (error) {
        logger.error({
          error: error.message,
          sql: sqlQuery,
          params: params.map(p => Array.isArray(p) ? '[Vector]' : p),
          model,
          queryLength: query.length
        }, 'Error executing hybrid search');
        throw new Error(`Search failed: ${error.message}`);
      }
      
    } catch (error) {
      logger.error({
        error: error.message,
        query,
        options
      }, 'Hybrid search failed');
      throw error;
    }
  }
  
  /**
   * Find similar items by vector similarity
   * @param {number[]} vector - Query vector
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Similar items
   */
  async findSimilar(vector, options = {}) {
    const {
      model = 'documents',
      limit = 5,
      threshold = 0.7,
      filters = ''
    } = options;
    
    try {
      const tableMap = {
        documents: 'documents',
        alerts: 'alerts',
        resources: 'resources'
      };
      
      const table = tableMap[model];
      if (!table) {
        throw new Error(`Unsupported model: ${model}`);
      }
      
      const sqlQuery = `
        SELECT 
          id,
          ${model === 'documents' ? 'title, content' : ''}
          ${model === 'alerts' ? 'title, description' : ''}
          ${model === 'resources' ? 'name, type, address' : ''}
        FROM ${table}
        WHERE 
          embedding <=> ?::vector < ?
          ${filters}
        ORDER BY embedding <=> ?::vector
        LIMIT ?
      `;
      
      return await this.prisma.$queryRawUnsafe(sqlQuery, vector, threshold, vector, limit);
      
    } catch (error) {
      logger.error({
        error: error.message,
        model,
        vectorLength: vector?.length
      }, 'Vector similarity search failed');
      throw error;
    }
  }
  
  /**
   * Close the Prisma client connection
   */
  async disconnect() {
    await this.prisma.$disconnect();
  }
}

// Create and export a singleton instance
let vectorStore = null;

function getVectorStore() {
  if (!vectorStore) {
    vectorStore = new VectorStore();
  }
  return vectorStore;
}

module.exports = {
  VectorStore,
  getVectorStore,
  // For testing
  _resetStore: () => { vectorStore = null; }
};
