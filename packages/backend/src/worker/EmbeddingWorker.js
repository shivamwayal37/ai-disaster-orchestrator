const { PrismaClient } = require('@prisma/client');
const redis = require('redis');
const axios = require('axios');
const logger = require('../utils/logger').child({ module: 'embedding-worker' });
require('dotenv').config();

class EmbeddingWorker {
    constructor(options = {}) {
        this.redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
        this.queueName = options.queueName || 'embedding-queue';
        this.batchSize = parseInt(process.env.EMBEDDING_BATCH_SIZE || '10');
        this.redisClient = null;
        this.prisma = new PrismaClient();
        
        // Set logger context
        this.logger = logger;
        
        // Validate environment
        this.jinaApiKey = process.env.JINA_API_KEY;
        this.validateEnvironment();
    }

    /**
     * Validate required environment variables
     */
    validateEnvironment() {
        const required = ['JINA_API_KEY', 'DATABASE_URL'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
    }

    /**
     * Jina Embedding Service function with retries, caching, and batching support
     */
    async getEmbedding(input, { maxRetries = 3, timeout = 30000 } = {}) {
        const MAX_INPUT_LENGTH = 8000;  // Increased from 512 to 8000 for better context
        const isBatch = Array.isArray(input);
        
        // Validate input
        if (!input || (isBatch && input.length === 0)) {
            throw new Error('Input cannot be empty');
        }
        
        // Handle both single string and array of strings
        const truncatedInput = isBatch
            ? input.map(txt => String(txt).slice(0, MAX_INPUT_LENGTH))
            : String(input).slice(0, MAX_INPUT_LENGTH);

        // Create appropriate cache key with hash to avoid long keys
        const inputHash = require('crypto')
            .createHash('md5')
            .update(JSON.stringify(truncatedInput))
            .digest('hex');
        
        const cacheKey = `embed:${isBatch ? 'batch:' : ''}${inputHash}`;
        
        // Try to get from cache if Redis is available
        if (this.redisClient?.isOpen) {
            try {
                const cached = await this.redisClient.get(cacheKey);
                if (cached) {
                    this.logger.debug({ cacheKey, isBatch }, 'Embedding cache hit');
                    return JSON.parse(cached);
                }
            } catch (err) {
                this.logger.warn({ error: err.message }, 'Cache read failed, proceeding without cache');
            }
        }

        this.logger.debug({ isBatch, inputLength: isBatch ? input.length : input?.length }, 'Generating new embedding');
        
        const payload = {
            model: "jina-embeddings-v3",
            task: "text-matching",
            dimensions: 1024,
            input: isBatch ? truncatedInput : [truncatedInput]
        };

        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            try {
                const response = await fetch("https://api.jina.ai/v1/embeddings", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${this.jinaApiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    const errorBody = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorBody}`);
                }
                
                const data = await response.json();
                
                if (!data.data || !Array.isArray(data.data)) {
                    throw new Error('Invalid response format from embedding service');
                }
                
                const embeddings = data.data.map(d => d.embedding);
                const result = isBatch ? embeddings : embeddings[0];
                
                // Cache the result if Redis is available
                if (this.redisClient?.isOpen) {
                    try {
                        await this.redisClient.set(cacheKey, JSON.stringify(result), { 
                            EX: 3600 // Cache for 1 hour
                        });
                    } catch (cacheErr) {
                        this.logger.warn({ error: cacheErr.message }, 'Failed to cache embedding');
                    }
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                const isLastAttempt = attempt === maxRetries;
                
                if (error.name === 'AbortError') {
                    this.logger.warn(`Attempt ${attempt}/${maxRetries}: Request timed out after ${timeout}ms`);
                } else {
                    this.logger.warn(`Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
                }
                
                if (isLastAttempt) {
                    this.logger.error({
                        error: error.message,
                        stack: error.stack,
                        input: isBatch ? '[batch]' : truncatedInput.substring(0, 100) + (truncatedInput.length > 100 ? '...' : '')
                    }, 'All embedding generation attempts failed');
                    throw new Error(`Failed to generate embedding after ${maxRetries} attempts: ${error.message}`);
                }
                
                // Exponential backoff with jitter
                const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                const jitter = Math.random() * 1000;
                await this.sleep(baseDelay + jitter);
            } finally {
                clearTimeout(timeoutId);
            }
        }
        
        // This should theoretically never be reached due to the throw in the loop
        throw lastError || new Error('Unexpected error in getEmbedding');
    }

    /**
     * Database Service functions
     */
    async updateDocumentEmbedding(documentId, embedding) {
        try {
            this.logger.info({ 
                documentId, 
                embeddingLength: embedding.length 
            }, 'Updating document embedding');

            // Convert embedding array to TiDB VECTOR format
            const vectorString = `[${embedding.join(',')}]`;
            
            // Use Prisma's raw query to handle VECTOR type properly
            const result = await this.prisma.$executeRaw`
                UPDATE documents 
                SET embedding = CAST(${vectorString} AS VECTOR(1024)),
                    updated_at = ${new Date()}
                WHERE id = ${documentId}
            `;

            this.logger.info({ 
                documentId, 
                updated: result 
            }, 'Successfully updated document embedding');

            return result > 0;
        } catch (error) {
            this.logger.error({ error, documentId }, 'Error updating document embedding');
            return false;
        }
    }

    async updateAlertEmbedding(documentId, embedding) {
        return this.updateDocumentEmbedding(documentId, embedding);
    }

