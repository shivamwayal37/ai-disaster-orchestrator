/**
 * Mock data feeds for testing ingestion pipeline
 * Day 3: Data Sources Setup
 */

// Weather alerts mock data
const weatherAlerts = [
  {
    id: "OW_FL_001",
    event: "Flood Warning",
    headline: "Severe Flood Warning for Mumbai Metropolitan Region",
    description: "Heavy rainfall of 150-200mm expected in next 6 hours. Low-lying areas including Dharavi, Kurla, and Andheri East at high risk of flooding. Residents advised to move to higher ground immediately.",
    severity: "Severe",
    urgency: "Immediate",
    certainty: "Likely",
    areas: ["Mumbai", "Thane", "Navi Mumbai"],
    coordinates: { lat: 19.076, lng: 72.877 },
    effective: "2025-08-28T08:00:00Z",
    expires: "2025-08-28T20:00:00Z",
    senderName: "India Meteorological Department",
    web: "https://mausam.imd.gov.in/alerts/flood-001"
  },
  {
    id: "OW_CY_002", 
    event: "Cyclone Warning",
    headline: "Cyclonic Storm 'Biparjoy' Approaching Gujarat Coast",
    description: "Very severe cyclonic storm with wind speeds 120-130 kmph gusting to 145 kmph. Expected landfall near Jakhau Port in 18 hours. Coastal evacuation mandatory for 8 districts.",
    severity: "Extreme",
    urgency: "Immediate", 
    certainty: "Observed",
    areas: ["Kutch", "Devbhumi Dwarka", "Jamnagar", "Porbandar"],
    coordinates: { lat: 22.470, lng: 69.625 },
    effective: "2025-08-28T06:00:00Z",
    expires: "2025-08-29T18:00:00Z",
    senderName: "India Meteorological Department",
    web: "https://mausam.imd.gov.in/cyclone/biparjoy"
  },
  {
    id: "OW_HW_003",
    event: "Heat Wave Warning", 
    headline: "Severe Heat Wave Conditions in Delhi NCR",
    description: "Maximum temperatures reaching 47-49°C. Heat wave to severe heat wave conditions likely to continue for next 3 days. High risk of heat stroke and dehydration.",
    severity: "Moderate",
    urgency: "Expected",
    certainty: "Very Likely", 
    areas: ["Delhi", "Gurgaon", "Noida", "Faridabad"],
    coordinates: { lat: 28.704, lng: 77.102 },
    effective: "2025-08-28T10:00:00Z",
    expires: "2025-08-31T18:00:00Z",
    senderName: "India Meteorological Department",
    web: "https://mausam.imd.gov.in/heat-wave-003"
  }
];

// Twitter-like social media alerts
const twitterAlerts = [
  {
    id: "TW_001",
    user: "@MumbaiTraffic",
    text: "URGENT: Major flooding reported on Western Express Highway near Andheri. Multiple vehicles stranded. Avoid the area. Emergency services deployed. #MumbaiFloods #TrafficAlert",
    timestamp: "2025-08-28T08:15:00Z",
    location: "Mumbai, Maharashtra",
    coordinates: { lat: 19.120, lng: 72.847 },
    hashtags: ["MumbaiFloods", "TrafficAlert", "Emergency"],
    retweets: 245,
    likes: 89,
    verified: true
  },
  {
    id: "TW_002", 
    user: "@GujaratPolice",
    text: "Mandatory evacuation order for coastal villages in Kutch district due to approaching cyclone. Buses arranged from village centers to relief camps. Carry essential documents and medicines only. #CycloneAlert #Evacuation",
    timestamp: "2025-08-28T07:30:00Z",
    location: "Kutch, Gujarat", 
    coordinates: { lat: 23.733, lng: 69.859 },
    hashtags: ["CycloneAlert", "Evacuation", "Gujarat"],
    retweets: 1250,
    likes: 456,
    verified: true
  },
  {
    id: "TW_003",
    user: "@DelhiFireService", 
    text: "Fire reported in industrial area Mayapuri. 8 fire tenders on site. Smoke visible from Ring Road. Residents of nearby areas advised to keep windows closed. No casualties reported yet. #DelhiFire #Safety",
    timestamp: "2025-08-28T09:45:00Z",
    location: "Delhi",
    coordinates: { lat: 28.642, lng: 77.143 },
    hashtags: ["DelhiFire", "Safety", "Industrial"],
    retweets: 67,
    likes: 23,
    verified: true
  },
  {
    id: "TW_004",
    user: "@CitizenReporter",
    text: "Landslide blocking Shimla-Chandigarh highway near Solan. Heavy rains since morning. Traffic completely stopped. Local administration setting up temporary shelter at government school.",
    timestamp: "2025-08-28T11:20:00Z", 
    location: "Solan, Himachal Pradesh",
    coordinates: { lat: 30.904, lng: 77.099 },
    hashtags: ["Landslide", "HimachalRains", "HighwayBlocked"],
    retweets: 34,
    likes: 12,
    verified: false
  }
];

