/**
 * Test script for Jina Embeddings v3 integration
 * 
 * Usage:
 *   node scripts/test-jina-embedding.js [test-case]
 * 
 * Test Cases:
 *   basic    - Test basic embedding generation (TC-1)
 *   empty    - Test empty string input (TC-2)
 *   long     - Test long text input (TC-3)
 *   batch    - Test batch embedding generation
 *   all      - Run all tests
 */

require('dotenv').config();
const JinaEmbeddingService = require('../src/services/jinaEmbeddingService');

const TEST_TEXTS = [
  "Tsunami alert in Japan",
  "Earthquake in Turkey",
  "Cyclone in Odisha",
  "Wildfire evacuation California",
  "Flood warning in Bangladesh"
];

const LONG_TEXT = 
  "A massive earthquake with a magnitude of 7.8 struck southeastern Turkey near the Syrian border " +
  "in the early hours of Monday, toppling buildings and leaving hundreds dead and many more trapped " +
  "under rubble, with the toll expected to rise as rescue workers searched mounds of wreckage in " +
  "cities and towns across the area. The quake, which struck at 4:17 a.m. local time, was centered " +
  "about 20 miles from Gaziantep, a major city and provincial capital. It was felt as far away as " +
  "Cyprus and Cairo. A few hours later, a second quake, with a magnitude of 7.5, shook the region " +
  "again, further damaging buildings and sending panicked residents running into the streets. The " +
  "Turkish government has declared a level 4 alarm, which includes a call for international assistance.".repeat(5);

const embeddingService = new JinaEmbeddingService();

async function testBasicEmbedding() {
  console.log('\n=== TC-1: Basic Embedding Generation ===');
  try {
    const text = TEST_TEXTS[0];
    console.log(`Generating embedding for: "${text}"`);
    
    const start = Date.now();
    const embedding = await embeddingService.generateEmbedding(text);
    const duration = Date.now() - start;
    
    if (!Array.isArray(embedding)) {
      throw new Error('Embedding is not an array');
    }
    
    if (embedding.length !== 1024) {
      throw new Error(`Expected 1024 dimensions, got ${embedding.length}`);
    }
    
    console.log(`✅ Success! Generated ${embedding.length}-dimension embedding in ${duration}ms`);
    console.log(`First 5 dimensions: [${embedding.slice(0, 5).join(', ')}]`);
    console.log(`Embedding stats: min=${Math.min(...embedding).toFixed(4)}, ` +
                `max=${Math.max(...embedding).toFixed(4)}, ` +
                `mean=${(embedding.reduce((a, b) => a + b, 0) / embedding.length).toFixed(4)}`);
    
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

async function testEmptyInput() {
  console.log('\n=== TC-2: Empty String Input ===');
  try {
    console.log('Testing with empty string...');
    const embedding = await embeddingService.generateEmbedding('');
    
    if (!Array.isArray(embedding) || embedding.length !== 1024) {
      throw new Error('Empty string should return a valid embedding');
    }
    
    console.log('✅ Success! Empty string returned a valid embedding');
    return true;
  } catch (error) {
    if (error.message.includes('Invalid input')) {
      console.log('✅ Success! Empty string was properly rejected');
      return true;
    }
    console.error('❌ Test failed with unexpected error:', error.message);
    return false;
  }
}

async function testLongText() {
  console.log('\n=== TC-3: Long Text Input ===');
  try {
    console.log(`Testing with long text (${LONG_TEXT.length} characters)...`);
    const start = Date.now();
    const embedding = await embeddingService.generateEmbedding(LONG_TEXT);
    const duration = Date.now() - start;
    
    if (!Array.isArray(embedding) || embedding.length !== 1024) {
      throw new Error('Long text should return a valid embedding');
    }
    
    console.log(`✅ Success! Generated embedding for long text in ${duration}ms`);
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

async function testBatchEmbedding() {
  console.log('\n=== Batch Embedding Generation ===');
  try {
    console.log(`Generating embeddings for ${TEST_TEXTS.length} texts...`);
    const start = Date.now();
    const embeddings = await embeddingService.generateBatchEmbeddings(TEST_TEXTS);
    const duration = Date.now() - start;
    
    if (!Array.isArray(embeddings) || embeddings.length !== TEST_TEXTS.length) {
      throw new Error(`Expected ${TEST_TEXTS.length} embeddings, got ${embeddings ? embeddings.length : 0}`);
    }
    
    for (let i = 0; i < embeddings.length; i++) {
      if (!Array.isArray(embeddings[i]) || embeddings[i].length !== 1024) {
        throw new Error(`Invalid embedding at index ${i}`);
      }
    }
    
    console.log(`✅ Success! Generated ${embeddings.length} embeddings in ${duration}ms`);
    
    // Check for duplicates
    const uniqueEmbeddings = new Set(embeddings.map(e => e.join(',')));
    if (uniqueEmbeddings.size < embeddings.length) {
      console.warn('⚠️  Warning: Some embeddings appear to be identical');
    } else {
      console.log('All embeddings are unique');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Batch test failed:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Jina Embedding Service Tests\n');
  
  const results = {
    basic: await testBasicEmbedding(),
    empty: await testEmptyInput(),
    long: await testLongText(),
    batch: await testBatchEmbedding()
  };
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  console.log('\n=== Test Summary ===');
  console.log(`✅ ${passed} passed | ❌ ${total - passed} failed | ${total} total`);
  
  if (passed < total) {
    process.exit(1);
  }
}

// Parse command line arguments
const testCase = process.argv[2]?.toLowerCase() || 'all';

switch (testCase) {
  case 'basic':
    testBasicEmbedding();
    break;
  case 'empty':
    testEmptyInput();
    break;
  case 'long':
    testLongText();
    break;
  case 'batch':
    testBatchEmbedding();
    break;
  case 'all':
  default:
    runAllTests();
}
// Run the test
(async () => {
  await testEmbedding(text);
  process.exit(0);
})();
