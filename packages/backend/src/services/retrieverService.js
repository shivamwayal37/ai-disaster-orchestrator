/**
 * Retriever Service - Day 4
 * Orchestrates hybrid search and RAG with Kimi API
 */

const { hybridSearch, searchProtocols, searchSimilarIncidents } = require('./searchService');
const { summarizeAlert, extractEntities, generateRAGResponse } = require('./kimiClient');
const { prisma } = require('../db');
const pino = require('pino');

const logger = pino({ name: 'retriever-service' });

/**
 * Main retrieval pipeline that combines search results with RAG
 */
async function retrieveAndGenerate(query, options = {}) {
  const {
    includeProtocols = true,
    includeSimilarIncidents = true,
    maxResults = 10,
    maxProtocols = 3,
    textWeight = 0.4,
    vectorWeight = 0.6,
    location = null,
    disasterType = null
  } = options;

  const startTime = Date.now();
  const retrievalLog = {
    query,
    timestamp: new Date(),
    options,
    results: {},
    performance: {}
  };

  try {
    logger.info({ query, options }, 'Starting retrieval and generation');

    // Step 1: Generate query embedding (mock for now - would use actual embedding service)
    const queryEmbedding = await generateQueryEmbedding(query);
    retrievalLog.performance.embeddingTime = Date.now() - startTime;

    // Step 2: Extract entities from query to improve search
    let extractedEntities = null;
    try {
      extractedEntities = await extractEntities(query);
      retrievalLog.extractedEntities = extractedEntities;
    } catch (error) {
      logger.warn(error, 'Entity extraction failed, continuing with original query');
    }

    // Step 3: Run parallel searches
    const searchStartTime = Date.now();
    const searchPromises = [];

    // Hybrid search for similar incidents
    if (includeSimilarIncidents) {
      searchPromises.push(
        searchSimilarIncidents(query, queryEmbedding, {
          limit: maxResults,
          textWeight,
          vectorWeight,
          location
        }).then(results => ({ type: 'incidents', results }))
      );
    }

    // Protocol search
    if (includeProtocols) {
      const protocolQuery = disasterType || extractedEntities?.disaster_type || query;
      searchPromises.push(
        searchProtocols(protocolQuery, location, maxProtocols)
          .then(results => ({ type: 'protocols', results }))
      );
    }

    const searchResults = await Promise.all(searchPromises);
    retrievalLog.performance.searchTime = Date.now() - searchStartTime;

    // Step 4: Process and combine search results
    const incidents = searchResults.find(r => r.type === 'incidents')?.results || [];
    const protocols = searchResults.find(r => r.type === 'protocols')?.results || [];

    retrievalLog.results = {
      incidents: incidents.length,
      protocols: protocols.length,
      totalRetrieved: incidents.length + protocols.length
    };

    // Step 5: Prepare context for RAG
    const ragContext = prepareRAGContext(incidents, protocols, extractedEntities);
    
    // Step 6: Generate RAG response with Kimi
    const ragStartTime = Date.now();
    let ragResponse = null;
    
    try {
      ragResponse = await generateRAGResponse(query, ragContext);
      retrievalLog.performance.ragTime = Date.now() - ragStartTime;
    } catch (error) {
      logger.error(error, 'RAG generation failed');
      ragResponse = generateFallbackResponse(query, ragContext);
    }

    // Step 7: Log retrieval for analysis
    const totalTime = Date.now() - startTime;
    retrievalLog.performance.totalTime = totalTime;
    retrievalLog.ragResponse = {
      generated: !!ragResponse,
      length: ragResponse?.length || 0
    };

    await logRetrieval(retrievalLog);

    logger.info({
      query,
      incidentsFound: incidents.length,
      protocolsFound: protocols.length,
      totalTime
    }, 'Retrieval and generation completed');

    return {
      query,
      extractedEntities,
      retrievedContext: {
        incidents: incidents.slice(0, 5), // Return top 5 for response
        protocols: protocols.slice(0, 3)  // Return top 3 protocols
      },
      ragResponse,
      metadata: {
        totalIncidents: incidents.length,
        totalProtocols: protocols.length,
        searchTime: retrievalLog.performance.searchTime,
        ragTime: retrievalLog.performance.ragTime,
        totalTime
      }
    };

  } catch (error) {
    logger.error(error, 'Retrieval and generation failed');
    
    // Log failed retrieval
    retrievalLog.error = error.message;
    retrievalLog.performance.totalTime = Date.now() - startTime;
    await logRetrieval(retrievalLog);
    
    throw error;
  }
}

/**
 * Generate query embedding (mock implementation)
 */
async function generateQueryEmbedding(query) {
  // TODO: Replace with actual embedding service call
  // For now, return a mock 768-dimensional embedding
  const mockEmbedding = Array.from({ length: 768 }, () => Math.random() * 2 - 1);
  
  logger.debug({ queryLength: query.length }, 'Generated mock query embedding');
  return mockEmbedding;
}

/**
 * Prepare context for RAG from search results
 */
