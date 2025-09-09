const fs = require('fs').promises;
const path = require('path');
const redis = require('redis');
const {prisma} = require('../db');
const axios = require('axios');
const winston = require('winston');
require('dotenv').config();

class EmbeddingWorker {
    constructor(options = {}) {
        this.redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
        this.queueName = options.queueName || 'embedding-queue';
        this.batchSize = parseInt(process.env.EMBEDDING_BATCH_SIZE || '10');
        this.redisClient = null;
        this.dbPool = null;
        
        // Initialize logger
        this.logger = this.initializeLogger();
        
        // Initialize services
        this.jinaApiKey = process.env.JINA_API_KEY;
        this.validateEnvironment();
    }

    /**
     * Initialize Winston logger with UTF-8 support
     */
    initializeLogger() {
        const logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.printf(({ timestamp, level, message }) => {
                    return `${timestamp} - embedding_worker - ${level.toUpperCase()} - ${message}`;
                })
            ),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ 
                    filename: 'embedding_worker.log',
                    options: { flags: 'a', encoding: 'utf8' }
                })
            ]
        });

        return logger;
    }

    /**
     * Validate required environment variables
     */
    validateEnvironment() {
        if (!this.jinaApiKey) {
            throw new Error('JINA_API_KEY not found in environment variables');
        }

        const requiredDbVars = ['TIDB_HOST', 'TIDB_USER', 'TIDB_DATABASE'];
        const missing = requiredDbVars.filter(varName => !process.env[varName]);
        
        if (missing.length > 0) {
            throw new Error(`Missing database configuration: ${missing.join(', ')}`);
        }
    }

    /**
     * Jina Embedding Service functions
     */
    async getEmbedding(text, maxRetries = 3) {
        if (!text || !text.trim()) {
            return null;
        }

        const payload = {
            model: 'jina-embeddings-v3',
            task: 'text-matching',
            dimensions: 1024,
            input: [text]
        };

        const headers = {
            'Authorization': `Bearer ${this.jinaApiKey}`,
            'Content-Type': 'application/json'
        };

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await axios.post(
                    'https://api.jina.ai/v1/embeddings',
                    payload,
                    {
                        headers,
                        timeout: 30000
                    }
                );

                if (response.status === 200 && response.data?.data?.[0]?.embedding) {
                    return response.data.data[0].embedding;
                } else {
                    this.logger.error(`Jina API error ${response.status}: ${response.data}`);
                    return null;
                }

            } catch (error) {
                const isLastAttempt = attempt === maxRetries;
                const waitTime = Math.min(4 * Math.pow(2, attempt - 1), 10) * 1000;

                if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                    this.logger.warn(`Request timeout on attempt ${attempt}/${maxRetries}`);
                } else if (error.response) {
                    this.logger.error(`Jina API error ${error.response.status}: ${error.response.data}`);
                } else {
                    this.logger.error(`Network error on attempt ${attempt}/${maxRetries}: ${error.message}`);
                }

                if (isLastAttempt) {
                    this.logger.error(`Failed to get embedding after ${maxRetries} attempts`);
                    throw error;
                }

                // Exponential backoff
                await this.sleep(waitTime);
            }
        }
    }

    /**
     * Database Service functions
     */
    async initializeDatabasePool() {
        try {
            this.dbPool = prisma({
                host: process.env.TIDB_HOST,
                port: parseInt(process.env.TIDB_PORT || '4000'),
                user: process.env.TIDB_USER,
                password: process.env.TIDB_PASSWORD || '',
                database: process.env.TIDB_DATABASE || 'disaster_db',
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                acquireTimeout: 60000,
                timeout: 60000,
                reconnect: true
            });

            // Test the connection
            const connection = await this.dbPool.getConnection();
            await connection.ping();
            connection.release();
            
            this.logger.info('[OK] Connected to database');
        } catch (error) {
            this.logger.error(`Failed to initialize database pool: ${error.message}`);
            throw error;
        }
    }

    async updateAlertEmbedding(alertId, embedding) {
        if (!this.dbPool) {
            throw new Error('Database pool not initialized');
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
            this.logger.error(`Error updating document embedding: ${error.message}`);
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
                this.logger.info(`Connecting to Redis at ${this.redisUrl}...`);
                
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
                    this.logger.error(`Redis error: ${error.message}`);
                });

                this.redisClient.on('connect', () => {
                    this.logger.info('[OK] Connected to Redis');
                });

                this.redisClient.on('ready', () => {
                    this.logger.info('[OK] Redis client ready');
                });

                await this.redisClient.connect();
                await this.redisClient.ping();
                
                return;

            } catch (error) {
                this.logger.error(`Redis connection failed (attempt ${attempt}/${maxRetries}): ${error.message}`);
                
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
            this.logger.error(`Invalid job format: ${JSON.stringify(jobData)}`);
            return false;
        }

        try {
            const embedding = await this.getEmbedding(content);
            
            if (!embedding || !Array.isArray(embedding) || embedding.length !== 1024) {
                this.logger.error(`[ERROR] Failed to generate a valid embedding for alert ${alertId}`);
                return false;
            }

            const success = await this.updateAlertEmbedding(alertId, embedding);
            
            if (success) {
                this.logger.info(`[SUCCESS] Stored embedding for alert ${alertId}`);
            } else {
                this.logger.error(`[ERROR] Failed to store embedding for alert ${alertId} in database`);
            }
            
            return success;

        } catch (error) {
            this.logger.error(`[ERROR] Failed to store embedding for alert ${alertId}: ${error.message}`);
            return false;
        }
    }

    async run() {
        try {
            await this.connectRedis();
            await this.initializeDatabasePool();
            
            this.logger.info(`[START] Worker listening on queue: '${this.queueName}' with batch size ${this.batchSize}`);

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
                        this.logger.error(`Invalid JSON received from queue: ${jobStr}`);
                    }

                } catch (error) {
                    if (error.message.includes('cancelled') || error.name === 'AbortError') {
                        this.logger.info('Worker shutdown requested.');
                        break;
                    }
                    
                    this.logger.error(`Error in worker loop: ${error.message}`);
                    await this.sleep(5000); // Prevent rapid-fire errors
                }
            }

        } catch (error) {
            this.logger.error(`Fatal error in worker: ${error.message}`);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    async cleanup() {
        this.logger.info('Cleaning up resources...');
        
        try {
            if (this.redisClient && this.redisClient.isOpen) {
                await this.redisClient.quit();
                this.logger.info('Redis connection closed');
            }
        } catch (error) {
            this.logger.error(`Error closing Redis connection: ${error.message}`);
        }

        try {
            if (this.dbPool) {
                await this.dbPool.end();
                this.logger.info('Database pool closed');
            }
        } catch (error) {
            this.logger.error(`Error closing database pool: ${error.message}`);
        }

        this.logger.info('Worker shutdown complete.');
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
    const args = require('yargs')
        .option('queue', {
            type: 'string',
            default: 'embedding-queue',
            description: 'Redis queue name to listen on'
        })
        .option('redis-url', {
            type: 'string',
            description: 'Redis connection URL'
        })
        .option('log-level', {
            type: 'string',
            default: 'info',
            choices: ['debug', 'info', 'warning', 'error', 'critical'],
            description: 'Log level'
        })
        .help()
        .argv;

    const worker = new EmbeddingWorker({
        redisUrl: args.redisUrl,
        queueName: args.queue
    });

    worker.setLogLevel(args.logLevel);

    // Handle graceful shutdown
    const shutdown = async (signal) => {
        worker.logger.info(`Received ${signal}, shutting down gracefully...`);
        await worker.cleanup();
        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    try {
        await worker.run();
    } catch (error) {
        worker.logger.error(`[FATAL] Fatal error in worker: ${error.message}`);
        process.exit(1);
    }
}

// Export for use as module or run directly
module.exports = EmbeddingWorker;

// if (require.main === module) {
//     main().catch(error => {
//         console.error('Fatal error:', error);
//         process.exit(1);
//     });
// }