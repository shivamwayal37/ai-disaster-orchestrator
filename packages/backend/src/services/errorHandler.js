/**
 * Day 7 - Enhanced Error Handling & Fallback System
 * Comprehensive error recovery and circuit breaker patterns
 */

const pino = require('pino');
const { performance } = require('perf_hooks');
const Ajv = require('ajv');
const ajv = new Ajv();

const logger = pino({ name: 'error-handler' });

// Circuit breaker states
const CircuitState = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Failing, using fallbacks
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

/**
 * Circuit Breaker for external services
 */
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = 0;
    
    // Configuration
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 30000; // 30 seconds
    this.successThreshold = options.successThreshold || 3;
    this.monitorWindow = options.monitorWindow || 60000; // 1 minute
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      circuitOpenCount: 0,
      lastStateChange: Date.now()
    };
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute(operation, fallback = null) {
    this.stats.totalRequests++;

    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        this.stats.circuitOpenCount++;
        logger.warn({ circuit: this.name }, 'Circuit breaker OPEN, using fallback');
        
        if (fallback) {
          return await fallback();
        }
        throw new Error(`Circuit breaker OPEN for ${this.name}`);
      } else {
        this.state = CircuitState.HALF_OPEN;
        logger.info({ circuit: this.name }, 'Circuit breaker HALF_OPEN, testing service');
      }
    }

    try {
      const startTime = performance.now();
      const result = await operation();
      const duration = performance.now() - startTime;

      // Success handling
      this.onSuccess(duration);
      return result;

    } catch (error) {
      // Failure handling
      this.onFailure(error);
      
      if (fallback) {
        logger.warn({ 
          circuit: this.name, 
          error: error.message 
        }, 'Operation failed, using fallback');
        return await fallback();
      }
      
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  onSuccess(duration) {
    this.stats.successCount++;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.failureCount = 0;
      this.state = CircuitState.CLOSED;
      this.stats.lastStateChange = Date.now();
      logger.info({ circuit: this.name }, 'Circuit breaker CLOSED after recovery');
    }
    
    // Reset failure count in closed state if enough time has passed
    if (this.state === CircuitState.CLOSED && this.lastFailureTime && 
        Date.now() - this.lastFailureTime > this.monitorWindow) {
      this.failureCount = 0;
    }

    logger.debug({ 
      circuit: this.name, 
      duration: Math.round(duration),
      state: this.state 
    }, 'Circuit breaker operation succeeded');
  }

  /**
   * Handle failed operation
   */
  onFailure(error) {
    this.stats.failureCount++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold || this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.recoveryTimeout;
      this.stats.lastStateChange = Date.now();
      
      logger.error({ 
        circuit: this.name,
        error: error.message,
        failureCount: this.failureCount,
        nextAttempt: new Date(this.nextAttempt).toISOString()
      }, 'Circuit breaker OPENED');
    } else {
      logger.warn({ 
        circuit: this.name,
        error: error.message,
        failureCount: this.failureCount,
        threshold: this.failureThreshold
      }, 'Circuit breaker failure recorded');
    }
  }

  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt,
      stats: {
        ...this.stats,
        successRate: this.stats.totalRequests > 0 ? 
          (this.stats.successCount / this.stats.totalRequests * 100).toFixed(1) + '%' : '0%'
      }
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = 0;
    // Reset stats but keep a rolling window if needed in a more advanced implementation
    this.stats = {
      ...this.stats, // Keep existing stats and reset counts
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      circuitOpenCount: 0,
      lastStateChange: Date.now()
    };
    logger.info({ circuit: this.name }, 'Circuit breaker reset');
  }
}

/**
 * Enhanced Error Handler with multiple fallback strategies
 */
