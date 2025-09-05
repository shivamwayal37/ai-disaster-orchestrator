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

// Get all incidents/alerts
router.get('/', async (req, res) => {
  logger.info('fetching all incidents');
  
  // Mock response for Day 1 - return sample disaster alerts
  const mockIncidents = [
    {
      id: 1,
      type: 'flood',
      title: 'Flash Flood Warning - Downtown Area',
      location: 'Downtown District',
      latitude: 12.34,
      longitude: 56.78,
      severity: 4,
      status: 'active',
      description: 'Heavy rainfall has caused flash flooding in the downtown area. Water levels rising rapidly.',
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
      updated_at: new Date().toISOString()
    },
    {
      id: 2,
      type: 'wildfire',
      title: 'Wildfire Alert - Northern Hills',
      location: 'Northern Hills Region',
      latitude: 12.56,
      longitude: 56.90,
      severity: 3,
      status: 'monitoring',
      description: 'Wildfire detected in Northern Hills. Fire crews dispatched. Evacuation may be necessary.',
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      updated_at: new Date(Date.now() - 15 * 60 * 1000).toISOString() // 15 minutes ago
    },
    {
      id: 3,
      type: 'earthquake',
      title: 'Seismic Activity - Magnitude 4.2',
      location: 'Eastern Suburbs',
      latitude: 12.12,
      longitude: 56.45,
      severity: 2,
      status: 'resolved',
      description: 'Magnitude 4.2 earthquake detected. No significant damage reported. Monitoring for aftershocks.',
      created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
      updated_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() // 4 hours ago
    }
  ];
  
  return res.json({
    data: mockIncidents,
    total: mockIncidents.length,
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
