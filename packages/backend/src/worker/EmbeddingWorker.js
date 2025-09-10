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
     * Jina Embedding Service functions
     */
    async getEmbedding(text, maxRetries = 3) {
        if (!text || !text.trim()) return null;

        const payload = {
            model: 'jina-embeddings-v3',
            task: 'text-matching',
            dimensions: 1024,
            input: [text.slice(0, 8000)] // Limit input length
        };

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await axios.post(
                    'https://api.jina.ai/v1/embeddings',
                    payload,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.jinaApiKey}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 30000
                    }
                );

                if (response.status === 200 && response.data?.data?.[0]?.embedding) {
                    return response.data.data[0].embedding;
                }
                
                throw new Error(`API returned ${response.status}`);

            } catch (error) {
                const isLastAttempt = attempt === maxRetries;
                
                if (isLastAttempt) {
                    this.logger.error({ error }, `Failed to get embedding after ${maxRetries} attempts`);
                    throw error;
                }

                const waitTime = Math.min(2 ** attempt * 1000, 10000);
                await this.sleep(waitTime);
            }
        }
    }

    /**
     * Database Service functions
     */
    async updateDocumentEmbedding(documentId, embedding) {
        try {
            // Convert embedding to JSON string for TiDB VECTOR type
            const embeddingJson = JSON.stringify(embedding);
            
            const updated = await this.prisma.document.update({
                where: { id: documentId },
                data: { 
                    embedding: embeddingJson,
                    updatedAt: new Date()
                }
            });

            return !!updated;
        } catch (error) {
            this.logger.error({ error, documentId }, 'Error updating document');
            return false;
        }
    }

    async updateAlertEmbedding(alertId, embedding) {
        if (!this.prisma) {
            throw new Error('Prisma client not initialized');
        }

        let connection = null;
        try {
            connection = await this.dbPool.getConnection();
            
            const query = `
                UPDATE documents 
                SET embedding = ?, updated_at = ?
                WHERE id = ?
            `;
            
            // Convert embedding array to JSON string for TiDB VECTOR type
            const embeddingStr = JSON.stringify(embedding);
            const currentTime = new Date();
            
            const [result] = await connection.execute(query, [embeddingStr, currentTime, alertId]);
            
            return result.affectedRows > 0;

        } catch (error) {
            this.logger.error({ error, alertId }, 'Error updating document embedding');
            return false;
        } finally {
            if (connection) {
                connection.release();
            }
        }
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
        const alertId = jobData?.id;
        const content = jobData?.content;

        if (!alertId || !content) {
            this.logger.error({ jobData }, 'Invalid job format');
            return false;
        }

        try {
            const embedding = await this.getEmbedding(content);
            
            if (!embedding || !Array.isArray(embedding) || embedding.length !== 1024) {
                this.logger.error({ alertId }, 'Failed to generate a valid embedding');
                return false;
            }

            const success = await this.updateAlertEmbedding(alertId, embedding);
            
            if (success) {
                this.logger.info({ alertId }, 'Successfully stored embedding');
            } else {
                this.logger.error({ alertId }, 'Failed to store embedding in database');
            }
            
            return success;

        } catch (error) {
            this.logger.error({ error, alertId }, 'Failed to store embedding');
            return false;
        }
    }

    async run() {
        try {
            await this.connectRedis();
            await this.initializeDatabasePool();
            
            this.logger.info({ queueName: this.queueName, batchSize: this.batchSize }, 'Worker started');

            while (true) {
                try {
                    // Blocking pop from the right of the list (5 second timeout)
                    const result = await this.redisClient.brPop(
                        redis.commandOptions({ isolated: true }),
                        this.queueName,
                        5
                    );

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
                    if (error.message.includes('cancelled') || error.name === 'AbortError') {
                        this.logger.info('Worker shutdown requested');
                        break;
                    }
                    
                    this.logger.error({ error }, 'Error in worker loop');
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
            if (this.dbPool) {
                await this.dbPool.end();
                this.logger.debug('Database pool closed');
            }
        } catch (error) {
            this.logger.error({ error }, 'Error closing database pool');
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

module.exports = EmbeddingWorker;

// if (require.main === module) {
//     const logger = require('../utils/logger');
//     main().catch(error => {
//         logger.fatal({ error }, 'Fatal error in main');
//         process.exit(1);
//     });
// }