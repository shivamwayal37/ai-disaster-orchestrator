#!/usr/bin/env node

/**
 * Demo Data Seeding Script
 * 
 * Seeds the database with realistic disaster response data for showcase purposes.
 * Creates alerts, documents, resources, and response plans to demonstrate
 * the full AI Disaster Response Orchestrator workflow.
 */

const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const pino = require('pino');

const prisma = new PrismaClient();
const logger = pino({ name: 'demo-seeder' });

// Demo data sets
const DEMO_ALERTS = [
  {
    title: "Wildfire Alert - Napa Valley",
    description: "Fast-spreading wildfire threatening residential areas in Napa Valley. High winds and dry conditions accelerating fire spread.",
    alert_type: "wildfire",
    severity: "critical",
    location: "Napa Valley, California",
    latitude: 38.2975,
    longitude: -122.2869,
    source: "CAL FIRE",
    metadata: {
      wind_speed: "25 mph",
      humidity: "15%",
      temperature: "95°F",
      affected_area: "2,500 acres",
      evacuation_zones: ["Zone A", "Zone B"]
    }
  },
  {
    title: "Flood Warning - Houston Metro",
    description: "Severe flooding in Houston metropolitan area due to heavy rainfall. Multiple roads impassable, rescue operations underway.",
    alert_type: "flood",
    severity: "high",
    location: "Houston, Texas",
    latitude: 29.7604,
    longitude: -95.3698,
    source: "National Weather Service",
    metadata: {
      rainfall: "8 inches in 6 hours",
      water_level: "15 feet above normal",
      affected_population: "50,000",
      road_closures: 25
    }
  },
  {
    title: "Earthquake Alert - San Francisco Bay Area",
    description: "Magnitude 6.2 earthquake struck San Francisco Bay Area. Structural damage reported, aftershocks expected.",
    alert_type: "earthquake",
    severity: "critical",
    location: "San Francisco, California",
    latitude: 37.7749,
    longitude: -122.4194,
    source: "USGS",
    metadata: {
      magnitude: "6.2",
      depth: "8 km",
      aftershocks: "12 recorded",
      building_damage: "moderate",
      casualties: "unknown"
    }
  },
  {
    title: "Hurricane Warning - Miami-Dade",
    description: "Category 3 hurricane approaching Miami-Dade County. Storm surge and high winds expected within 24 hours.",
    alert_type: "cyclone",
    severity: "critical",
    location: "Miami, Florida",
    latitude: 25.7617,
    longitude: -80.1918,
    source: "National Hurricane Center",
    metadata: {
      category: "3",
      wind_speed: "120 mph",
      storm_surge: "8-12 feet",
      landfall_eta: "18 hours",
      evacuation_mandatory: true
    }
  },
  {
    title: "Power Grid Failure - Northeast Corridor",
    description: "Major power grid failure affecting Northeast corridor. Hospitals on backup power, traffic systems down.",
    alert_type: "power",
    severity: "high",
    location: "New York, NY",
    latitude: 40.7128,
    longitude: -74.0060,
    source: "ConEd",
    metadata: {
      affected_customers: "2.5 million",
      estimated_restoration: "12-24 hours",
      backup_systems: "active",
      traffic_impact: "severe"
    }
  }
];

