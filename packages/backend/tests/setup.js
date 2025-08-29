// Setup test environment variables
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-api-key';
process.env.DATABASE_URL = 'mysql://test:test@localhost:4000/test';

// Mock console methods to keep test output clean
const originalConsole = { ...console };

global.console = {
  ...originalConsole,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Prisma client
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
  };
  
  // Dynamically add model mocks as needed
  const mockModel = (modelName) => ({
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
  });
  
  // Add all models used in the application
  const models = [
    'document',
    'workQueue',
    'incident',
    'protocol',
    'resource',
    'action',
  ];
  
  models.forEach(model => {
    mockPrisma[model] = mockModel(model);
  });
  
  return {
    PrismaClient: jest.fn(() => mockPrisma),
    mockPrisma,
  };
});

// Mock pino logger
jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => mockLogger),
  };
  
  return jest.fn(() => mockLogger);
});

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  
  // Reset fetch mock
  mockFetch.mockReset();
  
  // Setup default mock implementations
  mockFetch.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })
  );
});

afterAll(() => {
  // Restore original console methods
  global.console = originalConsole;
  
  // Clean up any resources
  jest.clearAllMocks();
  jest.resetModules();
});
