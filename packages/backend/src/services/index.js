/**
 * Centralized exports for all services.
 */

const actionServices = require('./actionServices');
const { aiClient } = require('./aiClient');
const alertService = require('./alertService');
const EmbeddingWorker = require('../../worker/EmbeddingWorker');
const { EnhancedErrorHandler } = require('./errorHandler');
const { performanceOptimizer } = require('./performanceOptimizer');
const { responseOrchestrator } = require('./responseOrchestratorService');
const retrieverService = require('./retrieverService');
const searchService = require('./searchService');
const vectorStore = require('./vectorStore');

// For integration testing, we need the raw classes as well
const { IntegrationTester } = require('./integrationTester');

module.exports = {
  ...actionServices,
  aiClient,
  alertService,
  EmbeddingWorker,
  EnhancedErrorHandler,
  performanceOptimizer,
  responseOrchestrator,
  retrieverService,
  searchService,
  vectorStore,
  IntegrationTester,
};
