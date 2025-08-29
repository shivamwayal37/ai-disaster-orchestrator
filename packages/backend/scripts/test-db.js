#!/usr/bin/env node
/**
 * Database Test Script - Day 2 Validation
 * Tests TiDB connection, schema, and search functionality
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function testDatabaseConnection() {
  console.log('🔌 Testing database connection...');
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

async function testSchema() {
  console.log('\n📋 Testing schema structure...');
  try {
    // Test documents table
    const documentCount = await prisma.document.count();
    console.log(`✅ Documents table accessible (${documentCount} records)`);

    // Test alerts table
    const alertCount = await prisma.alert.count();
    console.log(`✅ Alerts table accessible (${alertCount} records)`);

    // Test resources table
    const resourceCount = await prisma.resource.count();
    console.log(`✅ Resources table accessible (${resourceCount} records)`);

    return true;
  } catch (error) {
    console.error('❌ Schema test failed:', error.message);
    return false;
  }
}

async function insertSampleData() {
  console.log('\n📝 Inserting sample test data...');
  try {
    // Insert sample documents
    const sampleDocs = await prisma.document.createMany({
      data: [
        {
          title: 'Weather Alert: Severe Flooding Expected',
          content: 'URGENT: National Weather Service issues severe flood warning for Riverdale District. Heavy rainfall expected to continue for next 6 hours. Residents in low-lying areas should evacuate immediately. Emergency shelters available at Community Center and High School.',
          category: 'report',
          sourceUrl: 'https://weather.gov/alerts/flood-001',
          confidence: 0.95
        },
        {
          title: 'Twitter: Wildfire Evacuation Reports',
          content: 'Multiple reports from Pine Valley residents about wildfire smoke and mandatory evacuation orders. Highway 101 closed due to poor visibility. Red Cross shelter set up at Memorial Hospital parking lot. #WildfireAlert #Evacuation',
          category: 'social_media',
          sourceUrl: 'https://twitter.com/emergency_alerts/status/123456',
          confidence: 0.78
        },
        {
          title: 'Emergency Response Protocol: Flood Management',
          content: 'Standard Operating Procedure for Flood Response: 1. Assess water levels and flow rates 2. Deploy sandbags to vulnerable areas 3. Coordinate evacuation of at-risk populations 4. Establish emergency shelters 5. Monitor weather conditions continuously 6. Communicate with utility companies regarding power safety',
          category: 'protocol',
          sourceUrl: 'https://emergency.gov/protocols/flood-response.pdf',
          confidence: 1.0
        }
      ],
      skipDuplicates: true
    });

    console.log(`✅ Inserted ${sampleDocs.count} sample documents`);
    return true;
  } catch (error) {
    console.error('❌ Sample data insertion failed:', error.message);
    return false;
  }
}

async function testFullTextSearch() {
  console.log('\n🔍 Testing full-text search...');
  try {
    // Test TiDB full-text search using LIKE for basic text matching
    // TiDB fulltext indexes improve performance but use different syntax
    const results = await prisma.$queryRaw`
      SELECT 
        id, 
        title, 
        category,
        LEFT(content, 100) as content_preview
      FROM documents 
      WHERE content LIKE '%flood%' OR content LIKE '%evacuation%' OR content LIKE '%emergency%'
      ORDER BY 
        CASE 
          WHEN content LIKE '%flood%' AND content LIKE '%evacuation%' THEN 3
          WHEN content LIKE '%flood%' OR content LIKE '%evacuation%' THEN 2
          ELSE 1
        END DESC
      LIMIT 5
    `;

    console.log(`✅ Full-text search returned ${results.length} results`);
    results.forEach((doc, i) => {
      console.log(`   ${i+1}. "${doc.title}"`);
    });

    return results.length > 0;
  } catch (error) {
    console.error('❌ Full-text search failed:', error.message);
    return false;
  }
}

async function testVectorSearchPrep() {
  console.log('\n🧠 Testing vector search preparation...');
  try {
    // Check for documents that could have embeddings
    const docsWithoutEmbeddings = await prisma.document.findMany({
      where: { embedding: null },
      select: { id: true, title: true, category: true }
    });

    console.log(`✅ Found ${docsWithoutEmbeddings.length} documents ready for embedding generation`);
    
    // Mock vector similarity test (placeholder)
    console.log('ℹ️  Vector search will be functional once embeddings are generated');
    
    return true;
  } catch (error) {
    console.error('❌ Vector search preparation failed:', error.message);
    return false;
  }
}

async function testIndexes() {
  console.log('\n📊 Testing database indexes...');
  try {
    // Test index existence using raw query
    const indexes = await prisma.$queryRaw`
      SHOW INDEX FROM documents WHERE Key_name LIKE '%content%' OR Key_name LIKE '%embedding%'
    `;

    console.log(`✅ Found ${indexes.length} search-related indexes on documents table`);
    indexes.forEach(idx => {
      console.log(`   - ${idx.Key_name} (${idx.Index_type})`);
    });

    return true;
  } catch (error) {
    console.error('❌ Index test failed:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Day 2 Database Validation Tests\n');
  
  const tests = [
    { name: 'Database Connection', fn: testDatabaseConnection },
    { name: 'Schema Structure', fn: testSchema },
    { name: 'Sample Data Insertion', fn: insertSampleData },
    { name: 'Full-Text Search', fn: testFullTextSearch },
    { name: 'Vector Search Prep', fn: testVectorSearchPrep },
    { name: 'Database Indexes', fn: testIndexes }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`❌ ${test.name} threw error:`, error.message);
      failed++;
    }
  }

  console.log('\n📊 Test Results Summary:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! Day 2 database setup is complete.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the errors above and verify your TiDB connection.');
  }

  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testDatabaseConnection,
  testSchema,
  insertSampleData,
  testFullTextSearch,
  testVectorSearchPrep,
  testIndexes
};
