/**
 * Day 6 - Response Orchestrator API Routes
 * RESTful API endpoints for disaster response plan generation
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, query, validationResult } = require('express-validator');
const { responseOrchestrator } = require('../services/responseOrchestratorService');
const pino = require('pino');
const dotenv = require('dotenv');
const router = express.Router();
const logger = pino({ name: 'orchestrator-api' });

// Rate limiting for orchestration endpoints
const orchestratorRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Maximum 20 requests per window per IP
  message: {
    error: 'Too many orchestration requests',
    message: 'Please wait before making more requests'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Input validation middleware
const validateOrchestrationRequest = [
  body('query')
    .isString()
    .isLength({ min: 10, max: 500 })
    .withMessage('Query must be a string between 10 and 500 characters'),
  
  body('type')
    .isString()
    .isIn(['wildfire', 'flood', 'earthquake', 'cyclone', 'heatwave', 'landslide', 'other'])
    .withMessage('Type must be a valid disaster type'),
  
  body('location')
    .isString()
    .isLength({ min: 2, max: 100 })
    .withMessage('Location must be a string between 2 and 100 characters'),
  
  body('severity')
    .optional()
    .isIn(['low', 'moderate', 'high', 'severe', 'critical'])
    .withMessage('Severity must be: low, moderate, high, severe, or critical'),
  
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

/**
 * POST /api/orchestrate
 * Main endpoint for generating disaster response action plans
 */
router.post('/', 
  orchestratorRateLimit,
  validateOrchestrationRequest,
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { query, type, location, severity, metadata } = req.body;
      
      logger.info({
        query: query.substring(0, 100),
        type,
        location,
        severity
      }, 'Orchestration request received');

      // Generate action plan
      const actionPlan = await responseOrchestrator.generateActionPlan({
        query,
        type,
        location,
        severity,
        metadata
      });

      const responseTime = Date.now() - startTime;
      
      res.json({
        success: true,
        request_id: actionPlan.metadata?.requestId || `req_${Date.now()}`,
        action_plan: actionPlan,
        response_time_ms: responseTime
      });

      // Log successful orchestration
      logger.info({
        requestId: actionPlan.metadata?.requestId,
        type,
        location,
        responseTime,
        cached: actionPlan.metadata?.cached || false
      }, 'Action plan generated successfully');

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error({
        error: error.message,
        query: req.body.query?.substring(0, 100),
        type: req.body.type,
        location: req.body.location,
        responseTime
      }, 'Orchestration request failed');

      res.status(500).json({
        success: false,
        error: 'Failed to generate action plan',
        message: error.message,
        response_time_ms: responseTime
      });
    }
  }
);

/**
 * POST /api/orchestrate/batch
 * Batch processing endpoint for multiple scenarios
 */
router.post('/batch',
  orchestratorRateLimit,
  body('scenarios')
    .isArray({ min: 1, max: 5 })
    .withMessage('Scenarios must be an array with 1-5 items'),
  
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { scenarios } = req.body;
      
      logger.info({
        scenarioCount: scenarios.length
      }, 'Batch orchestration request received');

      // Process scenarios in parallel with limit
      const results = await Promise.allSettled(
        scenarios.map(async (scenario, index) => {
          try {
            return {
              index,
              success: true,
              data: await responseOrchestrator.generateActionPlan(scenario)
            };
          } catch (error) {
            return {
              index,
              success: false,
              error: error.message,
              scenario: scenario.query?.substring(0, 50) || 'Unknown'
            };
          }
        })
      );

      const successful = results.filter(r => r.value.success).length;
      const failed = results.length - successful;
      const responseTime = Date.now() - startTime;

      res.json({
        success: true,
        data: {
          results: results.map(r => r.value),
          summary: {
            total: scenarios.length,
            successful,
            failed,
            response_time_ms: responseTime
          }
        }
      });

      logger.info({
        total: scenarios.length,
        successful,
        failed,
        responseTime
      }, 'Batch orchestration completed');

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error({
        error: error.message,
        responseTime
      }, 'Batch orchestration failed');

      res.status(500).json({
        success: false,
        error: 'Batch processing failed',
        message: error.message,
        response_time_ms: responseTime
      });
    }
  }
);

/**
 * GET /api/orchestrate/health
 * Health check endpoint for the orchestrator service
 */