class EnhancedErrorHandler {
  constructor() {
    // Circuit breakers for different services
    this.circuits = {
      aiGeneration: new CircuitBreaker('AI_GENERATION', {
        failureThreshold: 3,
        recoveryTimeout: 20000,
        monitorWindow: 120000
      }),
      vectorSearch: new CircuitBreaker('VECTOR_SEARCH', {
        failureThreshold: 5,
        recoveryTimeout: 10000,
        monitorWindow: 60000
      }),
      cache: new CircuitBreaker('CACHE', {
        failureThreshold: 10,
        recoveryTimeout: 5000,
        monitorWindow: 30000
      })
    };

    // Error classification
    this.errorTypes = {
      TIMEOUT: 'timeout',
      API_LIMIT: 'api_limit',
      NETWORK: 'network',
      VALIDATION: 'validation',
      SYSTEM: 'system'
    };

    // Fallback templates by disaster type
    this.fallbackTemplates = {
      earthquake: {
        immediate_actions: [
          'Activate emergency operations center immediately',
          'Deploy urban search and rescue teams to affected areas',
          'Establish medical triage and casualty collection points',
          'Coordinate with utility companies for infrastructure assessment'
        ],
        resources: {
          personnel: ['USAR teams', 'Medical personnel', 'Structural engineers', 'Communications staff'],
          equipment: ['Heavy rescue equipment', 'Medical supplies', 'Communication systems', 'Generators']
        },
        timeline: {
          immediate: ['Establish command within 15 minutes', 'Deploy first responders within 30 minutes'],
          short_term: ['Complete initial assessment within 2 hours', 'Establish casualty treatment areas']
        }
      },
      wildfire: {
        immediate_actions: [
          'Establish incident command and unified command structure',
          'Deploy initial attack crews and engines',
          'Begin evacuation procedures for threatened areas',
          'Coordinate air resources for suppression and reconnaissance'
        ],
        resources: {
          personnel: ['Fire suppression crews', 'Incident management team', 'Aviation crews', 'Law enforcement'],
          equipment: ['Fire engines', 'Aircraft', 'Bulldozers', 'Communication equipment']
        },
        timeline: {
          immediate: ['Deploy initial attack within 20 minutes', 'Establish evacuation zones'],
          short_term: ['Air resources on scene within 1 hour', 'Complete evacuation of threatened areas']
        }
      },
      flood: {
        immediate_actions: [
          'Monitor water levels and weather conditions continuously',
          'Issue evacuation warnings for flood-prone areas',
          'Deploy swift water rescue teams',
          'Establish emergency shelters and evacuation centers'
        ],
        resources: {
          personnel: ['Swift water rescue specialists', 'Emergency management staff', 'Shelter managers'],
          equipment: ['Rescue boats', 'High water vehicles', 'Emergency shelters', 'Sandbags']
        },
        timeline: {
          immediate: ['Issue warnings within 15 minutes', 'Deploy rescue teams within 45 minutes'],
          short_term: ['Establish all shelters within 2 hours', 'Complete high-risk evacuations']
        }
      },
      cyclone: {
        immediate_actions: [
          'Activate Emergency Operations Center (EOC).',
          'Establish Incident Command and assess the situation.',
          'Issue public safety warnings and evacuation notices as needed.',
          'Deploy first responders to the most critical areas.'
        ],
        resources: {
          personnel: ['Incident Management Team', 'First Responders (Fire, Police, EMS)', 'Public Information Officer'],
          equipment: ['Communication Systems', 'Emergency Vehicles', 'Personal Protective Equipment (PPE)']
        },
        timeline: {
          immediate: ['Establish command within 30 minutes.', 'Issue initial public alert within 15 minutes.'],
          short_term: ['Complete initial damage assessment within 4 hours.', 'Establish contact with mutual aid partners.']
        }
      },
      heatwave: {
        immediate_actions: [
          'Activate Emergency Operations Center (EOC).',
          'Establish Incident Command and assess the situation.',
          'Issue public safety warnings and evacuation notices as needed.',
          'Deploy first responders to the most critical areas.'
        ],
        resources: {
          personnel: ['Incident Management Team', 'First Responders (Fire, Police, EMS)', 'Public Information Officer'],
          equipment: ['Communication Systems', 'Emergency Vehicles', 'Personal Protective Equipment (PPE)']
        },
        timeline: {
          immediate: ['Establish command within 30 minutes.', 'Issue initial public alert within 15 minutes.'],
          short_term: ['Complete initial damage assessment within 4 hours.', 'Establish contact with mutual aid partners.']
        }
      },
      landslide: {
        immediate_actions: [
          'Activate Emergency Operations Center (EOC).',
          'Establish Incident Command and assess the situation.',
          'Issue public safety warnings and evacuation notices as needed.',
          'Deploy first responders to the most critical areas.'
        ],
        resources: {
          personnel: ['Incident Management Team', 'First Responders (Fire, Police, EMS)', 'Public Information Officer'],
          equipment: ['Communication Systems', 'Emergency Vehicles', 'Personal Protective Equipment (PPE)']
        },
        timeline: {
          immediate: ['Establish command within 30 minutes.', 'Issue initial public alert within 15 minutes.'],
          short_term: ['Complete initial damage assessment within 4 hours.', 'Establish contact with mutual aid partners.']
        }
      },
      all_hazard: { // Generic fallback
        immediate_actions: [
            'Activate Emergency Operations Center (EOC).',
            'Establish Incident Command and assess the situation.',
            'Issue public safety warnings and evacuation notices as needed.',
            'Deploy first responders to the most critical areas.'
        ],
        resources: {
            personnel: ['Incident Management Team', 'First Responders (Fire, Police, EMS)', 'Public Information Officer'],
            equipment: ['Communication Systems', 'Emergency Vehicles', 'Personal Protective Equipment (PPE)']
        },
        timeline: {
            immediate: ['Establish command within 30 minutes.', 'Issue initial public alert within 15 minutes.'],
            short_term: ['Complete initial damage assessment within 4 hours.', 'Establish contact with mutual aid partners.']
        }
      }
    };
  }

