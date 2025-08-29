/**
 * Main Express Application - AI Disaster Response Orchestrator
 * Includes retrieval and hybrid search endpoints
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pino = require('pino');
const pinoHttp = require('pino-http');

// Import routes
const retrieveRoutes = require('./routes/retrieve');

const app = express();
const logger = pino({ name: 'disaster-orchestrator' });

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Logging middleware
app.use(pinoHttp({ logger }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/retrieve', retrieveRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'AI Disaster Response Orchestrator',
    version: process.env.npm_package_version || '1.0.0',
    description: 'Hybrid search and RAG system for disaster response coordination',
    endpoints: {
      health: '/health',
      retrieve: '/api/retrieve',
      search: '/api/retrieve/search',
      disaster: '/api/retrieve/disaster',
      stats: '/api/retrieve/stats',
      test: '/api/retrieve/test'
    },
    documentation: 'See README.md for API documentation'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((error, req, res, next) => {
  logger.error(error, 'Unhandled application error');
  
  res.status(error.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString(),
    requestId: req.id
  });
});

const PORT = process.env.PORT || 3001;

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info({
      port: PORT,
      environment: process.env.NODE_ENV || 'development'
    }, 'AI Disaster Response Orchestrator server started');
  });
}

module.exports = app;