router.get('/health', async (req, res) => {
  try {
    const healthStatus = await responseOrchestrator.healthCheck();
    
    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      success: healthStatus.status === 'healthy',
      data: healthStatus
    });
    
  } catch (error) {
    logger.error({ error: error.message }, 'Health check failed');
    
    res.status(503).json({
      success: false,
      data: {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * GET /api/orchestrate/templates
 * Get available disaster type templates and their default configurations
 */
router.get('/templates', (req, res) => {
  try {
    const templates = {
      wildfire: {
        urgency_level: 'HIGH',
        typical_resources: ['Fire trucks', 'Helicopters', 'Medical teams', 'Evacuation buses'],
        common_actions: ['Establish evacuation zones', 'Deploy aerial units', 'Set up medical stations'],
        key_metrics: ['Containment percentage', 'Evacuation completion', 'Structure protection']
      },
      flood: {
        urgency_level: 'HIGH',
        typical_resources: ['Rescue boats', 'Pumps', 'Sandbags', 'Medical supplies'],
        common_actions: ['Assess water levels', 'Deploy rescue teams', 'Establish shelters'],
        key_metrics: ['Water level monitoring', 'Evacuation rates', 'Infrastructure damage']
      },
      earthquake: {
        urgency_level: 'CRITICAL',
        typical_resources: ['Search teams', 'Medical units', 'Heavy equipment', 'Emergency shelters'],
        common_actions: ['Search and rescue', 'Medical triage', 'Infrastructure assessment'],
        key_metrics: ['Casualty count', 'Building safety', 'Aftershock monitoring']
      },
      cyclone: {
        urgency_level: 'HIGH',
        typical_resources: ['Shelters', 'Communication systems', 'Medical teams', 'Relief supplies'],
        common_actions: ['Mass evacuation', 'Secure infrastructure', 'Establish communication'],
        key_metrics: ['Wind speed monitoring', 'Evacuation completion', 'Power restoration']
      },
      supported_types: ['wildfire', 'flood', 'earthquake', 'cyclone', 'heatwave', 'landslide', 'other']
    };

    res.json({
      success: true,
      data: templates
    });

  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get templates');
    
    res.status(500).json({
      success: false,
      error: 'Failed to get templates',
      message: error.message
    });
  }
});

/**
 * POST /api/orchestrate/test
 * Test endpoint with predefined scenarios
 */
router.post('/test', 
  query('scenario')
    .optional()
    .isIn(['wildfire', 'flood', 'earthquake', 'all'])
    .withMessage('Scenario must be: wildfire, flood, earthquake, or all'),
    
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const scenario = req.query.scenario || 'wildfire';
      
      const testScenarios = {
        wildfire: {
          query: 'Fast-spreading wildfire threatening residential area with strong wind conditions',
          type: 'wildfire',
          location: 'California',
          severity: 'high',
          metadata: { wind_speed: '25 mph', humidity: '15%' }
        },
        flood: {
          query: 'Severe flooding in urban area due to heavy rainfall and river overflow',
          type: 'flood',
          location: 'Mumbai',
          severity: 'severe',
          metadata: { rainfall: '200mm in 6 hours', affected_population: '50000' }
        },
        earthquake: {
          query: 'Major earthquake with significant structural damage and potential aftershocks',
          type: 'earthquake',
          location: 'Tokyo',
          severity: 'critical',
          metadata: { magnitude: '7.2', depth: '10 km' }
        }
      };

      let scenariosToTest = [];
      
      if (scenario === 'all') {
        scenariosToTest = Object.values(testScenarios);
      } else {
        scenariosToTest = [testScenarios[scenario]];
      }

      logger.info({
        testScenarios: scenariosToTest.length,
        scenario
      }, 'Running test scenarios');

      const results = await Promise.allSettled(
        scenariosToTest.map(async (testScenario) => {
          const startTime = Date.now();
          try {
            const result = await responseOrchestrator.generateActionPlan(testScenario);
            return {
              scenario: testScenario.type,
              success: true,
              data: result,
              response_time_ms: Date.now() - startTime
            };
          } catch (error) {
            return {
              scenario: testScenario.type,
              success: false,
              error: error.message,
              response_time_ms: Date.now() - startTime
            };
          }
        })
      );

      const successful = results.filter(r => r.value.success).length;
      const avgResponseTime = results.reduce((sum, r) => sum + r.value.response_time_ms, 0) / results.length;

      res.json({
        success: true,
        data: {
          test_results: results.map(r => r.value),
          summary: {
            total_tests: results.length,
            successful,
            failed: results.length - successful,
            average_response_time_ms: Math.round(avgResponseTime),
            test_passed: successful === results.length
          }
        }
      });

    } catch (error) {
      logger.error({ error: error.message }, 'Test endpoint failed');
      
      res.status(500).json({
        success: false,
        error: 'Test execution failed',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/orchestrate/stats
 * Get orchestration service statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;
    
    // In a production system, these would come from metrics storage
    // For now, we'll return basic operational stats
    const stats = {
      service_status: 'operational',
      uptime: process.uptime(),
      memory_usage: process.memoryUsage(),
      ai_provider: responseOrchestrator.aiProvider,
      cache_enabled: responseOrchestrator.cacheEnabled,
      supported_disaster_types: ['wildfire', 'flood', 'earthquake', 'cyclone', 'heatwave', 'landslide', 'other'],
      rate_limits: {
        requests_per_window: 20,
        window_minutes: 15
      },
      response_times: {
        p50: '1200ms',
        p95: '3000ms',
        p99: '5000ms'
      }
    };

    res.json({
      success: true,
      data: stats,
      time_range: timeRange,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get stats');
    
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
      message: error.message
    });
  }
});

// Error handling middleware for orchestrator routes
router.use((error, req, res, next) => {
  logger.error({
    error: error.message,
    path: req.path,
    method: req.method,
    body: req.body
  }, 'Orchestrator API error');

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