  /**
   * Classify error type for appropriate handling
   */
  classifyError(error) {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return this.errorTypes.TIMEOUT;
    }
    
    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      return this.errorTypes.API_LIMIT;
    }
    
    if (errorMessage.includes('network') || errorMessage.includes('connection') || 
        errorMessage.includes('enotfound') || errorMessage.includes('econnrefused')) {
      return this.errorTypes.NETWORK;
    }
    
    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      return this.errorTypes.VALIDATION;
    }
    
    return this.errorTypes.SYSTEM;
  }

  /**
   * Generate enhanced fallback response based on error type and context
   */
  generateEnhancedFallback(queryData, error, context = {}) {
    const errorType = this.classifyError(error);
    const template = this.fallbackTemplates[queryData.type] || this.fallbackTemplates.all_hazard;
    
    // Determine risk level based on disaster type and available context
    const riskLevel = this.determineRiskLevel(queryData, context);
    
    const fallbackResponse = {
      situation_assessment: {
        summary: `${queryData.type.charAt(0).toUpperCase() + queryData.type.slice(1)} incident reported in ${queryData.location}. Response plan generated using emergency protocols.`,
        risk_level: riskLevel,
        estimated_impact: this.estimateImpact(queryData.type, queryData.severity),
        time_sensitivity: 'IMMEDIATE'
      },
      immediate_actions: template.immediate_actions,
      resource_requirements: template.resources,
      timeline: template.timeline,
      coordination: {
        primary_agencies: this.getPrimaryAgencies(queryData.type),
        communication_plan: 'Establish unified command structure with clear communication protocols',
        public_information: 'Activate emergency alert systems and provide regular updates to public'
      },
      fallback_info: {
        reason: this.getFallbackReason(errorType),
        error_type: errorType,
        confidence_level: this.calculateFallbackConfidence(queryData, context),
        data_sources: 'Emergency response templates and standard operating procedures'
      }
    };

    return fallbackResponse;
  }

  /**
   * Determine risk level based on disaster type and context
   */
  determineRiskLevel(queryData, context) {
    const { type, severity } = queryData;
    const baseRisk = {
      earthquake: 'CRITICAL',
      wildfire: 'HIGH',
      flood: 'HIGH',
      cyclone: 'HIGH',
      heatwave: 'MODERATE',
      landslide: 'HIGH'
    };

    let risk = baseRisk[type] || 'MODERATE';
    
    // Adjust based on severity
    if (severity === 'critical' || severity === 'severe') {
      risk = 'CRITICAL';
    } else if (severity === 'low') {
      risk = risk === 'CRITICAL' ? 'HIGH' : 'MODERATE';
    }

    return risk;
  }

  /**
   * Estimate impact based on disaster type and severity
   */
  estimateImpact(type, severity) {
    const impacts = {
      earthquake: {
        high: 'Significant structural damage, potential casualties, infrastructure disruption',
        moderate: 'Moderate structural damage, some injuries, utility disruptions',
        low: 'Minor damage, minimal injuries, localized utility issues'
      },
      wildfire: {
        high: 'Rapid fire spread threatening structures, evacuation required, air quality hazardous',
        moderate: 'Controlled fire growth, potential structure threat, smoke advisories',
        low: 'Small contained fire, minimal threat, localized smoke'
      },
      flood: {
        high: 'Major flooding affecting homes and roads, life safety concerns',
        moderate: 'Moderate flooding in low-lying areas, transportation impacts',
        low: 'Minor flooding, primarily drainage and traffic issues'
      },
      cyclone: {
        high: 'Widespread structural damage, high risk of casualties, major infrastructure failure.',
        moderate: 'Roof and structural damage, risk of injury from flying debris, power outages.',
        low: 'Damage to trees and signs, minor roof damage, localized power cuts.'
      },
      heatwave: {
        high: 'Serious risk of heatstroke for entire population, critical strain on power grid and health services.',
        moderate: 'Increased risk of heat-related illness, especially for vulnerable groups; high energy demand.',
        low: 'Discomfort for most people, potential health risk for sensitive individuals.'
      },
      landslide: {
        high: 'Catastrophic failure of slopes, destruction of property and infrastructure, high risk to life.',
        moderate: 'Localized slope failures, potential damage to roads and buildings, evacuation may be needed.',
        low: 'Minor soil movement, minimal risk to structures, transportation delays possible.'
      }
    };

    const severityLevel = severity === 'severe' || severity === 'critical' ? 'high' :
                         severity === 'moderate' || severity === 'high' ? 'moderate' : 'low';
    
    return impacts[type]?.[severityLevel] || 'Impact assessment pending field reports';
  }

  /**
   * Get primary agencies for disaster type
   */
  getPrimaryAgencies(type) {
    const agencies = {
      earthquake: ['Emergency Management', 'Fire Department', 'Urban Search and Rescue', 'Public Health'],
      wildfire: ['Fire Department', 'Forestry Services', 'Emergency Management', 'Law Enforcement'],
      flood: ['Emergency Management', 'Water Management', 'Coast Guard/Rescue Services', 'Public Works'],
      cyclone: ['Emergency Management', 'National Weather Service', 'Coast Guard', 'Transportation'],
      heatwave: ['Public Health', 'Emergency Management', 'Utilities', 'Social Services'],
      landslide: ['Emergency Management', 'Geological Survey', 'Fire Department', 'Transportation']
    };

    return agencies[type] || ['Emergency Management', 'Fire Department', 'Law Enforcement', 'Public Health'];
  }

  /**
   * Get fallback reason description
   */
  getFallbackReason(errorType) {
    const reasons = {
      [this.errorTypes.TIMEOUT]: 'AI response generation timed out, using emergency protocols',
      [this.errorTypes.API_LIMIT]: 'API rate limits reached, using cached emergency procedures',
      [this.errorTypes.NETWORK]: 'Network connectivity issues, using offline emergency templates',
      [this.errorTypes.VALIDATION]: 'Data validation failed, using standard response procedures',
      [this.errorTypes.SYSTEM]: 'System error occurred, using emergency response templates'
    };

    return reasons[errorType] || 'Emergency fallback protocols activated';
  }

  /**
   * Calculate confidence level for fallback response
   */
  calculateFallbackConfidence(queryData, context) {
    let confidence = 0.7; // Base fallback confidence

    // Increase confidence if we have a specific template for this disaster type
    if (this.fallbackTemplates[queryData.type]) {
      confidence += 0.1;
    }

    // Increase confidence if we have location-specific context
    if (context.locationKnown) {
      confidence += 0.05;
    }

    // Increase confidence if severity is specified
    if (queryData.severity && queryData.severity !== 'moderate') {
      confidence += 0.05;
    }

    return Math.min(confidence, 0.85); // Cap at 85% for fallback responses
  }

  /**
   * Handle AI generation errors with progressive fallback
   */
  async handleAIGenerationError(error, queryData, context = {}) {
    logger.error({ 
      error: error.message,
      queryData,
      context 
    }, 'AI generation error, implementing fallback strategy');

    const errorType = this.classifyError(error);
    
    // Try different fallback strategies based on error type
    switch (errorType) {
      case this.errorTypes.TIMEOUT:
        // For timeouts, try a simplified prompt first
        try {
          const simplifiedResponse = await this.trySimplifiedGeneration(queryData);
          if (simplifiedResponse) {
            return { ...simplifiedResponse, fallback_reason: 'simplified_prompt' };
          }
        } catch (retryError) {
          logger.warn({ error: retryError.message }, 'Simplified generation also failed');
        }
        break;
        
      case this.errorTypes.API_LIMIT:
        // For rate limits, wait and retry once
        try {
          await this.sleep(2000); // Wait 2 seconds
          const retryResponse = await this.trySimplifiedGeneration(queryData);
          if (retryResponse) {
            return { ...retryResponse, fallback_reason: 'rate_limit_retry' };
          }
        } catch (retryError) {
          logger.warn({ error: retryError.message }, 'Rate limit retry failed');
        }
        break;
    }

    // Ultimate fallback: use enhanced template
    return this.generateEnhancedFallback(queryData, error, context);
  }

  /**
   * Try simplified AI generation with minimal prompt
   */
  async trySimplifiedGeneration(queryData) {
    const simplePrompt = `
${queryData.type} emergency in ${queryData.location}.
Provide JSON response:
{
  "situation_assessment": {"summary": "brief assessment", "risk_level": "HIGH"},
  "immediate_actions": ["action 1", "action 2", "action 3"],
  "resource_requirements": {"personnel": ["type 1"], "equipment": ["item 1"]}
}`;

    const schema = {
      type: 'object',
      properties: {
        situation_assessment: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            risk_level: { type: 'string' }
          },
          required: ['summary', 'risk_level']
        },
        immediate_actions: { type: 'array', items: { type: 'string' } },
        resource_requirements: {
          type: 'object',
          properties: {
            personnel: { type: 'array', items: { type: 'string' } },
            equipment: { type: 'array', items: { type: 'string' } }
          },
          required: ['personnel', 'equipment']
        }
      },
      required: ['situation_assessment', 'immediate_actions', 'resource_requirements']
    };

    const validate = ajv.compile(schema);

    try {
      const { aiClient } = require('./aiClient');
      const response = await aiClient.generateResponse(simplePrompt, {
        maxTokens: 300,
        temperature: 0.1
      });
      
      const parsedResponse = JSON.parse(response);

      if (!validate(parsedResponse)) {
        logger.warn({ errors: validate.errors }, 'Simplified AI response failed JSON schema validation');
        return null;
      }

      return parsedResponse;
    } catch (error) {
      logger.warn({ error: error.message }, 'Simplified generation failed');
      return null;
    }
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get all circuit breaker statuses
   */
  getCircuitStatus() {
    const status = {};
    for (const [name, circuit] of Object.entries(this.circuits)) {
      status[name] = circuit.getStatus();
    }
    return status;
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuits() {
    for (const circuit of Object.values(this.circuits)) {
      circuit.reset();
    }
    logger.info('All circuit breakers reset');
  }

  /**
   * Health check for error handling system
   */
  async healthCheck() {
    const circuits = this.getCircuitStatus();
    const healthyCircuits = Object.values(circuits).filter(c => c.state === CircuitState.CLOSED).length;
    const totalCircuits = Object.keys(circuits).length;

    return {
      status: healthyCircuits === totalCircuits ? 'healthy' : 'degraded',
      circuits,
      healthy_circuits: healthyCircuits,
      total_circuits: totalCircuits,
      error_types_supported: Object.values(this.errorTypes),
      fallback_templates: Object.keys(this.fallbackTemplates)
    };
  }
}

// Export enhanced error handler
const enhancedErrorHandler = new EnhancedErrorHandler();

module.exports = {
  enhancedErrorHandler,
  CircuitBreaker,
  CircuitState,
  EnhancedErrorHandler
};
