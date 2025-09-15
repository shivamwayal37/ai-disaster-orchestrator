/**
 * Main Express Application - AI Disaster Response Orchestrator
 * Centralized API server with all routes and middleware
 */

// Add BigInt JSON serialization support
if (typeof BigInt !== 'undefined') {
  BigInt.prototype.toJSON = function() {
    return this.toString();
  };
}

require('dotenv').config();

// Debug: Check if the API key is loaded
console.log('Kimi API Key Loaded:', process.env.KIMI_API_KEY ? `${process.env.KIMI_API_KEY.substring(0, 4)}...` : undefined);
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pino = require('pino');
const pinoHttp = require('pino-http');

// Import routes
const searchRoutes = require('./routes/search');
const retrieveRoutes = require('./routes/retrieve');
const respondRoutes = require('./routes/respond');
const orchestratorRoutes = require('./routes/orchestratorRoutes');
const { ActionOrchestrator } = require('./services/actionServices');
const alertRoutes = require('./routes/alertRoutes');
const incidentsRoutes = require('./routes/incidents');

const app = express();
const logger = pino({ name: 'disaster-orchestrator' });

// Initialize action services
const actionOrchestrator = new ActionOrchestrator();
app.set('actionOrchestrator', actionOrchestrator);

// Initialize action services and cache on startup
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      await actionOrchestrator.init();
      logger.info('Action services initialized successfully');
      
      // Initialize cache service
      const { cacheService } = require('./services/cacheService');
      await cacheService.init();
      logger.info('Cache service initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize services');
      // Don't crash the app, but some features may be limited
    }
  })();
}

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

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(pinoHttp({
  logger,
  customLogLevel: function (req, res, err) {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return 'warn'
    } else if (res.statusCode >= 500 || err) {
      return 'error'
    }
    return 'info'
  }
}));

// API Routes
app.use('/api/search', searchRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/retrieve', retrieveRoutes);
app.use('/api/respond', respondRoutes);
app.use('/api/orchestrate', orchestratorRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

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
      test: '/api/retrieve/test',
      orchestrate: '/api/orchestrate'
    },
    documentation: 'See README.md for API documentation'
  });
});

app.use('/api/alerts', alertRoutes);

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
