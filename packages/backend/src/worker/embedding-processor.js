/**
 * Embedding Queue Processor Utility
 * Processes pending embedding jobs from Redis queue
 */

const EmbeddingWorker = require('./EmbeddingWorker');
const { createClient } = require('redis');
const { prisma } = require('../db');
const pino = require('pino');

const logger = pino({ name: 'embedding-processor' });

/**
 * Process all pending embedding jobs
 */
async function processEmbeddingQueue() {
  const worker = new EmbeddingWorker();
  const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });

  try {
    console.log('🚀 Starting embedding queue processing...');
    
    await redisClient.connect();
    const queueLength = await redisClient.lLen('embedding-queue');
    
    console.log(`📦 Found ${queueLength} jobs in embedding queue`);
    
    if (queueLength === 0) {
      console.log('✅ No jobs to process');
      return { success: true, processed: 0 };
    }

    let processed = 0;
    let errors = 0;
    
    // Process jobs one by one
    for (let i = 0; i < queueLength; i++) {
      try {
        // Get job from queue
        const result = await redisClient.brPop('embedding-queue', 1);
        
        if (!result) {
          console.log('⏰ Queue timeout, continuing...');
          continue;
        }

        const job = JSON.parse(result.element);
        console.log(`📄 Processing job ${i + 1}/${queueLength}: Document ${job.id}`);
        
        // Process with worker
        const success = await worker.processJob(job);
        
        if (success) {
          processed++;
          console.log(`✅ Successfully processed document ${job.id}`);
        } else {
          errors++;
          console.error(`❌ Failed to process document ${job.id}`);
        }
        
        // Add small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        errors++;
        console.error(`💥 Error processing job ${i + 1}:`, error.message);
      }
    }

    console.log(`\n📊 Processing Summary:`);
    console.log(`  - Jobs processed: ${processed}`);
    console.log(`  - Errors: ${errors}`);
    console.log(`  - Success rate: ${((processed / (processed + errors)) * 100).toFixed(1)}%`);

    return { 
      success: processed > 0,
      processed,
      errors,
      total: processed + errors
    };

  } catch (error) {
    console.error('💥 Failed to process embedding queue:', error.message);
    return { success: false, error: error.message };
  } finally {
    await worker.cleanup();
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
    await prisma.$disconnect();
  }
}

/**
 * Check embedding status of documents
 */
