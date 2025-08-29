require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pino = require('pino');
const { prisma, testConnection } = require('./db');
const searchRoutes = require('./routes/search');

const logger = pino();
const app = express();
app.use(cors());
app.use(express.json());

// Mount search routes
app.use('/api/search', searchRoutes);

app.get('/health', async (req, res) => {
  const dbStatus = await testConnection();
  res.json({
    status: 'ok',
    database: dbStatus ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/incidents/ingest', async (req, res) => {
  // For Day1: persist to DB later — respond with mock id
  const fakeId = Math.floor(Math.random()*100000);
  logger.info({body:req.body}, 'ingest received');
  return res.json({ incident_id: fakeId });
});

app.get('/api/incidents/:id', async (req, res) => {
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

app.post('/api/incidents/:id/plan', async (req, res) => {
  const { id } = req.params;
  logger.info({incident_id: id}, 'generating plan');
  
  // Mock plan response for Day 1
  return res.json({
    incident_id: parseInt(id),
    plan: {
      situation: "Flood alert in Riverdale District with rising water levels",
      risks: ["Property damage", "Road closures", "Power outages", "Water contamination", "Evacuation delays"],
      resources: ["Emergency vehicles", "Sandbags", "Water pumps", "Medical supplies", "Communication equipment"],
      plan: [
        "Step 1: Deploy emergency response teams to affected area",
        "Step 2: Set up evacuation routes and shelters",
        "Step 3: Distribute sandbags to vulnerable properties",
        "Step 4: Monitor water levels and weather conditions",
        "Step 5: Coordinate with utility companies for power safety"
      ],
      evacuation_points: [
        {"name": "Community Center", "lat": 12.35, "lon": 56.77},
        {"name": "High School Gymnasium", "lat": 12.36, "lon": 56.79}
      ],
      confidence: 0.85,
      assumptions: ["Weather data accuracy", "Road accessibility", "Resource availability"]
    },
    generated_at: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => logger.info(`Backend listening on ${PORT}`));
