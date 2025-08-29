const express = require('express');
const pino = require('pino');
const { testConnection } = require('../db');

const router = express.Router();
const logger = pino();

// Health check endpoint
router.get('/health', async (req, res) => {
  const dbStatus = await testConnection();
  res.json({
    status: 'ok',
    database: dbStatus ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Ingest incident
router.post('/ingest', async (req, res) => {
  // For Day1: persist to DB later — respond with mock id
  const fakeId = Math.floor(Math.random()*100000);
  logger.info({body:req.body}, 'ingest received');
  return res.json({ incident_id: fakeId });
});

// Get incident by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  logger.info({incident_id: id}, 'fetching incident');
  
  // Mock response for Day 1
  return res.json({
    id: parseInt(id),
    type: 'flood',
    location: 'Riverdale District',
    latitude: 12.34,
    longitude: 56.78,
    severity: 3,
    status: 'active',
    created_at: new Date().toISOString()
  });
});

// Generate response plan for incident
router.post('/:id/plan', async (req, res) => {
  const { id } = req.params;
  logger.info({incident_id: id}, 'generating response plan');
  
  // Mock response for Day 1
  return res.json({
    plan_id: `plan_${id}_${Date.now()}`,
    incident_id: id,
    status: 'generated',
    steps: [
      'Alert local emergency services',
      'Notify disaster response teams',
      'Begin evacuation of affected areas',
      'Set up emergency shelters',
      'Deploy medical assistance'
    ],
    created_at: new Date().toISOString()
  });
});

module.exports = router;