async function checkEmbeddingStatus() {
  try {
    console.log('Checking embedding status...');
    
    const total = await prisma.document.count();
    const withEmbeddings = await prisma.document.count({
      where: {
        embedding: { not: null }
      }
    });
    
    const withoutEmbeddings = total - withEmbeddings;
    const percentage = total > 0 ? ((withEmbeddings / total) * 100).toFixed(1) : 0;

    console.log(`Document Embedding Status:`);
    console.log(`  - Total documents: ${total}`);
    console.log(`  - With embeddings: ${withEmbeddings} (${percentage}%)`);
    console.log(`  - Without embeddings: ${withoutEmbeddings}`);

    // Check recent documents
    const recentDocuments = await prisma.document.findMany({
      select: {
        id: true,
        title: true,
        embedding: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    console.log(`\nRecent Documents (last 10):`);
    recentDocuments.forEach(doc => {
      const hasEmbedding = doc.embedding !== null;
      console.log(`  - ${doc.id}: ${doc.title.substring(0, 50)}... [${hasEmbedding ? 'HAS EMBEDDING' : 'NO EMBEDDING'}]`);
    });

    return {
      total,
      withEmbeddings,
      withoutEmbeddings,
      percentage: parseFloat(percentage)
    };

  } catch (error) {
    console.error('Failed to check embedding status:', error.message);
    return { error: error.message };
  }
}

/**
 * Re-queue documents that don't have embeddings
 */
async function requeueMissingEmbeddings() {
  const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });

  try {
    console.log('Re-queuing documents without embeddings...');
    
    await redisClient.connect();
    
    // Find documents without embeddings
    const documentsWithoutEmbeddings = await prisma.document.findMany({
      where: {
        embedding: null
      },
      select: {
        id: true,
        content: true,
        title: true
      }
    });

    console.log(`Found ${documentsWithoutEmbeddings.length} documents without embeddings`);

    let queued = 0;
    
    for (const doc of documentsWithoutEmbeddings) {
      try {
        const jobPayload = {
          id: doc.id,
          content: doc.content.substring(0, 8000),
          timestamp: new Date().toISOString(),
          model: 'jina-embeddings-v3',
          dimensions: 1024
        };

        await redisClient.lPush('embedding-queue', JSON.stringify(jobPayload));
        queued++;
        
        console.log(`Queued document ${doc.id}: ${doc.title.substring(0, 50)}...`);
        
      } catch (error) {
        console.error(`Failed to queue document ${doc.id}:`, error.message);
      }
    }

    console.log(`Successfully queued ${queued} documents for embedding processing`);
    
    return { success: true, queued };

  } catch (error) {
    console.error('Failed to requeue missing embeddings:', error.message);
    return { success: false, error: error.message };
  } finally {
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  }
}

/**
 * Test a single embedding generation and storage
 */
async function testSingleEmbedding() {
  const worker = new EmbeddingWorker();
  
  try {
    console.log('Testing single embedding generation...');
    
    // Find a document without embedding
    const testDoc = await prisma.document.findFirst({
      where: {
        embedding: null
      }
    });

    if (!testDoc) {
      console.log('No documents found without embeddings');
      return { success: true, message: 'All documents already have embeddings' };
    }

    console.log(`Testing with document ${testDoc.id}: ${testDoc.title}`);

    const jobData = {
      id: testDoc.id,
      content: testDoc.content,
      timestamp: new Date().toISOString(),
      model: 'jina-embeddings-v3',
      dimensions: 1024
    };

    const success = await worker.processJob(jobData);

    if (success) {
      console.log('Single embedding test successful!');
      
      // Verify the embedding was stored
      const updatedDoc = await prisma.document.findUnique({
        where: { id: testDoc.id },
        select: { embedding: true }
      });

      if (updatedDoc.embedding) {
        console.log('Embedding successfully stored in database');
        return { success: true };
      } else {
        console.error('Embedding was not stored in database');
        return { success: false, error: 'Embedding not stored' };
      }
    } else {
      console.error('Single embedding test failed');
      return { success: false, error: 'Processing failed' };
    }

  } catch (error) {
    console.error('Single embedding test error:', error.message);
    return { success: false, error: error.message };
  } finally {
    await worker.cleanup();
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'process';

  switch (command) {
    case 'process':
    case 'run':
      processEmbeddingQueue()
        .then(result => {
          console.log('\nProcessing completed:', result);
          process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
          console.error('Processing failed:', error);
          process.exit(1);
        });
      break;

    case 'status':
    case 'check':
      checkEmbeddingStatus()
        .then(result => {
          console.log('\nStatus check completed');
          process.exit(0);
        })
        .catch(error => {
          console.error('Status check failed:', error);
          process.exit(1);
        });
      break;

    case 'requeue':
      requeueMissingEmbeddings()
        .then(result => {
          console.log('\nRequeue completed:', result);
          process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
          console.error('Requeue failed:', error);
          process.exit(1);
        });
      break;

    case 'test':
      testSingleEmbedding()
        .then(result => {
          console.log('\nTest completed:', result);
          process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
          console.error('Test failed:', error);
          process.exit(1);
        });
      break;

    default:
      console.log('Embedding Queue Processor');
      console.log('=========================');
      console.log('Usage:');
      console.log('  node embedding-processor.js process   - Process all pending jobs');
      console.log('  node embedding-processor.js status    - Check embedding status');
      console.log('  node embedding-processor.js requeue   - Re-queue missing embeddings');
      console.log('  node embedding-processor.js test      - Test single embedding');
      process.exit(1);
  }
}

module.exports = {
  processEmbeddingQueue,
  checkEmbeddingStatus,
  requeueMissingEmbeddings,
  testSingleEmbedding
};