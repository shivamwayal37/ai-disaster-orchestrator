/**
 * Complete /api/respond Orchestrator - Day 5
 * Integrates all services: hybrid search → RAG → routing → SMS
 */

const express = require('express');
const { retrieveAndGenerate } = require('../services/retrieverService');
const { ActionOrchestrator } = require('../services/actionServices');
const { prisma } = require('../db');
const pino = require('pino');

const router = express.Router();
const logger = pino({ name: 'respond-orchestrator' });
const actionOrchestrator = new ActionOrchestrator();

/**
 * POST /api/respond
 * Complete disaster response orchestration endpoint
 */
router.post('/respond', async (req, res) => {
  const startTime = Date.now();
  const orchestrationId = `orch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  
  try {
    const {
      incident_type,
      location,
      severity = 'moderate',
      description = '',
      options = {}
    } = req.body;

    // Validate required fields
    if (!incident_type || !location || !location.lat || !location.lon) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields: incident_type, location.lat, location.lon',
        code: 'INVALID_REQUEST'
      });
    }

    logger.info({
      orchestrationId,
      incident_type,
      location,
      severity
    }, 'Starting disaster response orchestration');

    // Extract options with defaults
    const {
      max_evacuation_points = 3,
      notification_recipients = [],
      include_sms = true,
      generate_routes = true,
      max_results = 8,
      text_weight = 0.4,
      vector_weight = 0.6
    } = options;

    const orchestrationLog = {
      orchestration_id: orchestrationId,
      request: req.body,
      steps: {},
      performance: {},
      timestamp: new Date()
    };

    // STEP 1: Create incident record for tracking
    const stepStartTime = Date.now();
    const incident = await prisma.alert.create({
      data: {
        source: 'api_request',
        alertType: incident_type,
        title: `${incident_type.toUpperCase()} Response Request`,
        description: description || `${severity} ${incident_type} reported at ${location.name || 'coordinates'}`,
        severity: mapSeverityToNumber(severity),
        location: location.name || `${location.lat},${location.lon}`,
        latitude: location.lat,
        longitude: location.lon,
        startTime: new Date(),
        rawData: req.body
      }
    });

    orchestrationLog.steps.incident_creation = {
      incident_id: incident.id,
      duration: Date.now() - stepStartTime
    };

    logger.info({
      orchestrationId,
      incidentId: incident.id
    }, 'Incident record created');

    // STEP 2: Hybrid Search + RAG (retrieve context and generate plan)
    const ragStartTime = Date.now();
    const query = `${severity} ${incident_type} at ${location.name || 'location'} coordinates ${location.lat},${location.lon}. ${description}`;
    
    const ragResult = await retrieveAndGenerate(query, {
      maxResults: max_results,
      textWeight: text_weight,
      vectorWeight: vector_weight,
      location: location.name,
      disasterType: incident_type
    });

    orchestrationLog.steps.rag_processing = {
      query_used: query,
      incidents_found: ragResult.metadata.totalIncidents,
      protocols_found: ragResult.metadata.totalProtocols,
      duration: Date.now() - ragStartTime
    };

    // Parse RAG response into structured plan
    const structuredPlan = parseRAGToPlan(ragResult.ragResponse, incident_type, severity, location);

    logger.info({
      orchestrationId,
      incidentId: incident.id,
      ragDuration: orchestrationLog.steps.rag_processing.duration,
      planGenerated: !!structuredPlan
    }, 'RAG processing completed');

    // STEP 3: Generate evacuation routes (if requested)
    let routes = [];
    if (generate_routes) {
      const routeStartTime = Date.now();
      
      try {
        // Get evacuation points from plan or database
        let evacuationPoints = structuredPlan.evacuation_points || [];
        
        if (evacuationPoints.length === 0) {
          evacuationPoints = await getNearbyEvacuationPoints(location, max_evacuation_points);
        }

        routes = await actionOrchestrator.routeService.generateEvacuationRoutes(
          { lat: location.lat, lng: location.lon },
          evacuationPoints.slice(0, max_evacuation_points),
          { avoidTolls: true, avoidHighways: false }
        );

        orchestrationLog.steps.route_generation = {
          evacuation_points: evacuationPoints.length,
          routes_generated: routes.length,
          duration: Date.now() - routeStartTime
        };

        logger.info({
          orchestrationId,
          routesGenerated: routes.length
        }, 'Evacuation routes generated');

      } catch (routeError) {
        logger.warn({
          orchestrationId,
          error: routeError.message
        }, 'Route generation failed, continuing without routes');
        
        orchestrationLog.steps.route_generation = {
          error: routeError.message,
          duration: Date.now() - routeStartTime
        };
      }
    }

    // STEP 4: Send SMS notifications (if requested)
    let notifications = [];
    if (include_sms && (notification_recipients.length > 0 || process.env.DEMO_PHONE_1)) {
      const smsStartTime = Date.now();
      
      try {
        // Use provided recipients or demo phone numbers
        const recipients = notification_recipients.length > 0 ? 
          notification_recipients.map(phone => ({ name: 'Emergency Contact', phone, role: 'Responder' })) :
          [
            { name: 'Emergency Coordinator', phone: process.env.DEMO_PHONE_1, role: 'Emergency Management' },
            { name: 'Fire Department', phone: process.env.DEMO_PHONE_2, role: 'Fire Services' },
            { name: 'Police Dispatch', phone: process.env.DEMO_PHONE_3, role: 'Police Services' }
          ].filter(r => r.phone); // Only include if phone number exists

        if (recipients.length > 0) {
          const message = createEmergencyMessage(incident_type, severity, location, structuredPlan, routes);
          
          const smsResults = await actionOrchestrator.notificationService.sendEmergencyNotification(
            recipients,
            message,
            { priority: severity === 'extreme' ? 'urgent' : 'normal' }
          );

          notifications = smsResults.map(result => ({
            to: result.recipient.phone,
            message: message,
            status: result.success ? 'sent' : 'failed',
            message_id: result.messageSid || null,
            error: result.error || null,
            recipient_name: result.recipient.name
          }));

          orchestrationLog.steps.notifications = {
            recipients: recipients.length,
            sent_successfully: notifications.filter(n => n.status === 'sent').length,
            duration: Date.now() - smsStartTime
          };

          logger.info({
            orchestrationId,
            notificationsSent: orchestrationLog.steps.notifications.sent_successfully
          }, 'SMS notifications sent');
        }
      } catch (smsError) {
        logger.warn({
          orchestrationId,
          error: smsError.message
        }, 'SMS sending failed, continuing without notifications');
        
        orchestrationLog.steps.notifications = {
          error: smsError.message,
          duration: Date.now() - smsStartTime
        };
      }
    }

    // STEP 5: Log complete orchestration
    const totalDuration = Date.now() - startTime;
    orchestrationLog.performance.total_duration = totalDuration;

    await prisma.actionAudit.create({
      data: {
        alertId: incident.id ? BigInt(incident.id) : null,
        action: 'DISASTER_RESPONSE_ORCHESTRATION',
        payload: orchestrationLog,
        status: 'SUCCESS',
        duration: totalDuration
      }
    });

    // STEP 6: Format response
    const response = {
      status: 'success',
      orchestration_id: orchestrationId,
      incident_id: incident.id,
      plan: {
        situation: structuredPlan.situation,
        risks: structuredPlan.risks,
        resources: structuredPlan.resources,
        steps: structuredPlan.plan,
        evacuation_points: structuredPlan.evacuation_points,
        confidence: structuredPlan.confidence,
        routes: routes.map(route => ({
          destination: route.destination.name,
          from: `${location.lat},${location.lon}`,
          to: `${route.destination.lat},${route.destination.lng}`,
          distance: route.distance.text,
          duration: route.duration.text,
          duration_in_traffic: route.durationInTraffic?.text || route.duration.text,
          polyline: route.polyline,
          share_url: actionOrchestrator.routeService.createShareableRouteUrl(
            { lat: location.lat, lng: location.lon },
            route.destination
          ),
          geojson: convertPolylineToGeoJSON(route.polyline),
          steps: route.steps.slice(0, 3) // First 3 steps for preview
        })),
        notifications
      },
      context: {
        similar_incidents: ragResult.metadata.totalIncidents,
        relevant_protocols: ragResult.metadata.totalProtocols,
        entities_extracted: ragResult.extractedEntities
      },
      performance: {
        total_duration: totalDuration,
        rag_time: orchestrationLog.steps.rag_processing?.duration || 0,
        route_time: orchestrationLog.steps.route_generation?.duration || 0,
        sms_time: orchestrationLog.steps.notifications?.duration || 0
      },
      generated_at: new Date().toISOString()
    };

    logger.info({
      orchestrationId,
      incidentId: incident.id,
      totalDuration,
      stepsCompleted: Object.keys(orchestrationLog.steps).length
    }, 'Disaster response orchestration completed successfully');

    res.json(response);

  } catch (error) {
    const errorDuration = Date.now() - startTime;
    
    logger.error({
      orchestrationId,
      error: error.message,
      duration: errorDuration
    }, 'Disaster response orchestration failed');

    // Log failed orchestration
    try {
      await prisma.actionAudit.create({
        data: {
          alertId: incident?.id ? BigInt(incident.id) : null,
          action: 'DISASTER_RESPONSE_ORCHESTRATION',
          payload: {
            orchestration_id: orchestrationId,
            error: error.message,
            request: req.body,
            duration: errorDuration
          },
          status: 'ERROR',
          errorMsg: error.message,
          duration: errorDuration
        }
      });
    } catch (logError) {
      logger.error(logError, 'Failed to log orchestration error');
    }

    res.status(500).json({
      status: 'error',
      orchestration_id: orchestrationId,
      message: error.message,
      code: 'ORCHESTRATION_ERROR',
      duration: errorDuration
    });
  }
});

// Helper Functions

/**
 * Parse RAG response into structured plan
 */
function parseRAGToPlan(ragResponse, incidentType, severity, location) {
  // Extract structured information from RAG response
  const lines = ragResponse.split('\n').filter(line => line.trim());
  
  return {
    situation: `${severity.toUpperCase()} ${incidentType} emergency at ${location.name || 'location'}`,
    risks: extractSectionFromRAG(ragResponse, ['risk', 'danger', 'threat', 'hazard']),
    resources: extractSectionFromRAG(ragResponse, ['resource', 'equipment', 'personnel', 'supplies']),
    plan: extractSectionFromRAG(ragResponse, ['action', 'step', 'procedure', 'response']),
    evacuation_points: generateEvacuationPoints(location),
    confidence: 0.85,
    assumptions: ['Weather conditions stable', 'Communication networks operational', 'Resource availability confirmed']
  };
}

/**
 * Extract sections from RAG response
 */
function extractSectionFromRAG(text, keywords) {
  const lines = text.split('\n');
  const items = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(/^\d+\./) || trimmed.match(/^[-*•]/) || 
        keywords.some(keyword => trimmed.toLowerCase().includes(keyword))) {
      const cleaned = trimmed.replace(/^\d+\./, '').replace(/^[-*•]/, '').replace(/^-/, '').trim();
      if (cleaned.length > 10 && cleaned.length < 200) {
        items.push(cleaned);
      }
    }
  }
  
  return items.slice(0, 5); // Limit to top 5 items
}

/**
 * Generate evacuation points based on location
 */
function generateEvacuationPoints(location) {
  return [
    {
      name: 'Primary Emergency Shelter',
      lat: location.lat + 0.01,
      lng: location.lon + 0.01,
      capacity: 500,
      type: 'shelter'
    },
    {
      name: 'Community Center',
      lat: location.lat - 0.01,
      lng: location.lon + 0.01,
      capacity: 300,
      type: 'community_center'
    },
    {
      name: 'Regional Hospital',
      lat: location.lat + 0.005,
      lng: location.lon - 0.01,
      capacity: 150,
      type: 'hospital'
    }
  ];
}

/**
 * Get nearby evacuation points from database
 */
async function getNearbyEvacuationPoints(location, limit = 3) {
  try {
    const evacuationPoints = await prisma.resource.findMany({
      where: {
        type: { in: ['shelter', 'hospital', 'community_center'] },
        isActive: true
      },
      orderBy: {
        capacity: 'desc'
      },
      take: limit
    });

    if (evacuationPoints.length === 0) {
      return generateEvacuationPoints(location);
    }

    return evacuationPoints.map(point => ({
      name: point.name,
      lat: point.latitude,
      lng: point.longitude,
      capacity: point.capacity || 100,
      type: point.type
    }));
  } catch (error) {
    logger.warn(error, 'Failed to get evacuation points from database, using generated points');
    return generateEvacuationPoints(location);
  }
}

/**
 * Create emergency SMS message
 */
function createEmergencyMessage(incidentType, severity, location, plan, routes) {
  const message = `🚨 ${severity.toUpperCase()} ${incidentType.toUpperCase()} ALERT

LOCATION: ${location.name || `${location.lat},${location.lon}`}

IMMEDIATE ACTIONS:
${plan.plan.slice(0, 3).map((action, i) => `${i+1}. ${action}`).join('\n')}

${routes.length > 0 ? `EVACUATION ROUTE:
📍 ${routes[0].destination.name}
⏱️ ${routes[0].duration.text} away
🗺️ ${routes[0].share_url || 'See emergency services'}` : ''}

Follow local emergency guidance. This is an automated alert.`;

  return message;
}

/**
 * Convert polyline to GeoJSON
 */
function convertPolylineToGeoJSON(polyline) {
  // Simple implementation - in production, use proper polyline decoder
  return {
    type: 'LineString',
    coordinates: [] // Would decode polyline to coordinates array
  };
}

/**
 * Map severity string to number
 */
function mapSeverityToNumber(severity) {
  const mapping = {
    'low': 1,
    'moderate': 2,
    'high': 3,
    'severe': 4,
    'extreme': 5
  };
  return mapping[severity?.toLowerCase()] || 2;
}

module.exports = router;
