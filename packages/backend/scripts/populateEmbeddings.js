require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { getEmbeddingsClient } = require('../src/services/embeddingsClient');
const pino = require('pino');

const logger = pino({ name: 'populate-embeddings' });
const prisma = new PrismaClient();
const BATCH_SIZE = 5; // Small batch size to avoid rate limiting
const EMBEDDING_MODEL = 'jina-embeddings-v3';

async function getTotalDocuments() {
  const result = await prisma.$queryRaw`
    SELECT CAST(COUNT(*) AS UNSIGNED) as count 
    FROM documents 
    WHERE embedding IS NULL 
    OR JSON_LENGTH(embedding) = 0
  `;
  return Number(result[0].count);
}

async function getDocumentsBatch(skip = 0, take = BATCH_SIZE) {
  try {
    // Convert skip and take to numbers explicitly
    const skipNum = Number(skip);
    const takeNum = Number(take);
    
    logger.debug({ skip: skipNum, take: takeNum }, 'Fetching documents batch');
    
    const documents = await prisma.$queryRaw`
      SELECT 
        CAST(id AS CHAR) as id,
        COALESCE(title, '') as title,
        COALESCE(content, '') as content
      FROM documents
      WHERE embedding IS NULL 
      OR JSON_LENGTH(embedding) = 0
      ORDER BY id
      LIMIT ${takeNum}
      OFFSET ${skipNum}
    `;
    
    logger.debug(`Fetched ${documents.length} documents`);
    return documents;
  } catch (error) {
    logger.error({ 
      error: error.message,
      stack: error.stack 
    }, 'Error in getDocumentsBatch');
    throw error;
  }
}

async function updateDocumentEmbedding(id, embedding) {
  try {
    logger.debug(`Updating document ${id}`);
    
    // Use parameterized query to avoid BigInt issues
    const result = await prisma.$executeRaw`
      UPDATE documents 
      SET embedding = ${JSON.stringify(embedding)}
      WHERE id = ${id.toString()}
    `;
    
    logger.debug(`Updated document ${id}`);
    return result;
  } catch (error) {
    logger.error({
      error: error.message,
      documentId: id,
      embeddingLength: embedding ? embedding.length : 0
    }, 'Error updating document embedding');
    throw error;
  }
}

async function populateEmbeddings() {
  try {
    const embeddingsClient = getEmbeddingsClient();
    const total = await getTotalDocuments();
    
    if (total === 0) {
      logger.info('No documents need embeddings. All done!');
      return;
    }

    logger.info(`Found ${total} documents that need embeddings`);
    
    let processed = 0;
    let successCount = 0;
    let errorCount = 0;

    while (processed < total) {
      const documents = await getDocumentsBatch(processed, BATCH_SIZE);
      if (documents.length === 0) break;

      logger.info(`Processing batch of ${documents.length} documents (${processed + 1}-${processed + documents.length} of ${total})`);
      
      try {
        // Generate embeddings for all documents in batch
        const texts = documents.map(doc => `${doc.title}\n\n${doc.content}`.substring(0, 8192));
        const embeddings = await embeddingsClient.generateEmbeddings(texts);
        
        // Update each document with its embedding
        await Promise.all(documents.map(async (doc, index) => {
          try {
            await updateDocumentEmbedding(doc.id, embeddings[index]);
            successCount++;
          } catch (error) {
            errorCount++;
            logger.error({ error: error.message, documentId: doc.id }, 'Failed to update document');
          }
        }));
        
        processed += documents.length;
        logger.info(`Processed ${processed}/${total} documents (${Math.round((processed / total) * 100)}%)`);
        
        // Add a small delay between batches to avoid rate limiting
        if (processed < total) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        errorCount += documents.length;
        logger.error({ error: error.message, batch: Math.ceil(processed / BATCH_SIZE) + 1 }, 'Batch failed');
        // Continue with next batch
        processed += documents.length;
      }
    }

    logger.info({
      total,
      success: successCount,
      failed: errorCount,
      successRate: total > 0 ? Math.round((successCount / total) * 100) : 0
    }, 'Embedding population completed');

  } catch (error) {
    logger.error({ error: error.message }, 'Failed to populate embeddings');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
populateEmbeddings()
  .catch(error => {
    logger.error(error, 'Unhandled error in populateEmbeddings');
    process.exit(1);
  });
