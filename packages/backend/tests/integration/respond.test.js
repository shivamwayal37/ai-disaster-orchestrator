const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('../../src/app');
const { mockDeep, mockReset } = 'jest-mock-extended';

// Mock Prisma client
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    alert: {
      create: jest.fn()
    },
    resource: {
      findMany: jest.fn()
    },
    actionAudit: {
      create: jest.fn()
    }
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma),
    mockPrisma
  };
});

// Mock retrieveAndGenerate
jest.mock('../../src/services/retrieverService', () => ({
  retrieveAndGenerate: jest.fn()
}));

// Mock fetch
global.fetch = jest.fn();

describe('POST /api/respond', () => {
  let prisma;
  let server;
  
  beforeAll(() => {
    prisma = new PrismaClient();
    server = app.listen(0); // Start server on random port for testing
  });
  
  afterAll(async () => {
    await server.close();
  });
  
  beforeEach(() => {
    // Reset all mocks
    mockReset(prisma);
    jest.clearAllMocks();
    
    // Mock Prisma responses
    prisma.alert.create.mockResolvedValue({
      id: 'test-incident-123',
      source: 'api_request',
      alertType: 'earthquake',
      title: 'EARTHQUAKE Response Request',
      description: 'moderate earthquake reported at coordinates',
      severity: 3,
      location: '34.05,-118.24',
      latitude: 34.05,
      longitude: -118.24,
      startTime: new Date(),
      rawData: {}
    });
    
    prisma.resource.findMany.mockResolvedValue([
      {
        id: 'shelter-1',
        name: 'Community Shelter',
        type: 'shelter',
        capacity: 200,
        latitude: 34.06,
        longitude: -118.23,
        isActive: true
      }
    ]);
    
    prisma.actionAudit.create.mockResolvedValue({});
    
    // Mock retrieveAndGenerate
    const { retrieveAndGenerate } = require('../../src/services/retrieverService');
    retrieveAndGenerate.mockResolvedValue({
      ragResponse: 'Mock RAG response with emergency procedures...',
      metadata: {
        totalIncidents: 5,
        totalProtocols: 3
      },
      extractedEntities: [
        { type: 'location', value: 'Los Angeles' },
        { type: 'disaster', value: 'earthquake' }
      ]
    });
    
    // Mock fetch for Google Maps API
    global.fetch.mockImplementation((url) => {
      if (url.includes('googleapis.com/maps/api/directions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'OK',
            routes: [{
              legs: [{
                distance: { text: '5.2 km', value: 5200 },
                duration: { text: '12 mins', value: 720 },
                duration_in_traffic: { text: '15 mins', value: 900 },
                steps: [
                  {
                    html_instructions: 'Head <b>northeast</b>',
                    distance: { text: '0.5 km', value: 500 },
                    duration: { text: '2 mins', value: 120 },
                    maneuver: 'turn-right'
                  }
                ]
              }],
              overview_polyline: { points: 'mock_polyline' }
            }]
          })
        });
      }
      return Promise.resolve({ ok: false });
    });
  });
  
  it('should process a valid disaster response request', async () => {
    const response = await request(server)
      .post('/api/respond')
      .send({
        incident_type: 'earthquake',
        location: {
          lat: 34.05,
          lon: -118.24,
          name: 'Los Angeles'
        },
        severity: 'moderate',
        description: 'Magnitude 5.8 earthquake reported in downtown area',
        options: {
          max_evacuation_points: 2,
          notification_recipients: ['+1234567890'],
          include_sms: true,
          generate_routes: true
        }
      })
      .expect('Content-Type', /json/)
      .expect(200);
    
    expect(response.body.status).toBe('success');
    expect(response.body.incident_id).toBe('test-incident-123');
    expect(response.body.plan).toBeDefined();
    expect(response.body.plan.routes.length).toBeGreaterThan(0);
    expect(response.body.context.similar_incidents).toBe(5);
    expect(prisma.alert.create).toHaveBeenCalledTimes(1);
  });
  
  it('should return 400 for missing required fields', async () => {
    const response = await request(server)
      .post('/api/respond')
      .send({
        // Missing incident_type and location
        severity: 'moderate'
      })
      .expect('Content-Type', /json/)
      .expect(400);
    
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBe('INVALID_REQUEST');
  });
  
  it('should handle errors gracefully', async () => {
    // Force an error in the alert creation
    prisma.alert.create.mockRejectedValue(new Error('Database error'));
    
    const response = await request(server)
      .post('/api/respond')
      .send({
        incident_type: 'earthquake',
        location: { lat: 34.05, lon: -118.24 },
        severity: 'moderate'
      })
      .expect('Content-Type', /json/)
      .expect(500);
    
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBe('ORCHESTRATION_ERROR');
  });
});