function prepareRAGContext(incidents, protocols, extractedEntities) {
  const context = {
    query_entities: extractedEntities,
    similar_incidents: incidents.map(incident => ({
      id: incident.id,
      title: incident.title,
      summary: incident.summary || incident.content.substring(0, 200) + '...',
      disaster_type: incident.alert?.alertType || 'unknown',
      severity: incident.alert?.severity || 'unknown',
      location: incident.alert?.location || 'unknown',
      confidence: incident.confidence,
      hybrid_score: incident.hybridScore,
      date: incident.publishedAt
    })),
    relevant_protocols: protocols.map(protocol => ({
      id: protocol.id,
      title: protocol.title,
      summary: protocol.summary || protocol.content.substring(0, 300) + '...',
      key_actions: extractKeyActions(protocol.content),
      authority: protocol.sourceUrl || 'Unknown Authority',
      confidence: protocol.confidence
    }))
  };

  return context;
}

/**
 * Extract key actions from protocol content
 */
function extractKeyActions(content) {
  const actionKeywords = [
    'evacuate', 'shelter', 'contact', 'notify', 'assess', 'deploy',
    'coordinate', 'establish', 'monitor', 'secure', 'provide', 'activate'
  ];
  
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const actions = [];
  
  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    if (actionKeywords.some(keyword => lowerSentence.includes(keyword))) {
      actions.push(sentence.trim());
      if (actions.length >= 5) break;
    }
  }
  
  return actions.length > 0 ? actions : ['Follow established emergency protocols'];
}

/**
 * Generate fallback response when RAG fails
 */
function generateFallbackResponse(query, context) {
  const { similar_incidents, relevant_protocols } = context;
  
  let response = `Based on the query "${query}", here's what I found:\n\n`;
  
  if (similar_incidents.length > 0) {
    response += `**Similar Past Incidents:**\n`;
    similar_incidents.slice(0, 3).forEach((incident, i) => {
      response += `${i + 1}. ${incident.title} (${incident.location})\n`;
      response += `   - Type: ${incident.disaster_type}, Severity: ${incident.severity}\n`;
      response += `   - Summary: ${incident.summary}\n\n`;
    });
  }
  
  if (relevant_protocols.length > 0) {
    response += `**Relevant Response Protocols:**\n`;
    relevant_protocols.forEach((protocol, i) => {
      response += `${i + 1}. ${protocol.title}\n`;
      if (protocol.key_actions.length > 0) {
        response += `   - Key Actions: ${protocol.key_actions.slice(0, 3).join('; ')}\n`;
      }
      response += `\n`;
    });
  }
  
  response += `**Recommended Actions:**\n`;
  response += `- Monitor the situation closely\n`;
  response += `- Follow established emergency protocols\n`;
  response += `- Coordinate with local authorities\n`;
  response += `- Ensure public safety measures are in place\n`;
  
  return response;
}

/**
 * Log retrieval operation for analysis
 */
async function logRetrieval(retrievalLog) {
  try {
    await prisma.actionAudit.create({
      data: {
        action: 'RETRIEVE_RAG',
        payload: retrievalLog,
        status: retrievalLog.error ? 'ERROR' : 'SUCCESS',
        errorMsg: retrievalLog.error || null
      }
    });
    
    logger.debug({ query: retrievalLog.query }, 'Retrieval logged successfully');
  } catch (error) {
    logger.error(error, 'Failed to log retrieval operation');
    // Don't throw - logging failure shouldn't break retrieval
  }
}

/**
 * Retrieve context for a specific disaster type and location
 */
async function retrieveDisasterContext(disasterType, location = null, options = {}) {
  const query = `${disasterType}${location ? ` in ${location}` : ''}`;
  
  return await retrieveAndGenerate(query, {
    ...options,
    disasterType,
    location,
    includeProtocols: true,
    includeSimilarIncidents: true
  });
}

/**
 * Get retrieval statistics
 */
async function getRetrievalStats(timeRange = { hours: 24 }) {
  try {
    const since = new Date(Date.now() - timeRange.hours * 60 * 60 * 1000);
    
    const logs = await prisma.actionAudit.findMany({
      where: {
        action: 'RETRIEVE_RAG',
        createdAt: {
          gte: since
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const stats = {
      totalRetrievals: logs.length,
      successfulRetrievals: logs.filter(log => log.status === 'SUCCESS').length,
      failedRetrievals: logs.filter(log => log.status === 'ERROR').length,
      averageResponseTime: 0,
      topQueries: {},
      performanceMetrics: {
        avgSearchTime: 0,
        avgRagTime: 0,
        avgTotalTime: 0
      }
    };

    if (logs.length > 0) {
      // Calculate performance metrics
      const validLogs = logs.filter(log => log.payload?.performance?.totalTime);
      if (validLogs.length > 0) {
        stats.performanceMetrics.avgTotalTime = validLogs.reduce((sum, log) => 
          sum + log.payload.performance.totalTime, 0) / validLogs.length;
        
        stats.performanceMetrics.avgSearchTime = validLogs.reduce((sum, log) => 
          sum + (log.payload.performance.searchTime || 0), 0) / validLogs.length;
        
        stats.performanceMetrics.avgRagTime = validLogs.reduce((sum, log) => 
          sum + (log.payload.performance.ragTime || 0), 0) / validLogs.length;
      }

      // Count query frequencies
      logs.forEach(log => {
        const query = log.payload?.query;
        if (query) {
          stats.topQueries[query] = (stats.topQueries[query] || 0) + 1;
        }
      });
    }

    return stats;
  } catch (error) {
    logger.error(error, 'Failed to get retrieval stats');
    throw error;
  }
}

module.exports = {
  retrieveAndGenerate,
  retrieveDisasterContext,
  getRetrievalStats,
  prepareRAGContext,
  generateQueryEmbedding,
  logRetrieval
};