const DEMO_DOCUMENTS = [
  {
    title: "Wildfire Response Protocol - Standard Operating Procedures",
    content: "Comprehensive wildfire response procedures including evacuation protocols, resource deployment, and coordination with CAL FIRE. Immediate actions: establish incident command, deploy aerial units, initiate evacuations in high-risk zones. Resource requirements: fire engines, helicopters, medical teams, evacuation buses.",
    category: "protocol",
    summary: "Standard operating procedures for wildfire emergency response",
    metadata: {
      document_type: "SOP",
      last_updated: "2024-08-15",
      authority: "California Emergency Management",
      version: "3.2"
    }
  },
  {
    title: "Flood Emergency Response Manual",
    content: "Flood response procedures covering water rescue operations, shelter management, and infrastructure protection. Key actions: deploy rescue boats, establish emergency shelters, coordinate with Army Corps of Engineers. Critical resources: boats, pumps, sandbags, medical supplies.",
    category: "protocol",
    summary: "Emergency response procedures for flood disasters",
    metadata: {
      document_type: "manual",
      last_updated: "2024-07-20",
      authority: "FEMA Region VI",
      version: "2.1"
    }
  },
  {
    title: "Earthquake Response - Urban Search and Rescue",
    content: "Urban search and rescue protocols for earthquake scenarios. Includes building assessment, victim location, and medical triage procedures. Priority actions: search and rescue operations, medical triage, infrastructure assessment, aftershock monitoring.",
    category: "protocol",
    summary: "Urban search and rescue procedures for earthquake response",
    metadata: {
      document_type: "protocol",
      last_updated: "2024-06-10",
      authority: "FEMA Urban Search and Rescue",
      version: "4.0"
    }
  },
  {
    title: "Hurricane Evacuation Planning Guide",
    content: "Comprehensive hurricane evacuation procedures including transportation coordination, shelter operations, and vulnerable population assistance. Critical elements: evacuation routes, transportation resources, shelter capacity, special needs populations.",
    category: "protocol",
    summary: "Hurricane evacuation planning and execution procedures",
    metadata: {
      document_type: "guide",
      last_updated: "2024-05-30",
      authority: "Florida Division of Emergency Management",
      version: "1.8"
    }
  }
];

const DEMO_RESOURCES = [
  {
    name: "San Francisco General Hospital",
    type: "hospital",
    location: "San Francisco, CA",
    latitude: 37.7562,
    longitude: -122.4051,
    capacity: 400,
    current_occupancy: 280,
    contact_info: {
      phone: "+1-415-206-8000",
      emergency_contact: "Dr. Sarah Chen",
      specialties: ["trauma", "emergency", "surgery"]
    }
  },
  {
    name: "Golden Gate Park Emergency Shelter",
    type: "shelter",
    location: "San Francisco, CA",
    latitude: 37.7694,
    longitude: -122.4862,
    capacity: 1000,
    current_occupancy: 0,
    contact_info: {
      phone: "+1-415-831-2700",
      emergency_contact: "Maria Rodriguez",
      amenities: ["food", "medical", "pet_friendly"]
    }
  },
  {
    name: "Houston Fire Station 68",
    type: "fire_station",
    location: "Houston, TX",
    latitude: 29.7372,
    longitude: -95.3414,
    capacity: 25,
    current_occupancy: 22,
    contact_info: {
      phone: "+1-713-884-3131",
      emergency_contact: "Captain James Wilson",
      equipment: ["ladder_truck", "rescue_boat", "hazmat"]
    }
  },
  {
    name: "Miami-Dade Emergency Operations Center",
    type: "command_center",
    location: "Miami, FL",
    latitude: 25.7907,
    longitude: -80.3203,
    capacity: 100,
    current_occupancy: 45,
    contact_info: {
      phone: "+1-305-468-5900",
      emergency_contact: "Director Lisa Martinez",
      capabilities: ["coordination", "communications", "logistics"]
    }
  }
];

async function seedAlerts() {
  logger.info('Seeding demo alerts...');
  
  for (const alertData of DEMO_ALERTS) {
    try {
      const alert = await prisma.alert.create({
        data: {
          alert_uid: uuidv4(),
          title: alertData.title,
          description: alertData.description,
          alert_type: alertData.alert_type,
          severity: alertData.severity,
          location: alertData.location,
          latitude: alertData.latitude,
          longitude: alertData.longitude,
          source: alertData.source,
          is_active: true,
          raw_data: alertData.metadata,
          created_at: new Date(),
          updated_at: new Date()
        }
      });
      
      logger.info(`Created alert: ${alert.title}`);
    } catch (error) {
      logger.error(`Failed to create alert ${alertData.title}:`, error.message);
    }
  }
}