    /**
     * Redis connection and queue processing functions
     */
    async connectRedis(maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.logger.info({ redisUrl: this.redisUrl }, 'Connecting to Redis');
                
                this.redisClient = redis.createClient({
                    url: this.redisUrl,
                    retry_strategy: (options) => {
                        if (options.error && options.error.code === 'ECONNREFUSED') {
                            return new Error('Redis server connection refused');
                        }
                        if (options.total_retry_time > 1000 * 60 * 60) {
                            return new Error('Redis retry time exhausted');
                        }
                        if (options.attempt > 10) {
                            return undefined;
                        }
                        return Math.min(options.attempt * 100, 3000);
                    }
                });

                this.redisClient.on('error', (error) => {
                    this.logger.error({ error }, 'Redis client error');
                });

                this.redisClient.on('connect', () => {
                    this.logger.info('Redis connection established');
                });

                this.redisClient.on('ready', () => {
                    this.logger.info('Redis client ready');
                });

                await this.redisClient.connect();
                await this.redisClient.ping();
                
                return;

            } catch (error) {
                this.logger.warn({ attempt, maxRetries, error }, 'Redis connection attempt failed');
                
                if (attempt < maxRetries) {
                    await this.sleep(5000);
                } else {
                    throw new Error(`Failed to connect to Redis after ${maxRetries} attempts`);
                }
            }
        }
    }

    async processJob(jobData) {
        const documentId = jobData?.id;  // This should be document ID, not alert ID
        const content = jobData?.content;

        if (!documentId || !content) {
            this.logger.error({ jobData }, 'Invalid job format');
            return false;
        }

        try {
            this.logger.info({ documentId, contentLength: content.length }, 'Processing embedding job');

            const embedding = await this.getEmbedding(content);
            
            if (!embedding || !Array.isArray(embedding) || embedding.length !== 1024) {
                this.logger.error({ documentId }, 'Failed to generate a valid embedding');
                return false;
            }

            const success = await this.updateDocumentEmbedding(documentId, embedding);
            
            if (success) {
                this.logger.info({ documentId }, 'Successfully stored embedding');
            } else {
                this.logger.error({ documentId }, 'Failed to store embedding in database');
            }
            
            return success;

        } catch (error) {
            this.logger.error({ error, documentId }, 'Failed to store embedding');
            return false;
        }
    }

    async run() {
        try {
            await this.connectRedis();
            
            this.logger.info({ queueName: this.queueName, batchSize: this.batchSize }, 'Worker started');

            while (true) {
                try {
                    // Blocking pop from the right of the list (5 second timeout)
                    const result = await this.redisClient.brPop(this.queueName, 5);

                    if (!result) {
                        continue; // Timeout, continue listening
                    }

                    const jobStr = result.element;
                    
                    try {
                        const job = JSON.parse(jobStr);
                        await this.processJob(job);
                    } catch (parseError) {
                        this.logger.error({ jobStr }, 'Invalid JSON received from queue');
                    }

                } catch (error) {
                    if (error?.message?.includes('cancelled') || error?.name === 'AbortError') {
                        this.logger.info('Worker shutdown requested');
                        break;
                    }
                    
                    this.logger.error({
                        message: error?.message || 'Unknown error',
                        name: error?.name || 'Error',
                        stack: error?.stack,
                        code: error?.code,
                        statusCode: error?.statusCode,
                        details: error?.details || {}
                    }, 'Error in worker loop');
                    
                    await this.sleep(5000); // Prevent rapid-fire errors
                }
            }

        } catch (error) {
            this.logger.fatal({ error }, 'Fatal error in worker');
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    async cleanup() {
        this.logger.info('Cleaning up resources');
        
        try {
            if (this.redisClient && this.redisClient.isOpen) {
                await this.redisClient.quit();
                this.logger.debug('Redis connection closed');
            }
        } catch (error) {
            this.logger.error({ error }, 'Error closing Redis connection');
        }

        try {
            if (this.prisma) {
                await this.prisma.$disconnect();
                this.logger.debug('Prisma connection closed');
            }
        } catch (error) {
            this.logger.error({ error }, 'Error closing Prisma connection');
        }

        this.logger.info('Worker shutdown complete');
    }

    /**
     * Utility functions
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    setLogLevel(level) {
        this.logger.level = level.toLowerCase();
    }
}

/**
 * Main entry point
 */
async function main() {
    const logger = require('../utils/logger');
    
    // Handle graceful shutdown
    let worker = null;
    
    const shutdown = async (signal) => {
        logger.info({ signal }, 'Shutdown signal received');
        
        if (worker) {
            await worker.cleanup();
        }
        
        process.exit(0);
    };
    
    // Register shutdown handlers
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    try {
        // Parse command line arguments
        const args = process.argv.slice(2);
        const options = {};
        
        // Parse options from command line
        for (let i = 0; i < args.length; i += 2) {
            const key = args[i]?.replace('--', '');
            const value = args[i + 1];
            
            if (key && value) {
                options[key] = value;
            }
        }
        
        logger.info({ options }, 'Starting Embedding Worker');
        
        // Create and start worker
        worker = new EmbeddingWorker(options);
        await worker.run();
        
    } catch (error) {
        logger.fatal({ error: error.message, stack: error.stack }, 'Fatal error in embedding worker');
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

// Export for use as module or run directly
module.exports = EmbeddingWorker;

// if (require.main === module) {
//     main().catch(error => {
//         const logger = require('../utils/logger');
//         logger.fatal({ error }, 'Fatal error in main');
//         process.exit(1);
//     });
// }