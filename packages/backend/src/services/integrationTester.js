/**
 * Day 7 - Integration Testing & End-to-End Pipeline Validation
 * Complete testing framework for the optimized orchestrator
 */

const pino = require('pino');
const { performance } = require('perf_hooks');
const { performanceOptimizer: optimizedOrchestrator } = require('./performanceOptimizer');
const { enhancedErrorHandler } = require('./errorHandler');
const { redisClient } = require('./searchService');

const logger = pino({ name: 'integration-test' });

/**
 * End-to-End Integration Tester
 */
class IntegrationTester {
  constructor() {
    this.testResults = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      performance: {
        averageResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: Infinity
      },
      errors: []
    };
    
    this.performanceTarget = process.env.PERFORMANCE_TARGET || 5000; // Configurable performance target
    this.testScenarios = this.defineTestScenarios();
  }

  /**
   * Define comprehensive test scenarios
   */
  defineTestScenarios() {
    return [
      // Basic functionality tests
      {
        name: 'earthquake_basic',
        description: 'Basic earthquake response generation',
        query: {
          query: 'Major earthquake has hit the city center',
          type: 'earthquake',
          location: 'San Francisco',
          severity: 'high'
        },
        expectations: {
          responseTime: 20000,
          hasImmediateActions: true,
          hasResources: true,
          riskLevel: ['HIGH', 'CRITICAL']
        }
      },
      {
        name: 'wildfire_performance',
        description: 'Wildfire response with performance focus',
        query: {
          query: 'Fast-spreading wildfire threatening residential area',
          type: 'wildfire',
          location: 'California',
          severity: 'severe'
        },
        expectations: {
          responseTime: 4000,
          hasTimeline: true,
          hasCoordination: true,
          confidenceScore: 0.7
        }
      },
      {
        name: 'flood_cached',
        description: 'Flood response - should be cached on second run',
        query: {
          query: 'Heavy flooding in urban area affecting transportation',
          type: 'flood',
          location: 'Mumbai',
          severity: 'moderate'
        },
        expectations: {
          responseTime: 5000,
          shouldBeCached: true
        }
      },
      // Edge cases and error handling
      {
        name: 'minimal_input',
        description: 'Minimal valid input test',
        query: {
          query: 'Emergency',
          type: 'other',
          location: 'Unknown'
        },
        expectations: {
          responseTime: 6000,
          shouldUseFallback: true
        }
      },
      {
        name: 'invalid_input_handling',
        description: 'Handles invalid or missing input gracefully',
        query: {
          query: null, // Invalid input
          type: 'unknown',
        },
        expectations: {
          expectsError: true, // Expects the orchestrator to throw an error
        }
      },
      {
        name: 'long_query',
        description: 'Long detailed query test',
        query: {
          query: 'A massive 7.5 magnitude earthquake has struck during peak hours causing widespread building collapses, infrastructure damage, power outages, and multiple casualties requiring immediate comprehensive emergency response coordination',
          type: 'earthquake',
          location: 'Los Angeles Metropolitan Area',
          severity: 'critical'
        },
        expectations: {
          responseTime: 5000,
          riskLevel: ['CRITICAL']
        }
      },
      // Performance stress tests
      {
        name: 'rapid_fire_test',
        description: 'Multiple rapid requests to test caching',
        isMultiple: true,
        count: 3,
        query: {
          query: 'Tornado warning issued for metropolitan area',
          type: 'cyclone',
          location: 'Oklahoma City',
          severity: 'high'
        },
        expectations: {
          firstResponseTime: 5000,
          subsequentResponseTime: 1000 // Should be cached
        }
      }
    ];
  }

  /**
   * Run all integration tests
   */
  async runAllTests() {
    logger.info('Starting comprehensive integration tests');
    this.resetTestResults();

    // Clear Redis cache before running tests
    try {
      await redisClient.flushAll();
      logger.info('Redis cache cleared successfully.');
    } catch (error) {
      logger.error({ error }, 'Failed to clear Redis cache.');
      // Decide if you want to proceed or halt tests if cache clearing fails
    }
    
    const startTime = performance.now();
    
    try {
      // Test 1: Service health checks
      await this.testServiceHealth();
      
      // Test 2: Basic functionality
      await this.testBasicFunctionality();
      
      // Test 3: Performance optimization
      await this.testPerformanceOptimization();
      
      // Test 4: Error handling and fallbacks
      await this.testErrorHandling();
      
      // Test 5: End-to-end pipeline
      await this.testEndToEndPipeline();
      
      // Test 6: Cache functionality
      await this.testCacheOptimization();

      // Test 7: Stress tests
      await this.testStressScenarios();

      const totalTime = performance.now() - startTime;
    
      
      // Generate test report
      const report = this.generateTestReport(totalTime);
      logger.info(report, 'Integration tests completed');
      
      return report;

    } catch (error) {
      logger.error({ error: error.message }, 'Integration tests failed');
      throw error;
    }
  }

  /**
   * Test service health checks
   */
  async testServiceHealth() {
    logger.info('Testing service health...');
    
    try {
      // Test optimized orchestrator health
      const health = await optimizedOrchestrator.healthCheck();
      
      this.recordTest('service_health', health.status === 'healthy', {
        expected: 'healthy',
        actual: health.status,
        performsWithinThreshold: health.performsWithinThreshold
      });

      // Test error handler health
      const errorHealth = await enhancedErrorHandler.healthCheck();
      
      this.recordTest('error_handler_health', errorHealth.status !== 'unhealthy', {
        expected: 'healthy or degraded',
        actual: errorHealth.status
      });

    } catch (error) {
      this.recordTest('service_health', false, { error: error.message });
    }
  }

  /**
   * Test basic functionality
   */
  async testBasicFunctionality() {
    logger.info('Testing basic functionality...');
    
    for (const scenario of this.testScenarios.filter(s => !s.isMultiple && s.name !== 'invalid_input_handling')) {
      await this.runSingleScenario(scenario);
    }
  }

  /**
   * Test performance optimization
   */
  async testPerformanceOptimization() {
    logger.info('Testing performance optimization...');
    
    const performanceTests = [
      {
        name: 'response_time_target',
        test: async () => {
          const startTime = performance.now();
          
          await optimizedOrchestrator.generateOptimizedActionPlan({
            query: 'Emergency response needed',
            type: 'wildfire',
            location: 'Test Location',
            severity: 'moderate'
          });
          
          const responseTime = performance.now() - startTime;
          return {
            passed: responseTime < this.performanceTarget,
            responseTime,
            target: this.performanceTarget
          };
        }
      },
      {
        name: 'memory_usage',
        test: async () => {
          const beforeMemory = process.memoryUsage().heapUsed;
          
          // Run multiple generations to check for leaks
          for (let i = 0; i < 5; i++) {
            await optimizedOrchestrator.generateOptimizedActionPlan({
              query: `Test ${i}`,
              type: 'other',
              location: 'Memory Test'
            });
          }
          
          const afterMemory = process.memoryUsage().heapUsed;
          const memoryIncrease = afterMemory - beforeMemory;
          
          return {
            passed: memoryIncrease < 50 * 1024 * 1024, // 50MB threshold
            memoryIncrease: `${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`
          };
        }
      }
    ];

    for (const test of performanceTests) {
      try {
        const result = await test.test();
        this.recordTest(test.name, result.passed, result);
      } catch (error) {
        this.recordTest(test.name, false, { error: error.message });
      }
    }
  }

  /**
   * Test error handling and fallbacks
   */
  async testErrorHandling() {
    logger.info('Testing error handling and fallbacks...');

    // Test 1: Fallback generation
    try {
      const fallback = enhancedErrorHandler.generateEnhancedFallback(
        { type: 'earthquake', location: 'Test City', severity: 'high' },
        new Error('Simulated timeout'),
        {}
      );
      
      const passed = !!fallback && !!fallback.fallback_info;
                     
      this.recordTest('fallback_generation', passed, { 
        reason: fallback?.fallback_info?.reason 
      });

    } catch (error) {
      this.recordTest('fallback_generation', false, { error: error.message });
    }

    // Test 2: Invalid input handling
    const invalidInputScenario = this.testScenarios.find(s => s.name === 'invalid_input_handling');
    if (invalidInputScenario) {
      await this.runSingleScenario(invalidInputScenario);
    }
  }

  /**
   * Test end-to-end pipeline
   */
  async testEndToEndPipeline() {
    logger.info('Testing end-to-end pipeline...');
    
    const scenario = this.testScenarios.find(s => s.name === 'earthquake_basic');
    if (scenario) {
      await this.runSingleScenario(scenario, 'e2e_');
    }
  }

  /**
   * Test cache optimization
   */
  async testCacheOptimization() {
    logger.info('Testing cache optimization...');
    
    const scenario = this.testScenarios.find(s => s.name === 'flood_cached');
    
    if (scenario) {
      // First run (should not be cached)
      const startTime1 = performance.now();
      const firstResult = await optimizedOrchestrator.generateOptimizedActionPlan(scenario.query);
      const time1 = performance.now() - startTime1;
      const firstRunIsMiss = !firstResult?.metadata?.fromCache;
      this.recordTest('cache_first_run_miss', firstRunIsMiss, { 
        fromCache: firstResult?.metadata?.fromCache || false 
      });

      // Second run (should be a cache hit)
      const startTime2 = performance.now();
      const secondResult = await optimizedOrchestrator.generateOptimizedActionPlan(scenario.query);
      const time2 = performance.now() - startTime2;
      
      const secondRunIsHit = secondResult?.metadata?.fromCache === true;
      this.recordTest('cache_second_run_hit', secondRunIsHit, { 
        fromCache: secondResult?.metadata?.fromCache || false,
        time1: `${time1.toFixed(2)}ms`,
        time2: `${time2.toFixed(2)}ms`
      });
    }
  }

  /**
   * Run a single test scenario
   */
  async runSingleScenario(scenario, prefix = '') {
    try {
      const result = await optimizedOrchestrator.generateOptimizedActionPlan(scenario.query);
      
      if (scenario.expectations.expectsError) {
        // If error was expected but none was thrown, it's a failure
        this.recordTest(prefix + scenario.name, false, { error: 'Expected an error but none was thrown.' });
        return;
      }

      const passed = this.validateScenario(result, scenario.expectations);
      this.recordTest(prefix + scenario.name, passed, {
        responseTime: result.processingTime,
        riskLevel: result.plan?.situation_assessment?.risk_level,
        cached: result.metadata?.cached
      });

    } catch (error) {
      if (scenario.expectations.expectsError) {
        // If an error was expected and thrown, it's a pass
        this.recordTest(prefix + scenario.name, true, { message: 'Correctly handled invalid input.' });
      } else {
        this.recordTest(prefix + scenario.name, false, { error: error.message });
      }
    }
  }

  /**
   * Validate scenario results against expectations
   */
  validateScenario(result, expectations) {
    if (result?.processingTime > expectations.responseTime) return false;
    if (expectations.hasImmediateActions && (!result.plan?.immediate_actions || result.plan.immediate_actions.length === 0)) return false;
    if (expectations.hasResources && !result.plan?.resource_requirements) return false;
    if (expectations.riskLevel && !expectations.riskLevel.includes(result.plan?.situation_assessment?.risk_level)) return false;
    if (expectations.shouldUseFallback && !result.plan?.fallback_reason) return false;
    
    return true;
  }

  /**
   * Record test result
   */
  recordTest(name, passed, details = {}) {
    this.testResults.totalTests++;
    if (passed) {
      this.testResults.passedTests++;
      logger.info({ test: name, status: 'PASSED', details }, `Test PASSED: ${name}`);
    } else {
      this.testResults.failedTests++;
      logger.error({ test: name, status: 'FAILED', details }, `Test FAILED: ${name}`);
      this.testResults.errors.push({ test: name, ...details });
    }
  }

  /**
   * Reset test results
   */
  resetTestResults() {
    this.testResults = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      performance: {
        averageResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: Infinity
      },
      errors: []
    };
  }

  /**
   * Run stress test scenarios
   */
  async testStressScenarios() {
    logger.info('Testing stress scenarios...');
    
    for (const scenario of this.testScenarios.filter(s => s.isMultiple)) {
      const testName = `stress_${scenario.name}`;
      try {
        let firstResponseTime = 0;
        let passed = true;

        for (let i = 0; i < scenario.count; i++) {
          const startTime = performance.now();
          await optimizedOrchestrator.generateOptimizedActionPlan(scenario.query);
          const responseTime = performance.now() - startTime;
          
          if (i === 0) {
            firstResponseTime = responseTime;
            if (responseTime > scenario.expectations.firstResponseTime) {
              passed = false;
            }
          } else {
            if (responseTime > scenario.expectations.subsequentResponseTime) {
              passed = false;
            }
          }
        }
        this.recordTest(testName, passed, { 
          firstResponseTime, 
          target: scenario.expectations.firstResponseTime 
        });
      } catch (error) {
        this.recordTest(testName, false, { error: error.message });
      }
    }
  }

  /**
   * Generate test report
   */
  generateTestReport(totalTime) {
    return {
      summary: {
        totalTests: this.testResults.totalTests,
        passed: this.testResults.passedTests,
        failed: this.testResults.failedTests,
        passRate: `${(this.testResults.passedTests / this.testResults.totalTests * 100).toFixed(1)}%`
      },
      totalDuration: `${(totalTime / 1000).toFixed(2)}s`,
      errors: this.testResults.errors
    };
  }
}

// Export integration tester
const integrationTester = new IntegrationTester();

module.exports = { 
  integrationTester,
  IntegrationTester
};
