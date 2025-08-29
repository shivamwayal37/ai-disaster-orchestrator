/**
 * Data Normalization Service - Day 3
 * Converts various data sources into common schema
 */

const pino = require('pino');
const logger = pino({ name: 'normalize' });

/**
 * Common schema for normalized alerts:
 * {
 *   "id": "uuid",
 *   "source": "weather | twitter | satellite",
 *   "timestamp": "2025-08-22T18:00:00Z", 
 *   "text": "Heavy rainfall alert for Mumbai...",
 *   "location": { "lat": 19.076, "lng": 72.877 },
 *   "meta": { "severity": "high" }
 * }
 */

function normalizeWeatherAlert(weatherData) {
  return {
    id: weatherData.id,
    source: 'weather',
    timestamp: weatherData.effective,
    text: `${weatherData.headline}\n\n${weatherData.description}`,
    location: {
      lat: weatherData.coordinates.lat,
      lng: weatherData.coordinates.lng
    },
    meta: {
      severity: weatherData.severity.toLowerCase(),
      event_type: weatherData.event.toLowerCase().replace(' ', '_'),
      urgency: weatherData.urgency.toLowerCase(),
      certainty: weatherData.certainty.toLowerCase(),
      areas: weatherData.areas,
      expires: weatherData.expires,
      sender: weatherData.senderName,
      web_url: weatherData.web
    }
  };
}

function normalizeTwitterAlert(twitterData) {
  return {
    id: twitterData.id,
    source: 'twitter',
    timestamp: twitterData.timestamp,
    text: twitterData.text,
    location: {
      lat: twitterData.coordinates.lat,
      lng: twitterData.coordinates.lng
    },
    meta: {
      severity: inferSeverityFromSocial(twitterData.text),
      user: twitterData.user,
      location_name: twitterData.location,
      hashtags: twitterData.hashtags,
      engagement: {
        retweets: twitterData.retweets,
        likes: twitterData.likes
      },
      verified: twitterData.verified,
      disaster_type: inferDisasterTypeFromText(twitterData.text)
    }
  };
}

function normalizeSatelliteData(satelliteData) {
  const props = satelliteData.properties;
  const coords = satelliteData.geometry.type === 'Point' 
    ? satelliteData.geometry.coordinates 
    : getCentroid(satelliteData.geometry.coordinates[0]);

  return {
    id: props.id,
    source: 'satellite',
    timestamp: props.timestamp,
    text: `${props.event_type.replace('_', ' ').toUpperCase()}: ${props.description}`,
    location: {
      lat: coords[1], // GeoJSON is [lng, lat]
      lng: coords[0]
    },
    meta: {
      severity: props.severity,
      confidence: props.confidence,
      event_type: props.event_type,
      source_satellite: props.source,
      affected_area_km2: props.affected_area_km2,
      population_at_risk: props.population_at_risk,
      wind_speed_kmph: props.wind_speed_kmph,
      fire_radiative_power: props.fire_radiative_power,
      geometry_type: satelliteData.geometry.type
    }
  };
}

function normalizeProtocolDocument(protocolData) {
  return {
    id: protocolData.id,
    source: 'protocol',
    timestamp: new Date().toISOString(),
    text: `${protocolData.title}\n\n${protocolData.content}`,
    location: null, // Protocols are generally location-agnostic
    meta: {
      severity: 'reference', // Protocols are reference material
      disaster_type: protocolData.disaster_type,
      category: protocolData.category,
      authority: protocolData.authority,
      version: protocolData.version,
      last_updated: protocolData.last_updated,
      document_type: 'protocol'
    }
  };
}

// Helper functions
function inferSeverityFromSocial(text) {
  const lowerText = text.toLowerCase();
  if (lowerText.includes('urgent') || lowerText.includes('emergency') || lowerText.includes('🚨')) return 'high';
  if (lowerText.includes('warning') || lowerText.includes('alert')) return 'moderate';
  if (lowerText.includes('watch') || lowerText.includes('advisory')) return 'low';
  return 'moderate';
}

function inferDisasterTypeFromText(text) {
  const lowerText = text.toLowerCase();
  const types = {
    'flood': ['flood', 'flooding', 'waterlogged', 'overflow', 'rainfall'],
    'cyclone': ['cyclone', 'hurricane', 'storm', 'wind'],
    'earthquake': ['earthquake', 'seismic', 'tremor'],
    'wildfire': ['fire', 'wildfire', 'blaze', 'smoke'],
    'landslide': ['landslide', 'mudslide', 'slope'],
    'heatwave': ['heat', 'temperature', 'hot']
  };

  for (const [type, keywords] of Object.entries(types)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return type;
    }
  }
  return 'other';
}

function getCentroid(coordinates) {
  // Calculate centroid of polygon
  let lat = 0, lng = 0;
  coordinates.forEach(coord => {
    lng += coord[0];
    lat += coord[1];
  });
  return [lng / coordinates.length, lat / coordinates.length];
}

function normalizeAlert(rawData, sourceType) {
  try {
    let normalized;
    
    switch (sourceType) {
      case 'weather':
        normalized = normalizeWeatherAlert(rawData);
        break;
      case 'twitter':
        normalized = normalizeTwitterAlert(rawData);
        break;
      case 'satellite':
        normalized = normalizeSatelliteData(rawData);
        break;
      case 'protocol':
        normalized = normalizeProtocolDocument(rawData);
        break;
      default:
        throw new Error(`Unknown source type: ${sourceType}`);
    }

    // Add processing metadata
    normalized.processed_at = new Date().toISOString();
    normalized.normalized_by = 'disaster-orchestrator-v1';

    logger.info({ 
      id: normalized.id, 
      source: normalized.source,
      textLength: normalized.text.length 
    }, 'Alert normalized successfully');

    return normalized;

  } catch (error) {
    logger.error(error, 'Failed to normalize alert');
    throw error;
  }
}

module.exports = {
  normalizeAlert,
  normalizeWeatherData: normalizeWeatherAlert,
  normalizeTwitterData: normalizeTwitterAlert,
  normalizeSatelliteData,
  normalizeProtocolData: normalizeProtocolDocument
};