async function seedDocuments() {
  logger.info('Seeding demo documents...');
  
  for (const docData of DEMO_DOCUMENTS) {
    try {
      const document = await prisma.document.create({
        data: {
          title: docData.title,
          content: docData.content,
          category: docData.category,
          summary: docData.summary,
          metadata: docData.metadata,
          created_at: new Date(),
          updated_at: new Date()
        }
      });
      
      logger.info(`Created document: ${document.title}`);
    } catch (error) {
      logger.error(`Failed to create document ${docData.title}:`, error.message);
    }
  }
}

async function seedResources() {
  logger.info('Seeding demo resources...');
  
  for (const resourceData of DEMO_RESOURCES) {
    try {
      const resource = await prisma.resource.create({
        data: {
          name: resourceData.name,
          type: resourceData.type,
          location: resourceData.location,
          latitude: resourceData.latitude,
          longitude: resourceData.longitude,
          capacity: resourceData.capacity,
          current_occupancy: resourceData.current_occupancy,
          contact_info: resourceData.contact_info,
          is_available: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      });
      
      logger.info(`Created resource: ${resource.name}`);
    } catch (error) {
      logger.error(`Failed to create resource ${resourceData.name}:`, error.message);
    }
  }
}

async function createSampleResponsePlan() {
  logger.info('Creating sample response plan...');
  
  try {
    const plan = await prisma.responsePlan.create({
      data: {
        title: "Wildfire Response Plan - Napa Valley",
        disaster_type: "wildfire",
        location: "Napa Valley, California",
        severity: "critical",
        plan_data: {
          situation_assessment: {
            summary: "Fast-spreading wildfire threatening residential areas with high wind conditions",
            risk_level: "CRITICAL",
            estimated_impact: "2,500+ acres affected, 500+ structures at risk",
            time_sensitivity: "IMMEDIATE"
          },
          immediate_actions: [
            "Establish incident command center at Napa Valley Fire Station",
            "Deploy aerial firefighting units to contain fire spread",
            "Initiate mandatory evacuation for Zones A and B",
            "Set up emergency medical stations at evacuation centers"
          ],
          resource_requirements: {
            personnel: ["Firefighters", "Police", "EMTs", "Evacuation coordinators"],
            equipment: ["Fire engines", "Helicopters", "Medical supplies", "Evacuation buses"],
            facilities: ["Incident command center", "Emergency shelters", "Medical stations"]
          },
          timeline: {
            immediate: ["0-1 hour: Evacuation and initial fire suppression"],
            short_term: ["1-6 hours: Aerial operations and perimeter control"],
            medium_term: ["6-24 hours: Mop-up operations and damage assessment"]
          },
          coordination: {
            primary_agencies: ["CAL FIRE", "Napa County Sheriff", "Red Cross"],
            communication_plan: "Unified command structure with hourly briefings",
            public_information: "Evacuation orders via emergency alert system"
          }
        },
        status: "active",
        created_at: new Date(),
        updated_at: new Date()
      }
    });
    
    logger.info(`Created response plan: ${plan.title}`);
  } catch (error) {
    logger.error('Failed to create sample response plan:', error.message);
  }
}

async function main() {
  try {
    logger.info('Starting demo data seeding...');
    
    // Clear existing demo data (optional)
    if (process.argv.includes('--reset')) {
      logger.info('Clearing existing data...');
      await prisma.responsePlan.deleteMany({});
      await prisma.resource.deleteMany({});
      await prisma.document.deleteMany({});
      await prisma.alert.deleteMany({});
      logger.info('Existing data cleared');
    }
    
    // Seed all demo data
    await seedAlerts();
    await seedDocuments();
    await seedResources();
    await createSampleResponsePlan();
    
    logger.info('Demo data seeding completed successfully!');
    
    // Display summary
    const counts = await Promise.all([
      prisma.alert.count(),
      prisma.document.count(),
      prisma.resource.count(),
      prisma.responsePlan.count()
    ]);
    
    logger.info('Database summary:', {
      alerts: counts[0],
      documents: counts[1],
      resources: counts[2],
      response_plans: counts[3]
    });
    
  } catch (error) {
    logger.error('Demo data seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeding script
if (require.main === module) {
  main();
}

module.exports = { main };
