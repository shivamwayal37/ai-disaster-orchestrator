/**
 * Day 6 - Response Orchestrator AI Service
 * Integrates vector search with AI plan generation for disaster response
 */

const pino = require('pino');
const { validateResponse, sanitizeQuery } = require('../utils/validation');
const { createCacheKey, getCachedResponse, setCachedResponse } = require('../utils/cache');
const { EnhancedErrorHandler } = require('./errorHandler');
const { aiClient } = require('./aiClient');
const { cacheService } = require('./cacheService');

const logger = pino({ name: 'response-orchestrator' });

// Main Response Orchestrator Service
class OriginalResponseOrchestratorService {
  constructor(options = {}) {
    this.searchService = options.searchService || require('./searchService');
    this.aiClient = aiClient;
    this.aiProvider = process.env.AI_PROVIDER || 'moonshot';
    this.cacheEnabled = options.cacheEnabled !== false;
    this.cacheTtl = options.cacheTtl || 3600; // 1 hour
    this.cacheService = cacheService;
    
    // Response templates for different disaster types
    this.responseTemplates = {
      wildfire: {
        urgencyLevel: 'HIGH',
        keyResources: ['Fire trucks', 'Helicopters', 'Medical teams', 'Evacuation buses'],
        commonActions: ['Establish evacuation zones', 'Deploy aerial units', 'Set up medical stations']
      },
      flood: {
        urgencyLevel: 'HIGH',
        keyResources: ['Rescue boats', 'Pumps', 'Sandbags', 'Medical supplies'],
        commonActions: ['Assess water levels', 'Deploy rescue teams', 'Establish shelters']
      },
      earthquake: {
        urgencyLevel: 'CRITICAL',
        keyResources: ['Search teams', 'Medical units', 'Heavy equipment', 'Emergency shelters'],
        commonActions: ['Search and rescue', 'Medical triage', 'Infrastructure assessment']
      },
      cyclone: {
        urgencyLevel: 'HIGH',
        keyResources: ['Shelters', 'Communication systems', 'Medical teams', 'Relief supplies'],
        commonActions: ['Mass evacuation', 'Secure infrastructure', 'Establish communication']
      }
    };
  }

