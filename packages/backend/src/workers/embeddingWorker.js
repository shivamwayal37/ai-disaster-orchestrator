/**
 * Embedding Worker Service - Day 5
 * Processes work queue to generate and store vector embeddings using Kimi API
 */

const { prisma } = require('../db');
const pino = require('pino');
const { generateEmbeddings } = require('../services/kimiClient');

const logger = pino({ name: 'embedding-worker' });

class EmbeddingWorker {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 10;
    this.pollInterval = options.pollInterval || 5000; // 5 seconds
    this.isRunning = false;
    this.embeddingDimensions = 1024; // Kimi's embedding dimensions
  }

  /**
   * Generate embeddings using Kimi API
   * @param {string[]} texts - Array of text strings to generate embeddings for
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async generateEmbeddings(texts) {
    try {
      logger.info({
        textsCount: texts.length,
        model: 'kimi-embedding-model'
      }, 'Generating embeddings with Kimi API');
      
      const embeddings = await generateEmbeddings(texts);
      
      logger.info({
        textsCount: texts.length,
        embeddingDimensions: this.embeddingDimensions,
        firstEmbeddingLength: embeddings[0]?.length || 0
      }, 'Successfully generated embeddings');
      
      return embeddings;
    } catch (error) {
      logger.error({ 
        error: error.message,
        stack: error.stack 
      }, 'Failed to generate embeddings with Kimi API');
      throw error;
    }
  }

  /**
   * Process pending embedding tasks from work queue
   */
  async processPendingTasks() {
    try {
      // Get pending embedding tasks
      const tasks = await prisma.workQueue.findMany({
        where: {
          taskType: 'EMBED',
          status: 'PENDING',
          // Only retry failed tasks after a delay
          OR: [
            { retryCount: 0 },
            { 
              retryCount: { gt: 0 },
              updatedAt: { 
                lt: new Date(Date.now() - Math.min(Math.pow(2, 5) * 1000, 300000)) // Exponential backoff with max 5min
              }
            }
          ]
        },
        orderBy: [
          { priority: 'asc' },
          { createdAt: 'asc' }
        ],
        take: this.batchSize
      });

      if (tasks.length === 0) {
        logger.debug('No pending embedding tasks found');
        return { processed: 0, errors: 0 };
      }

      logger.info({ taskCount: tasks.length }, 'Processing embedding tasks');

      // Mark tasks as running
      const taskIds = tasks.map(t => t.id);
      await prisma.workQueue.updateMany({
        where: { id: { in: taskIds } },
        data: { 
          status: 'RUNNING',
          startedAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Group tasks by document type for batch processing
      const documentTasks = [];
      const batchSize = 100; // OpenAI's max batch size

      for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        const texts = [];
        const taskBatch = [];

        for (const task of batch) {
          const payload = task.payload;
          if (payload?.document_id && payload?.text) {
            texts.push(payload.text);
            taskBatch.push({
              taskId: task.id,
              documentId: payload.document_id,
              text: payload.text.substring(0, 100)
            });
          }
        }

        if (texts.length > 0) {
          documentTasks.push({ texts, tasks: taskBatch });
        }
      }

      let processed = 0;
      let errors = 0;

      // Process each batch
      for (const { texts, tasks: taskBatch } of documentTasks) {
        try {
          const embeddings = await this.generateEmbeddings(texts);
          
          // Update documents with embeddings
          for (let i = 0; i < embeddings.length; i++) {
            const task = taskBatch[i];
            const embedding = embeddings[i];

            try {
              // Convert embedding to string format for SQL
              const vectorString = `[${embedding.join(',')}]`;
              
              // Update document with embedding using raw SQL to handle vector type
              // Note: Make sure your TiDB column is created with VECTOR(1024) to match Kimi's dimensions
              await prisma.$executeRaw`
                UPDATE Document 
                SET embedding = CAST(${vectorString} AS VECTOR(1024)),
                    updatedAt = NOW()
                WHERE id = ${task.documentId}
              `;
              
              logger.info({ documentId: task.documentId }, 'Successfully processed document with Kimi embeddings');
              
              // Mark task as completed
              await prisma.workQueue.update({
                where: { id: task.taskId },
                data: {
                  status: 'DONE',
                  completedAt: new Date(),
                  updatedAt: new Date()
                }
              });

              processed++;
              
              if (processed % 10 === 0) {
                logger.debug({
                  processed,
                  remaining: tasks.length - processed - errors
                }, 'Processing embeddings');
              }

            } catch (error) {
              logger.error({
                taskId: task.taskId,
                documentId: task.documentId,
                error: error.message
              }, 'Failed to update document embedding');

              // Mark task as error with backoff
              await prisma.workQueue.update({
                where: { id: task.taskId },
                data: {
                  status: 'ERROR',
                  completedAt: new Date(),
                  updatedAt: new Date(),
                  errorMsg: error.message.substring(0, 1000), // Truncate long error messages
                  retryCount: { increment: 1 }
                }
              });

              errors++;
            }
          }
        } catch (batchError) {
          logger.error(batchError, 'Batch embedding generation failed');
          
          // Mark all tasks in failed batch as error
          await prisma.workQueue.updateMany({
            where: { 
              id: { in: taskBatch.map(t => t.taskId) }
            },
            data: {
              status: 'ERROR',
              completedAt: new Date(),
              updatedAt: new Date(),
              errorMsg: batchError.message.substring(0, 1000),
              retryCount: { increment: 1 }
            }
          });
          
          errors += taskBatch.length;
        }
      }

      logger.info({
        processed,
        errors,
        totalTasks: tasks.length
      }, 'Embedding batch completed');

      return { processed, errors };

    } catch (error) {
      logger.error(error, 'Failed to process embedding tasks');
      return { processed: 0, errors: 1 };
    }
  }

  /**
   * Start the embedding worker (continuous processing)
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Embedding worker already running');
      return;
    }

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.isRunning = true;
    logger.info({ 
      model: this.model,
      batchSize: this.batchSize,
      pollInterval: this.pollInterval 
    }, '🚀 Starting embedding worker');

    // Handle process signals for graceful shutdown
    const shutdown = async () => {
      logger.info('🛑 Stopping embedding worker...');
      this.isRunning = false;
      // Give in-progress tasks time to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Main processing loop
    while (this.isRunning) {
      try {
        const result = await this.processPendingTasks();
        
        if (result.processed > 0) {
          logger.info({
            processed: result.processed,
            errors: result.errors
          }, 'Processed embedding batch');
        } else if (this.pollInterval > 0) {
          // Only log when in polling mode
          logger.debug('No tasks to process, waiting...');
        }

      } catch (error) {
        logger.error(error, 'Embedding worker cycle failed');
      }

      // Wait before next poll if not in test mode
      if (this.pollInterval > 0) {
        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      } else {
        // For testing, exit after one batch
        break;
      }
    }

    logger.info('Embedding worker stopped');
  }

  /**
   * Stop the embedding worker
   */
  stop() {
    logger.info('Stopping embedding worker');
    this.isRunning = false;
  }

  /**
   * Get worker statistics
   */
  async getStats() {
    try {
      const [
        pendingTasks, 
        runningTasks, 
        completedTasks, 
        errorTasks,
        recentErrors
      ] = await Promise.all([
        prisma.workQueue.count({ 
          where: { 
            taskType: 'EMBED', 
            status: 'PENDING' 
          } 
        }),
        prisma.workQueue.count({ 
          where: { 
            taskType: 'EMBED', 
            status: 'RUNNING' 
          } 
        }),
        prisma.workQueue.count({ 
          where: { 
            taskType: 'EMBED', 
            status: 'DONE' 
          } 
        }),
        prisma.workQueue.count({ 
          where: { 
            taskType: 'EMBED', 
            status: 'ERROR' 
          } 
        }),
        prisma.workQueue.findMany({
          where: { 
            taskType: 'EMBED',
            status: 'ERROR',
            updatedAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            }
          },
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            payload: true,
            errorMsg: true,
            retryCount: true,
            updatedAt: true
          }
        })
      ]);

      const [documentsWithEmbeddings, totalDocuments] = await Promise.all([
        prisma.document.count({
          where: { embedding: { not: null } }
        }),
        prisma.document.count()
      ]);

      const processingRate = await prisma.$queryRaw`
        SELECT 
          COUNT(*) as count,
          DATE(completedAt) as date
        FROM WorkQueue
        WHERE 
          taskType = 'EMBED' 
          AND status = 'DONE'
          AND completedAt > DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(completedAt)
        ORDER BY date DESC
        LIMIT 7
      `;

      return {
        status: this.isRunning ? 'RUNNING' : 'STOPPED',
        model: this.model,
        batchSize: this.batchSize,
        pollInterval: this.pollInterval,
        tasks: {
          pending: pendingTasks,
          running: runningTasks,
          completed: completedTasks,
          errors: errorTasks,
          total: pendingTasks + runningTasks + completedTasks + errorTasks,
          recentErrors: recentErrors.map(e => ({
            id: e.id,
            documentId: e.payload?.document_id,
            error: e.errorMsg,
            retries: e.retryCount,
            lastAttempt: e.updatedAt
          }))
        },
        documents: {
          withEmbeddings: documentsWithEmbeddings,
          total: totalDocuments,
          completionRate: totalDocuments > 0 
            ? Math.round((documentsWithEmbeddings / totalDocuments) * 100) 
            : 0
        },
        processingRate: processingRate.reduce((acc, curr) => {
          acc[curr.date.toISOString().split('T')[0]] = parseInt(curr.count);
          return acc;
        }, {})
      };
    } catch (error) {
      logger.error(error, 'Failed to get worker stats');
      return { 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    }
  }

  /**
   * Queue a document for embedding
   */
  static async queueDocumentForEmbedding(documentId, text, priority = 5) {
    if (!documentId || !text) {
      throw new Error('Document ID and text are required');
    }

    // Check if there's already a pending/running task for this document
    const existingTask = await prisma.workQueue.findFirst({
      where: {
        taskType: 'EMBED',
        payload: {
          path: ['document_id'],
          equals: documentId
        },
        status: {
          in: ['PENDING', 'RUNNING']
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (existingTask) {
      logger.debug({ documentId, taskId: existingTask.id }, 'Document already queued for embedding');
      return { taskId: existingTask.id, status: existingTask.status };
    }

    // Create new task
    const task = await prisma.workQueue.create({
      data: {
        taskType: 'EMBED',
        status: 'PENDING',
        priority,
        payload: {
          document_id: documentId,
          text: text.substring(0, 8000) // Truncate to stay within token limits
        },
        retryCount: 0
      }
    });

    logger.info({ taskId: task.id, documentId }, 'Queued document for embedding');
    return { taskId: task.id, status: 'QUEUED' };
  }
}

/**
 * CLI interface for embedding worker
 */
async function runEmbeddingWorker() {
  const worker = new EmbeddingWorker({
    batchSize: process.env.EMBEDDING_BATCH_SIZE ? parseInt(process.env.EMBEDDING_BATCH_SIZE) : 10,
    pollInterval: process.env.EMBEDDING_POLL_INTERVAL ? parseInt(process.env.EMBEDDING_POLL_INTERVAL) : 5000
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping embedding worker...');
    worker.stop();
    setTimeout(() => process.exit(0), 1000);
  });

  try {
    await worker.start();
  } catch (error) {
    console.error('💥 Embedding worker failed:', error.message);
    process.exit(1);
  }
}

// Allow running as standalone script
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'start';

  switch (command) {
    case 'start':
      runEmbeddingWorker();
      break;
      
    case 'stats':
      const worker = new EmbeddingWorker();
      worker.getStats()
        .then(stats => {
          console.log('📊 Embedding Worker Stats:');
          console.log(JSON.stringify(stats, null, 2));
          process.exit(0);
        })
        .catch(error => {
          console.error('Failed to get stats:', error.message);
          process.exit(1);
        });
      break;
      
    case 'once':
      const onceWorker = new EmbeddingWorker();
      onceWorker.processPendingTasks()
        .then(result => {
          console.log('✅ Processed embedding batch:', result);
          process.exit(0);
        })
        .catch(error => {
          console.error('❌ Failed to process embeddings:', error.message);
          process.exit(1);
        });
      break;
      
    default:
      console.log('Usage:');
      console.log('  node embeddingWorker.js start  - Start continuous worker');
      console.log('  node embeddingWorker.js stats  - Show worker statistics');
      console.log('  node embeddingWorker.js once   - Process one batch and exit');
      process.exit(1);
  }
}

module.exports = { EmbeddingWorker, runEmbeddingWorker };
