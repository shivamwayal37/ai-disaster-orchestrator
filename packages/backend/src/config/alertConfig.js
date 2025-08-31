/**
 * Alert Service Configuration
 * 
 * This file contains configuration settings for the alert service,
 * including default values, validation rules, and environment variable mappings.
 */

require('dotenv').config();

const config = {
  // Default alert settings
  defaults: {
    severityLevels: {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4
    },
    
    // Default alert types
    alertTypes: [
      'WEATHER',
      'EARTHQUAKE',
      'FLOOD',
      'FIRE',
      'TSUNAMI',
      'CYCLONE',
      'VOLCANO',
      'LANDSLIDE',
      'INDUSTRIAL_ACCIDENT',
      'TRAFFIC_INCIDENT',
      'PUBLIC_SAFETY',
      'HEALTH_ALERT',
      'SECURITY_ALERT',
      'OTHER'
    ],
    
    // Default alert sources
    sources: [
      'WEATHER_API',
      'SEISMIC_API',
      'GOVERNMENT',
      'EMERGENCY_SERVICES',
      'SOCIAL_MEDIA',
      'SATELLITE',
      'SENSOR_NETWORK',
      'MANUAL_ENTRY',
      'OTHER'
    ],
    
    // Default alert statuses
    statuses: [
      'PENDING',
      'PROCESSING',
      'VERIFIED',
      'FALSE_ALARM',
      'RESOLVED',
      'EXPIRED'
    ],
    
    // Pagination defaults
    pagination: {
      defaultLimit: 20,
      maxLimit: 100
    }
  },
  
  // Environment-specific settings
  environment: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    
    // API configuration
    api: {
      basePath: process.env.API_BASE_PATH || '/api',
      version: process.env.API_VERSION || 'v1',
      enableCors: process.env.ENABLE_CORS !== 'false',
      enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false',
      rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
      rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
    },
    
    // Database configuration
    database: {
      url: process.env.DATABASE_URL,
      pool: {
        min: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
        max: parseInt(process.env.DATABASE_POOL_MAX || '10', 10)
      },
      connectionTimeout: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT || '10000', 10),
      acquireTimeout: parseInt(process.env.DATABASE_ACQUIRE_TIMEOUT || '10000', 10)
    },
    
    // Vector search configuration
    vectorSearch: {
      model: process.env.EMBEDDING_MODEL || 'jina-embeddings-v2-base-en',
      dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '768', 10),
      minSimilarity: parseFloat(process.env.MIN_SIMILARITY || '0.7'),
      batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '10', 10)
    },
    
    // Cache configuration
    cache: {
      enabled: process.env.CACHE_ENABLED === 'true',
      ttl: parseInt(process.env.CACHE_TTL || '300', 10), // 5 minutes
      type: process.env.CACHE_TYPE || 'memory', // 'memory' or 'redis'
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379'
    },
    
    // Alert processing
    processing: {
      batchSize: parseInt(process.env.ALERT_BATCH_SIZE || '50', 10),
      maxRetries: parseInt(process.env.ALERT_MAX_RETRIES || '3', 10),
      retryDelay: parseInt(process.env.ALERT_RETRY_DELAY_MS || '60000', 10), // 1 minute
      staleThreshold: parseInt(process.env.ALERT_STALE_THRESHOLD_MS || '3600000', 10) // 1 hour
    },
    
    // External services
    services: {
      // Geocoding service configuration
      geocoding: {
        enabled: process.env.GEOCODING_ENABLED === 'true',
        provider: process.env.GEOCODING_PROVIDER || 'openstreetmap',
        apiKey: process.env.GEOCODING_API_KEY,
        baseUrl: process.env.GEOCODING_BASE_URL || 'https://nominatim.openstreetmap.org'
      },
      
      // Notification service configuration
      notifications: {
        enabled: process.env.NOTIFICATIONS_ENABLED === 'true',
        provider: process.env.NOTIFICATION_PROVIDER || 'console',
        webhookUrl: process.env.NOTIFICATION_WEBHOOK_URL
      }
    },
    
    // Feature flags
    features: {
      enableVectorSearch: process.env.ENABLE_VECTOR_SEARCH !== 'false',
      enableHybridSearch: process.env.ENABLE_HYBRID_SEARCH === 'true',
      enableRealTimeUpdates: process.env.ENABLE_REALTIME_UPDATES !== 'false',
      enableAuditLogging: process.env.ENABLE_AUDIT_LOGGING !== 'false'
    }
  },
  
  // Validation rules
  validation: {
    alert: {
      title: {
        minLength: 3,
        maxLength: 255
      },
      description: {
        minLength: 10,
        maxLength: 10000
      },
      location: {
        minLength: 2,
        maxLength: 255
      },
      source: {
        minLength: 2,
        maxLength: 100
      },
      type: {
        minLength: 2,
        maxLength: 50
      }
    },
    
    search: {
      query: {
        minLength: 1,
        maxLength: 1000
      },
      filters: {
        dateRange: {
          maxDays: 365 // Maximum allowed date range in days
        }
      }
    }
  }
};

// Validate required configuration
const validateConfig = () => {
  const requiredEnvVars = [
    'DATABASE_URL'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
  }
};

// Export configuration
module.exports = {
  ...config,
  validateConfig
};