  /**
   * Main orchestration method
   */
  async generateActionPlan(queryData) {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // 1. Validate and sanitize input
      const validatedQuery = this.validateInput(queryData);
      
      // 2. Check cache first (Redis-powered caching)
      if (this.cacheEnabled) {
        const cacheKey = this.cacheService.generateCacheKey(
          validatedQuery.query,
          validatedQuery.type,
          validatedQuery.location,
          validatedQuery.severity
        );
        
        let cachedResult = await this.cacheService.get(cacheKey);
        
        // If exact match not found, try to find similar cached plans
        if (!cachedResult) {
          cachedResult = await this.cacheService.findSimilar(
            validatedQuery.query,
            validatedQuery.type,
            validatedQuery.location
          );
        }
        
        if (cachedResult) {
          logger.info({ requestId, cached: true, cacheKey }, 'Returning cached action plan');
          return {
            ...cachedResult,
            metadata: {
              ...cachedResult.metadata,
              cached: true,
              requestId,
              cache_hit: true
            }
          };
        }
      }

      // 3. Retrieve similar incidents from vector search
      const searchResults = await this.retrieveSimilarIncidents(validatedQuery);
      
      // 4. Generate AI response with context
      const actionPlan = await this.generateAIPlan(validatedQuery, searchResults);
      
      // 5. Enhance and validate response
      const enhancedPlan = this.enhanceResponse(actionPlan, validatedQuery);
      
      // 6. Add metadata and cache result
      const finalResponse = {
        ...enhancedPlan,
        metadata: {
          requestId,
          query: validatedQuery,
          similarIncidentsFound: searchResults.length,
          aiProvider: this.aiProvider,
          processingTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          cached: false
        }
      };

      // Cache the response (Redis-powered caching)
      if (this.cacheEnabled) {
        const cacheKey = this.cacheService.generateCacheKey(
          validatedQuery.query,
          validatedQuery.type,
          validatedQuery.location,
          validatedQuery.severity
        );
        await this.cacheService.set(cacheKey, finalResponse, this.cacheTtl);
      }

      logger.info({
        requestId,
        processingTime: finalResponse.metadata.processingTime,
        incidentsFound: searchResults.length
      }, 'Action plan generated successfully');

      return finalResponse;

    } catch (error) {
      logger.error({
        requestId,
        error: error.message,
        query: queryData
      }, 'Action plan generation failed');

      // Return fallback response
      return this.generateFallbackResponse(queryData, error, requestId);
    }
  }

  /**
   * Validate and sanitize input data
   */
  validateInput(queryData) {
    const { query, type, location, severity, metadata = {} } = queryData;
    
    // Required fields validation
    if (!query || typeof query !== 'string') {
      throw new Error('Query is required and must be a string');
    }
    
    if (!type || typeof type !== 'string') {
      throw new Error('Disaster type is required');
    }
    
    if (!location || typeof location !== 'string') {
      throw new Error('Location is required');
    }

    // Validate disaster type
    const validTypes = ['wildfire', 'flood', 'earthquake', 'cyclone', 'heatwave', 'landslide', 'other'];
    const normalizedType = type.toLowerCase();
    if (!validTypes.includes(normalizedType)) {
      logger.warn({ type: normalizedType }, 'Unknown disaster type, using "other"');
    }

    // Sanitize and normalize
    return {
      query: sanitizeQuery(query),
      type: normalizedType,
      location: location.trim(),
      severity: severity || 'moderate',
      metadata: metadata || {}
    };
  }

  /**
   * Retrieve similar incidents using vector search
   */
  async retrieveSimilarIncidents(queryData) {
    try {
      const searchQuery = `${queryData.query} ${queryData.type} ${queryData.location}`;
      
      // Use your existing vector search service
      const searchOptions = {
        limit: 5,
        threshold: 0.5,
        filters: {
          type: queryData.type,
          category: 'incident' // Focus on actual incidents, not protocols
        }
      };

      const results = await this.searchService.hybridSearch(searchQuery, searchOptions);
      
      logger.info({
        query: searchQuery,
        resultsFound: results.length
      }, 'Retrieved similar incidents');

      return results.map(result => ({
        id: result.id,
        title: result.title,
        summary: result.content ? result.content.substring(0, 300) + '...' : result.title,
        type: result.alert_type || result.type,
        location: result.location,
        severity: result.severity,
        date: result.created_at,
        score: result.combinedScore || result.score || 0.5
      }));

    } catch (error) {
      logger.error({ error: error.message }, 'Failed to retrieve similar incidents');
      return []; // Return empty array to continue with plan generation
    }
  }

  /**
   * Generate AI action plan using retrieved context
   */
  async generateAIPlan(queryData, similarIncidents) {
    const template = this.responseTemplates[queryData.type] || this.responseTemplates.wildfire;
    
    const contextSummary = similarIncidents.length > 0 
      ? similarIncidents.map(incident => 
          `- ${incident.title} (${incident.location}, severity: ${incident.severity}): ${incident.summary}`
        ).join('\n')
      : 'No similar incidents found in database.';

    const prompt = this.buildPrompt(queryData, contextSummary, template);
    
    try {
      const rawResponse = await this.aiClient.generateResponse(prompt, {
        maxTokens: 1200,
        temperature: 0.3
      });

      // Parse and validate JSON response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(rawResponse);
      } catch (parseError) {
        logger.error({ rawResponse }, 'Failed to parse AI response as JSON');
        throw new Error('AI response is not valid JSON');
      }

      // Validate response structure
      const validatedResponse = this.validateAIResponse(parsedResponse);
      
      return validatedResponse;

    } catch (error) {
      logger.error({ error: error.message }, 'AI plan generation failed');
      throw error;
    }
  }

  /**
   * Build structured prompt for AI
   */
  buildPrompt(queryData, contextSummary, template) {
    return `
You are a disaster response AI coordinator. Generate a structured action plan for the following scenario:

**Current Situation:**
- Disaster Type: ${queryData.type}
- Location: ${queryData.location}
- Query: ${queryData.query}
- Severity: ${queryData.severity}

**Similar Past Incidents:**
${contextSummary}

**Instructions:**
Generate a comprehensive disaster response plan in strict JSON format with the following structure:

{
  "situation_assessment": {
    "summary": "Brief assessment of the current situation",
    "risk_level": "LOW|MODERATE|HIGH|CRITICAL",
    "estimated_impact": "Description of potential impact",
    "time_sensitivity": "IMMEDIATE|URGENT|MODERATE|LOW"
  },
  "immediate_actions": [
    "Action 1: Specific immediate action",
    "Action 2: Another immediate action",
    "Action 3: Third immediate action"
  ],
  "resource_requirements": {
    "personnel": ["Emergency responders", "Medical teams"],
    "equipment": ["Equipment item 1", "Equipment item 2"],
    "facilities": ["Shelter", "Command center"],
    "estimated_cost": "Rough cost estimate if applicable"
  },
  "timeline": {
    "immediate": ["0-1 hour actions"],
    "short_term": ["1-6 hour actions"], 
    "medium_term": ["6-24 hour actions"]
  },
  "coordination": {
    "primary_agencies": ["Agency 1", "Agency 2"],
    "communication_plan": "How agencies will coordinate",
    "public_information": "Key messages for public"
  },
  "contingency_plans": [
    "Plan A: If situation escalates",
    "Plan B: If resources are insufficient"
  ],
  "success_metrics": [
    "Metric 1: How to measure success",
    "Metric 2: Another success indicator"
  ]
}

**Context Guidelines:**
- Base recommendations on similar past incidents when available
- Consider the specific disaster type: ${queryData.type}
- Account for location-specific factors: ${queryData.location}
- Prioritize life safety above all else
- Be specific and actionable in all recommendations

Respond with only the JSON object, no additional text.
    `.trim();
  }

  /**
   * Validate AI response structure
   */
  validateAIResponse(response) {
    const requiredFields = [
      'situation_assessment',
      'immediate_actions',
      'resource_requirements',
      'timeline',
      'coordination'
    ];

    for (const field of requiredFields) {
      if (!response[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate situation_assessment
    const assessment = response.situation_assessment;
    if (!assessment.summary || !assessment.risk_level) {
      throw new Error('situation_assessment must have summary and risk_level');
    }

    // Validate arrays
    if (!Array.isArray(response.immediate_actions) || response.immediate_actions.length === 0) {
      throw new Error('immediate_actions must be a non-empty array');
    }

    return response;
  }

  /**
   * Enhance response with templates and best practices
   */
  enhanceResponse(aiResponse, queryData) {
    const template = this.responseTemplates[queryData.type];
    
    if (template) {
      // Add template resources if not specified
      if (!aiResponse.resource_requirements.equipment || aiResponse.resource_requirements.equipment.length === 0) {
        aiResponse.resource_requirements.equipment = template.keyResources;
      }
      
      // Ensure urgency level is appropriate
      if (!aiResponse.situation_assessment.risk_level) {
        aiResponse.situation_assessment.risk_level = template.urgencyLevel;
      }
    }

    // Add confidence score based on available context
    aiResponse.confidence_score = this.calculateConfidenceScore(queryData, aiResponse);
    
    return aiResponse;
  }

  /**
   * Calculate confidence score based on available data
   */
  calculateConfidenceScore(queryData, response) {
    let score = 0.5; // Base score
    
    // Higher confidence if we have template for this disaster type
    if (this.responseTemplates[queryData.type]) {
      score += 0.2;
    }
    
    // Higher confidence if response has all required fields
    if (response.situation_assessment && response.immediate_actions && response.resource_requirements) {
      score += 0.2;
    }
    
    // Higher confidence if immediate actions are specific
    if (response.immediate_actions && response.immediate_actions.length >= 3) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Generate fallback response when AI fails
   */
  generateFallbackResponse(queryData, error, requestId) {
    const template = this.responseTemplates[queryData.type] || this.responseTemplates.wildfire;
    
    logger.warn({
      requestId,
      error: error.message
    }, 'Using fallback response template');

    return {
      situation_assessment: {
        summary: `${queryData.type} incident reported in ${queryData.location}. Using fallback response due to AI processing error.`,
        risk_level: template.urgencyLevel,
        estimated_impact: 'Impact assessment pending',
        time_sensitivity: 'URGENT'
      },
      immediate_actions: [
        'Establish incident command center',
        'Deploy emergency response teams',
        'Assess immediate risks to public safety',
        'Activate emergency communication protocols'
      ],
      resource_requirements: {
        personnel: ['Emergency responders', 'Incident commander'],
        equipment: template.keyResources,
        facilities: ['Command center', 'Communication hub']
      },
      timeline: {
        immediate: ['Establish command', 'Deploy initial response'],
        short_term: ['Detailed assessment', 'Resource mobilization'],
        medium_term: ['Extended operations', 'Recovery planning']
      },
      coordination: {
        primary_agencies: ['Emergency Management', 'Fire Department', 'Police'],
        communication_plan: 'Establish unified command structure',
        public_information: 'Follow local emergency alerts'
      },
      contingency_plans: [
        'Escalate resources if needed',
        'Coordinate with neighboring jurisdictions'
      ],
      success_metrics: [
        'Zero casualties',
        'Effective resource deployment',
        'Clear public communication'
      ],
      confidence_score: 0.3,
      fallback_reason: 'AI processing error',
      metadata: {
        requestId,
        query: queryData,
        error: error.message,
        aiProvider: this.aiProvider,
        timestamp: new Date().toISOString(),
        fallback: true
      }
    };
  }

  /**
   * Health check for the orchestrator service
   */
  async healthCheck() {
    try {
      // Test AI client
      await this.aiClient.generateResponse('Test prompt: {"test": true}', { maxTokens: 50 });
      
      // Test search service
      await this.searchService.hybridSearch('test query', { limit: 1 });
      
      return {
        status: 'healthy',
        aiProvider: this.aiProvider,
        searchService: 'connected',
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        aiProvider: this.aiProvider,
        timestamp: new Date().toISOString()
      };
    }
  }
}

const responseOrchestrator = new OriginalResponseOrchestratorService();

module.exports = {
  responseOrchestrator,
  OriginalResponseOrchestratorService
};
