const { PrismaClient } = require('@prisma/client');
const { createNamespaceLogger } = require('../../utils/logger');
const AlertService = require('../alertService');
const { ApiError } = require('../../middleware/errorHandler');

// Mock Prisma client
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    alert: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
      $queryRaw: jest.fn()
    },
    $transaction: jest.fn(fn => fn(mockPrisma)),
    $disconnect: jest.fn()
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma)
  };
});

describe('AlertService', () => {
  let alertService;
  let prisma;
  
  const mockAlert = {
    id: '1',
    source: 'WEATHER_API',
    type: 'FLOOD',
    severity: 'HIGH',
    location: 'Test Location',
    coordinates: { latitude: 12.34, longitude: 56.78 },
    description: 'Test alert description',
    status: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    prisma = new PrismaClient();
    const logger = createNamespaceLogger('test');
    alertService = new AlertService(prisma, logger);
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('ingestAlert', () => {
    it('should create a new alert', async () => {
      const alertData = {
        source: 'WEATHER_API',
        type: 'FLOOD',
        severity: 'HIGH',
        location: 'Test Location',
        coordinates: { latitude: 12.34, longitude: 56.78 },
        description: 'Test alert description'
      };

      prisma.alert.create.mockResolvedValue(mockAlert);

      const result = await alertService.ingestAlert(alertData);

      expect(prisma.alert.create).toHaveBeenCalledWith({
        data: {
          ...alertData,
          coordinates: JSON.stringify(alertData.coordinates),
          status: 'PENDING',
          metadata: {}
        }
      });
      expect(result).toEqual(mockAlert);
    });

    it('should throw an error for invalid alert data', async () => {
      const invalidAlertData = {
        // Missing required fields
        source: 'WEATHER_API'
      };

      await expect(alertService.ingestAlert(invalidAlertData))
        .rejects
        .toThrow('Missing required fields');
    });
  });

  describe('getAlertById', () => {
    it('should return an alert by ID', async () => {
      prisma.alert.findUnique.mockResolvedValue(mockAlert);

      const result = await alertService.getAlertById('1');

      expect(prisma.alert.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: {
          relatedAlerts: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              type: true,
              severity: true,
              location: true,
              description: true,
              createdAt: true
            }
          }
        }
      });
      expect(result).toEqual(mockAlert);
    });

    it('should throw an error if alert not found', async () => {
      prisma.alert.findUnique.mockResolvedValue(null);

      await expect(alertService.getAlertById('nonexistent'))
        .rejects
        .toThrow('Alert not found');
    });
  });

  describe('searchAlerts', () => {
    it('should search alerts with filters', async () => {
      const mockSearchResults = {
        results: [mockAlert],
        total: 1,
        vectorResults: 1,
        fullTextResults: 0
      };
      
      alertService.vectorSearch = jest.fn().mockResolvedValue([mockAlert]);
      alertService.fullTextSearch = jest.fn().mockResolvedValue([]);
      prisma.alert.count.mockResolvedValue(1);

      const filters = {
        type: 'FLOOD',
        severity: 'HIGH',
        startDate: '2023-01-01',
        endDate: '2023-12-31'
      };

      const result = await alertService.searchAlerts('flood', {
        limit: 10,
        offset: 0,
        filters
      });

      expect(alertService.vectorSearch).toHaveBeenCalledWith('flood', {
        limit: 10,
        minScore: 0.7,
        filters
      });
      expect(result).toEqual(mockSearchResults);
    });
  });

  describe('updateAlertStatus', () => {
    it('should update alert status', async () => {
      const updatedAlert = {
        ...mockAlert,
        status: 'RESOLVED',
        metadata: { resolvedBy: 'test@example.com' }
      };

      prisma.alert.update.mockResolvedValue(updatedAlert);

      const result = await alertService.updateAlertStatus(
        '1',
        'RESOLVED',
        { resolvedBy: 'test@example.com' }
      );

      expect(prisma.alert.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: {
          status: 'RESOLVED',
          metadata: {
            resolvedBy: 'test@example.com',
            statusUpdatedAt: expect.any(String)
          }
        }
      });
      expect(result).toEqual(updatedAlert);
    });

    it('should throw an error for invalid status', async () => {
      await expect(
        alertService.updateAlertStatus('1', 'INVALID_STATUS')
      ).rejects.toThrow('Invalid status');
    });
  });

  describe('getAlertStats', () => {
    it('should return alert statistics', async () => {
      const mockStats = {
        totalAlerts: 10,
        alertsByType: [
          { type: 'FLOOD', count: 5 },
          { type: 'EARTHQUAKE', count: 3 },
          { type: 'FIRE', count: 2 }
        ],
        alertsBySeverity: [
          { severity: 'HIGH', count: 7 },
          { severity: 'MEDIUM', count: 3 }
        ],
        recentAlerts: [mockAlert]
      };

      prisma.alert.count.mockResolvedValue(10);
      prisma.alert.groupBy
        .mockResolvedValueOnce([
          { type: 'FLOOD', _count: 5 },
          { type: 'EARTHQUAKE', _count: 3 },
          { type: 'FIRE', _count: 2 }
        ])
        .mockResolvedValueOnce([
          { severity: 'HIGH', _count: 7 },
          { severity: 'MEDIUM', _count: 3 }
        ]);
      prisma.alert.findMany.mockResolvedValue([mockAlert]);

      const result = await alertService.getAlertStats('7d');

      expect(prisma.alert.count).toHaveBeenCalled();
      expect(prisma.alert.groupBy).toHaveBeenCalledTimes(2);
      expect(prisma.alert.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          type: true,
          severity: true,
          location: true,
          description: true,
          createdAt: true
        }
      });
      expect(result).toEqual(expect.objectContaining({
        totalAlerts: 10,
        alertsByType: expect.any(Array),
        alertsBySeverity: expect.any(Array),
        recentAlerts: [mockAlert]
      }));
    });
  });

  describe('batchIngest', () => {
    it('should process batch alerts', async () => {
      const alerts = [
        {
          source: 'WEATHER_API',
          type: 'FLOOD',
          severity: 'HIGH',
          location: 'Location 1',
          coordinates: { latitude: 1, longitude: 1 },
          description: 'Flood alert 1'
        },
        {
          source: 'SEISMIC_API',
          type: 'EARTHQUAKE',
          severity: 'CRITICAL',
          location: 'Location 2',
          coordinates: { latitude: 2, longitude: 2 },
          description: 'Earthquake alert'
        }
      ];

      prisma.alert.create
        .mockResolvedValueOnce({ ...mockAlert, id: '1' })
        .mockResolvedValueOnce({ ...mockAlert, id: '2' });

      const result = await alertService.batchIngest(alerts);

      expect(prisma.alert.create).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        total: 2,
        success: 2,
        errors: 0,
        details: [
          { id: '1', status: 'success' },
          { id: '2', status: 'success' }
        ]
      });
    });

    it('should handle errors in batch processing', async () => {
      const alerts = [
        {
          source: 'WEATHER_API',
          type: 'FLOOD',
          severity: 'HIGH',
          location: 'Location 1',
          coordinates: { latitude: 1, longitude: 1 },
          description: 'Flood alert 1'
        },
        {
          // Invalid alert (missing required fields)
          source: 'SEISMIC_API'
        }
      ];

      prisma.alert.create
        .mockResolvedValueOnce({ ...mockAlert, id: '1' })
        .mockRejectedValueOnce(new Error('Validation error'));

      const result = await alertService.batchIngest(alerts);

      expect(prisma.alert.create).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        total: 2,
        success: 1,
        errors: 1,
        details: [
          { id: '1', status: 'success' },
          { id: 'unknown', status: 'error', error: 'Validation error' }
        ]
      });
    });
  });
});