// Satellite/structured data (GeoJSON format)
const satelliteData = [
  {
    type: "Feature",
    properties: {
      id: "SAT_FL_001",
      source: "ISRO-CARTOSAT",
      timestamp: "2025-08-28T07:45:00Z",
      event_type: "flood_detection",
      confidence: 0.89,
      severity: "high",
      affected_area_km2: 45.7,
      population_at_risk: 125000,
      description: "Satellite imagery shows extensive flooding in Mumbai suburban areas. Water levels 2-4 feet above normal in residential zones."
    },
    geometry: {
      type: "Polygon", 
      coordinates: [[
        [72.820, 19.040], [72.920, 19.040],
        [72.920, 19.140], [72.820, 19.140], 
        [72.820, 19.040]
      ]]
    }
  },
  {
    type: "Feature",
    properties: {
      id: "SAT_CY_002",
      source: "INSAT-3DR",
      timestamp: "2025-08-28T06:30:00Z", 
      event_type: "cyclone_tracking",
      confidence: 0.95,
      severity: "extreme",
      wind_speed_kmph: 135,
      eye_diameter_km: 25,
      forward_speed_kmph: 12,
      description: "Cyclone eye clearly visible 180km southwest of Gujarat coast. Intensifying rapidly with well-defined wall clouds."
    },
    geometry: {
      type: "Point",
      coordinates: [68.450, 21.290]
    }
  },
  {
    type: "Feature", 
    properties: {
      id: "SAT_FI_003",
      source: "MODIS-TERRA",
      timestamp: "2025-08-28T09:15:00Z",
      event_type: "fire_detection", 
      confidence: 0.76,
      severity: "moderate",
      fire_radiative_power: 45.2,
      smoke_direction: "northeast",
      description: "Active fire hotspots detected in industrial zone. Thermal signature indicates chemical/petroleum fire with dense smoke plume."
    },
    geometry: {
      type: "Point", 
      coordinates: [77.143, 28.642]
    }
  }
];

// Emergency protocols and documents
const protocolDocuments = [
  {
    id: "PROT_FL_001",
    title: "Urban Flood Response Standard Operating Procedure",
    content: `IMMEDIATE ACTIONS FOR URBAN FLOODING:
1. ASSESSMENT PHASE (0-30 minutes)
   - Monitor water level gauges and rainfall data
   - Assess drainage system capacity and blockages
   - Identify vulnerable low-lying residential areas
   - Contact meteorological department for forecast updates

2. EARLY WARNING (30-60 minutes)  
   - Issue public alerts via SMS, radio, and social media
   - Activate emergency response teams
   - Open emergency shelters and relief centers
   - Coordinate with traffic police for route diversions

3. EVACUATION PHASE (1-4 hours)
   - Deploy rescue boats in severely affected areas
   - Establish evacuation routes avoiding waterlogged roads
   - Set up medical aid posts at shelter locations
   - Ensure power supply isolation in flooded areas

4. RELIEF OPERATIONS (4+ hours)
   - Distribute food, water, and essential supplies
   - Provide medical assistance and emergency healthcare
   - Restore communication networks and power supply
   - Begin damage assessment and documentation`,
    category: "protocol",
    disaster_type: "flood",
    authority: "National Disaster Management Authority",
    version: "3.2",
    last_updated: "2024-06-15"
  },
  {
    id: "PROT_CY_002", 
    title: "Cyclone Preparedness and Response Guidelines",
    content: `CYCLONE RESPONSE PROTOCOL:
1. PRE-LANDFALL (72-24 hours before)
   - Issue cyclone warnings to coastal districts
   - Evacuate vulnerable coastal populations
   - Secure fishing boats and marine vessels
   - Stock emergency supplies in relief centers

2. LANDFALL PHASE (24-6 hours before)
   - Complete evacuation of high-risk zones
   - Deploy NDRF teams in strategic locations  
   - Ensure communication systems backup power
   - Coordinate with Navy and Coast Guard

3. POST-LANDFALL (0-72 hours after)
   - Conduct search and rescue operations
   - Restore critical infrastructure (power, water, roads)
   - Provide medical aid and emergency supplies
   - Assess damage and begin rehabilitation planning`,
    category: "protocol",
    disaster_type: "cyclone", 
    authority: "National Disaster Management Authority",
    version: "2.8",
    last_updated: "2024-05-20"
  }
];

// Export functions that return the mock data
function getWeatherAlerts() {
  return Promise.resolve(weatherAlerts);
}

function getTwitterAlerts() {
  return Promise.resolve(twitterAlerts);
}

function getSatelliteData() {
  return Promise.resolve(satelliteData);
}

function getProtocolDocuments() {
  return Promise.resolve(protocolDocuments);
}

module.exports = {
  getWeatherAlerts,
  getTwitterAlerts,
  getSatelliteData,
  getProtocolDocuments,
  // Also export raw data for direct access
  weatherAlerts,
  twitterAlerts,
  satelliteData,
  protocolDocuments
};
