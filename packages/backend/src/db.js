const { PrismaClient } = require('@prisma/client');
const pino = require('pino');

const logger = pino({ name: 'db' });

// Initialize Prisma client with logging
const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'event' },
    { level: 'info', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
});

// Log database queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug({
      query: e.query,
      params: e.params,
      duration: `${e.duration}ms`,
    }, 'Database query');
  });
}

prisma.$on('error', (e) => {
  logger.error(e, 'Database error');
});

// Test database connection
async function testConnection() {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
    
    // Test a simple query
    const alertCount = await prisma.alert.count();
    logger.info({ alertCount }, 'Database test query successful');
    
    return true;
  } catch (error) {
    logger.error(error, 'Database connection failed');
    return false;
  }
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  logger.info('Database disconnected');
});

module.exports = {
  prisma,
  testConnection,
};
