const { spawn } = require('child_process');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();
const PYTHON_SCRIPT = path.join(__dirname, '../../workers/embedding_worker.py');

class EmbeddingService {
  constructor() {
    this.logger = logger.child({ service: 'EmbeddingService' });
    this.isProcessing = false;
  }

  /**
   * Generate vector embedding for text using Python worker
   */
  async generateVectorEmbedding(text, model = 'jina-embeddings-v2-base-en') {
    if (!text || typeof text !== 'string') {
      throw new Error('Text must be a non-empty string');
    }

    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [PYTHON_SCRIPT, '--text', text, '--model', model]);
      
      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          const error = new Error(`Embedding generation failed with code ${code}: ${stderr}`);
          this.logger.error({ error: error.message, stderr });
          return reject(error);
        }

        try {
          const result = JSON.parse(stdout);
          if (!result.embedding || !Array.isArray(result.embedding)) {
            throw new Error('Invalid embedding format');
          }
          resolve(result.embedding);
        } catch (error) {
          this.logger.error({ error: error.message, stdout, stderr }, 'Failed to parse embedding result');
          reject(new Error('Failed to parse embedding result'));
        }
      });

      pythonProcess.on('error', (error) => {
        this.logger.error({ error }, 'Failed to spawn Python process');
        reject(new Error('Failed to start embedding service'));
      });
    });
  }

  /**
   * Batch generate embeddings for multiple texts
   */
  async batchGenerateEmbeddings(texts, model = 'jina-embeddings-v2-base-en') {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Texts must be a non-empty array');
    }

    // Process in batches to avoid overloading the embedding service
    const BATCH_SIZE = 10;
    const results = [];
    
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(text => 
          this.generateVectorEmbedding(text, model)
            .catch(error => ({
              text,
              error: error.message,
              embedding: null
            }))
        )
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Update document embeddings in the database
   */
  async updateDocumentEmbeddings(documentIds) {
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      throw new Error('Document IDs must be a non-empty array');
    }

    // Get documents that need embeddings
    const documents = await prisma.document.findMany({
      where: {
        id: { in: documentIds },
        OR: [
          { embedding: null },
          { embeddingUpdatedAt: null },
          { embeddingUpdatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } // Older than 7 days
        ]
      },
      select: {
        id: true,
        content: true,
        type: true
      }
    });

    if (documents.length === 0) {
      this.logger.info('No documents need embedding updates');
      return { updated: 0, skipped: documentIds.length };
    }

    // Generate embeddings
    const texts = documents.map(doc => doc.content);
    const embeddings = await this.batchGenerateEmbeddings(texts);

    // Update documents with new embeddings
    const updates = [];
    let updatedCount = 0;

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const embedding = embeddings[i];

      if (embedding && !embedding.error) {
        updates.push(
          prisma.document.update({
            where: { id: doc.id },
            data: {
              embedding: embedding,
              embeddingModel: 'jina-embeddings-v2-base-en',
              embeddingUpdatedAt: new Date()
            }
          })
        );
        updatedCount++;
      } else {
        this.logger.warn({ documentId: doc.id, error: embedding?.error }, 'Failed to generate embedding');
      }
    }

    // Execute all updates in a transaction
    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    return {
      total: documentIds.length,
      processed: documents.length,
      updated: updatedCount,
      failed: documents.length - updatedCount,
      skipped: documentIds.length - documents.length
    };
  }

  /**
   * Search documents using vector similarity
   */
  async vectorSearch(query, options = {}) {
    const {
      limit = 10,
      minScore = 0.7,
      filters = {},
      includeMetadata = true
    } = options;

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateVectorEmbedding(query);
      
      // Build where clause for filters
      const whereClause = this.buildWhereClause(filters);
      
      // Execute vector search using raw query for cosine similarity
      const results = await prisma.$queryRaw`
        SELECT 
          id,
          type,
          content,
          metadata,
          1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
        FROM "Document"
        WHERE 
          embedding IS NOT NULL
          AND (1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector)) >= ${minScore}
          AND ${whereClause}
        ORDER BY similarity DESC
        LIMIT ${limit}
      `;

      // Format results
      return results.map(result => ({
        id: result.id,
        type: result.type,
        score: parseFloat(result.similarity),
        content: includeMetadata ? result.content : undefined,
        metadata: includeMetadata ? result.metadata : undefined
      }));
      
    } catch (error) {
      this.logger.error({ error, query }, 'Vector search failed');
      throw new Error(`Vector search failed: ${error.message}`);
    }
  }

  /**
   * Hybrid search combining vector and full-text search
   */
  async hybridSearch(query, options = {}) {
    const {
      limit = 10,
      vectorWeight = 0.7,
      fullTextWeight = 0.3,
      minScore = 0.5,
      filters = {}
    } = options;

    try {
      // Run vector and full-text searches in parallel
      const [vectorResults, fullTextResults] = await Promise.all([
        this.vectorSearch(query, { ...options, includeMetadata: false }),
        this.fullTextSearch(query, { ...options, includeMetadata: false })
      ]);

      // Combine and score results
      const scoredResults = new Map();
      
      // Add vector results
      vectorResults.forEach(result => {
        scoredResults.set(result.id, {
          ...result,
          vectorScore: result.score,
          fullTextScore: 0,
          combinedScore: result.score * vectorWeight
        });
      });

      // Add or update with full-text results
      fullTextResults.forEach(result => {
        const existing = scoredResults.get(result.id) || {
          ...result,
          vectorScore: 0,
          fullTextScore: 0,
          combinedScore: 0
        };
        
        existing.fullTextScore = result.score;
        existing.combinedScore = 
          (existing.vectorScore * vectorWeight) + 
          (result.score * fullTextWeight);
          
        scoredResults.set(result.id, existing);
      });

      // Convert to array, filter by min score, and sort
      const results = Array.from(scoredResults.values())
        .filter(result => result.combinedScore >= minScore)
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, limit);

      // Get full document details for top results
      if (results.length > 0) {
        const documentIds = results.map(r => r.id);
        const documents = await prisma.document.findMany({
          where: { id: { in: documentIds } }
        });

        // Map details back to results
        const documentMap = new Map(documents.map(doc => [doc.id, doc]));
        
        return results.map(result => {
          const doc = documentMap.get(result.id) || {};
          return {
            ...result,
            type: doc.type,
            content: doc.content,
            metadata: doc.metadata
          };
        });
      }

      return [];
      
    } catch (error) {
      this.logger.error({ error, query }, 'Hybrid search failed');
      throw new Error(`Hybrid search failed: ${error.message}`);
    }
  }

  /**
   * Full-text search using database full-text capabilities
   */
  async fullTextSearch(query, options = {}) {
    const {
      limit = 10,
      filters = {},
      includeMetadata = true
    } = options;

    try {
      // Build where clause with full-text search
      const whereClause = this.buildWhereClause(filters);
      
      // Execute full-text search
      const results = await prisma.document.findMany({
        where: {
          ...whereClause,
          OR: [
            { content: { search: query } },
            { title: { search: query } },
            { content: { contains: query, mode: 'insensitive' } },
            { title: { contains: query, mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          type: true,
          content: includeMetadata,
          metadata: includeMetadata,
          _relevance: {
            fields: ['content', 'title'],
            search: query,
            sort: 'desc'
          }
        },
        orderBy: {
          _relevance: 'desc'
        },
        take: limit
      });

      // Format results with normalized scores
      const maxScore = results[0]?._relevance?.score || 1;
      
      return results.map(result => ({
        id: result.id,
        type: result.type,
        score: result._relevance ? result._relevance.score / maxScore : 0,
        content: includeMetadata ? result.content : undefined,
        metadata: includeMetadata ? result.metadata : undefined
      }));
      
    } catch (error) {
      this.logger.error({ error, query }, 'Full-text search failed');
      throw new Error(`Full-text search failed: ${error.message}`);
    }
  }

  /**
   * Helper: Build WHERE clause from filters
   */
  buildWhereClause(filters = {}) {
    const where = {};
    
    if (filters.type) {
      where.type = { in: Array.isArray(filters.type) ? filters.type : [filters.type] };
    }
    
    if (filters.status) {
      where.status = { in: Array.isArray(filters.status) ? filters.status : [filters.status] };
    }
    
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }
    
    return where;
  }
}

// Export singleton instance
const embeddingService = new EmbeddingService();
module.exports = {
  embeddingService,
  generateVectorEmbedding: embeddingService.generateVectorEmbedding.bind(embeddingService),
  batchGenerateEmbeddings: embeddingService.batchGenerateEmbeddings.bind(embeddingService),
  updateDocumentEmbeddings: embeddingService.updateDocumentEmbeddings.bind(embeddingService),
  vectorSearch: embeddingService.vectorSearch.bind(embeddingService),
  hybridSearch: embeddingService.hybridSearch.bind(embeddingService),
  fullTextSearch: embeddingService.fullTextSearch.bind(embeddingService)
};
