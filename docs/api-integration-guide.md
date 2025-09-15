# API Integration Guide

## Quick Start

### 1. Environment Setup

```bash
# Install dependencies
npm install axios # or your preferred HTTP client

# Set environment variables
export API_BASE_URL=http://localhost:3001/api
export API_KEY=your_api_key_here # if authentication is enabled
```

### 2. Basic Client Setup

```javascript
// api-client.js
const axios = require('axios');

class DisasterOrchestratorClient {
  constructor(baseURL = 'http://localhost:3001/api', apiKey = null) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
      }
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      response => response.data,
      error => {
        console.error('API Error:', error.response?.data || error.message);
        throw error;
      }
    );
  }

  // Alert methods
  async getAlerts(params = {}) {
    return this.client.get('/alerts', { params });
  }

  async getAlert(id) {
    return this.client.get(`/alerts/${id}`);
  }

  async createAlert(alertData) {
    return this.client.post('/alerts', alertData);
  }

  async updateAlertStatus(id, status, metadata = {}) {
    return this.client.patch(`/alerts/${id}/status`, { status, metadata });
  }

  // AI Orchestration
  async generateResponsePlan(request) {
    return this.client.post('/orchestrate', request);
  }

  // Search methods
  async hybridSearch(query, options = {}) {
    return this.client.post('/search/hybrid', { query, ...options });
  }

  async vectorSearch(query, options = {}) {
    return this.client.post('/search/vector', { query, ...options });
  }

  async geospatialSearch(lat, lng, radius, options = {}) {
    return this.client.post('/search/geospatial', {
      latitude: lat,
      longitude: lng,
      radius,
      ...options
    });
  }

  // Real-time streaming
  createAlertStream(onAlert, onError = console.error) {
    const eventSource = new EventSource(`${this.client.defaults.baseURL}/alerts/stream`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onAlert(data);
      } catch (error) {
        onError('Failed to parse alert data:', error);
      }
    };

    eventSource.onerror = onError;
    return eventSource;
  }
}

module.exports = DisasterOrchestratorClient;
```

## Usage Examples

### Alert Management

```javascript
const client = new DisasterOrchestratorClient();

// Get recent high-severity alerts
const highSeverityAlerts = await client.getAlerts({
  severity: 3,
  limit: 10,
  active: true
});

console.log(`Found ${highSeverityAlerts.data.length} critical alerts`);

// Create new alert
const newAlert = await client.createAlert({
  title: 'Flash Flood Warning',
  description: 'Rapid water rise detected in downtown area',
  alertType: 'flood',
  severity: 3,
  location: 'Downtown District',
  latitude: 40.7128,
  longitude: -74.0060,
  source: 'manual'
});

console.log(`Created alert: ${newAlert.data.id}`);

// Update alert status
await client.updateAlertStatus(newAlert.data.id, 'PROCESSING', {
  assignedTo: 'emergency_team_1',
  notes: 'Dispatching rescue teams'
});
```

### AI Response Planning

```javascript
// Generate comprehensive response plan
const responsePlan = await client.generateResponsePlan({
  query: 'Major earthquake 7.2 magnitude affecting urban area with collapsed buildings',
  type: 'earthquake',
  location: 'San Francisco, CA',
  severity: 'critical',
  metadata: {
    population: 875000,
    infrastructure: 'high_density',
    resources: 'limited'
  }
});

console.log('Generated Response Plan:');
console.log(`Risk Level: ${responsePlan.action_plan.risk_level}`);
console.log(`Immediate Actions: ${responsePlan.action_plan.immediate_actions.length}`);
console.log(`Estimated Cost: ${responsePlan.action_plan.estimated_cost}`);

// Display immediate actions
responsePlan.action_plan.immediate_actions.forEach((action, index) => {
  console.log(`${index + 1}. ${action.action} (Priority: ${action.priority})`);
});
```

### Search Operations

```javascript
// Hybrid search for emergency protocols
const protocolSearch = await client.hybridSearch(
  'earthquake building collapse rescue procedures',
  {
    limit: 5,
    threshold: 0.8,
    filters: {
      category: 'protocol',
      type: 'earthquake'
    },
    weights: {
      vector: 0.6,  // Emphasize semantic similarity
      text: 0.4     // De-emphasize exact text matches
    }
  }
);

console.log('Found protocols:');
protocolSearch.results.forEach(result => {
  console.log(`- ${result.title} (Score: ${result.combined_score.toFixed(3)})`);
});

// Geospatial search for nearby resources
const nearbyResources = await client.geospatialSearch(
  40.7128, -74.0060, // NYC coordinates
  10, // 10km radius
  {
    limit: 20,
    filters: {
      type: 'shelter'
    }
  }
);

console.log(`Found ${nearbyResources.results.length} shelters within 10km`);
```

### Real-time Alert Monitoring

```javascript
// Set up real-time alert monitoring
const alertStream = client.createAlertStream(
  (alert) => {
    console.log(`🚨 New Alert: ${alert.title}`);
    console.log(`   Severity: ${alert.severity}/4`);
    console.log(`   Location: ${alert.location}`);
    
    // Auto-generate response plan for critical alerts
    if (alert.severity >= 3) {
      client.generateResponsePlan({
        query: alert.description,
        type: alert.alertType,
        location: alert.location,
        severity: alert.severity >= 4 ? 'critical' : 'high'
      }).then(plan => {
        console.log(`✅ Response plan generated for alert ${alert.id}`);
        // Send to emergency management system
        notifyEmergencyTeam(alert, plan);
      });
    }
  },
  (error) => {
    console.error('Alert stream error:', error);
    // Implement reconnection logic
    setTimeout(() => {
      console.log('Reconnecting to alert stream...');
      alertStream.close();
      client.createAlertStream(onAlert, onError);
    }, 5000);
  }
);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Closing alert stream...');
  alertStream.close();
  process.exit(0);
});
```

## Advanced Integration Patterns

### Batch Processing

```javascript
// Process multiple alerts in batch
async function processAlertBatch(alertIds) {
  const results = await Promise.allSettled(
    alertIds.map(async (id) => {
      const alert = await client.getAlert(id);
      const plan = await client.generateResponsePlan({
        query: alert.data.description,
        type: alert.data.alertType,
        location: alert.data.location,
        severity: getSeverityString(alert.data.severity)
      });
      return { alert: alert.data, plan: plan.action_plan };
    })
  );

  const successful = results.filter(r => r.status === 'fulfilled');
  const failed = results.filter(r => r.status === 'rejected');

  console.log(`Processed ${successful.length} alerts, ${failed.length} failed`);
  return successful.map(r => r.value);
}
```

### Caching Strategy

```javascript
// Implement client-side caching
class CachedDisasterClient extends DisasterOrchestratorClient {
  constructor(baseURL, apiKey) {
    super(baseURL, apiKey);
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async getAlert(id) {
    const cacheKey = `alert:${id}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    const result = await super.getAlert(id);
    this.cache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    return result;
  }

  clearCache() {
    this.cache.clear();
  }
}
```

### Error Handling & Retry Logic

```javascript
// Robust error handling with exponential backoff
async function robustApiCall(apiCall, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      const isRetryable = error.response?.status >= 500 || error.code === 'ECONNRESET';
      
      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Usage
const alerts = await robustApiCall(() => client.getAlerts({ severity: 4 }));
```

## Python Integration

```python
import requests
import json
from typing import Dict, List, Optional
import time

class DisasterOrchestratorClient:
    def __init__(self, base_url: str = "http://localhost:3001/api", api_key: Optional[str] = None):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        if api_key:
            self.session.headers.update({"Authorization": f"Bearer {api_key}"})

    def get_alerts(self, **params) -> Dict:
        """Get paginated list of alerts with optional filtering"""
        response = self.session.get(f"{self.base_url}/alerts", params=params)
        response.raise_for_status()
        return response.json()

    def create_alert(self, alert_data: Dict) -> Dict:
        """Create new disaster alert"""
        response = self.session.post(f"{self.base_url}/alerts", json=alert_data)
        response.raise_for_status()
        return response.json()

    def generate_response_plan(self, request_data: Dict) -> Dict:
        """Generate AI-powered response plan"""
        response = self.session.post(f"{self.base_url}/orchestrate", json=request_data)
        response.raise_for_status()
        return response.json()

    def hybrid_search(self, query: str, **options) -> Dict:
        """Perform hybrid vector + full-text search"""
        data = {"query": query, **options}
        response = self.session.post(f"{self.base_url}/search/hybrid", json=data)
        response.raise_for_status()
        return response.json()

# Usage example
client = DisasterOrchestratorClient()

# Get critical alerts
critical_alerts = client.get_alerts(severity=4, limit=5)
print(f"Found {len(critical_alerts['data'])} critical alerts")

# Generate response plan
plan = client.generate_response_plan({
    "query": "Wildfire spreading rapidly through residential area",
    "type": "wildfire",
    "location": "California",
    "severity": "critical"
})

print(f"Response plan generated with {len(plan['action_plan']['immediate_actions'])} immediate actions")
```

## Webhook Integration

```javascript
// Express.js webhook receiver
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Webhook signature verification
function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Webhook endpoint
app.post('/webhooks/alerts', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  
  if (!verifyWebhookSignature(payload, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event, data } = req.body;

  switch (event) {
    case 'alert.created':
      console.log(`New alert created: ${data.title}`);
      handleNewAlert(data);
      break;
    
    case 'alert.updated':
      console.log(`Alert updated: ${data.id}`);
      handleAlertUpdate(data);
      break;
    
    case 'alert.resolved':
      console.log(`Alert resolved: ${data.id}`);
      handleAlertResolution(data);
      break;
  }

  res.json({ received: true });
});

async function handleNewAlert(alert) {
  // Auto-generate response plan for high-severity alerts
  if (alert.severity >= 3) {
    const client = new DisasterOrchestratorClient();
    const plan = await client.generateResponsePlan({
      query: alert.description,
      type: alert.alertType,
      location: alert.location,
      severity: alert.severity >= 4 ? 'critical' : 'high'
    });
    
    // Notify emergency management system
    await notifyEmergencyTeam(alert, plan);
  }
}
```

## Performance Optimization

### Connection Pooling

```javascript
// Use HTTP/2 and connection pooling for better performance
const http2 = require('http2');

class OptimizedDisasterClient {
  constructor(baseURL) {
    this.session = http2.connect(baseURL);
    this.session.on('error', console.error);
  }

  async makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      const headers = {
        ':method': method,
        ':path': path,
        'content-type': 'application/json'
      };

      const req = this.session.request(headers);
      let responseData = '';

      req.on('data', chunk => {
        responseData += chunk;
      });

      req.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (error) {
          reject(error);
        }
      });

      req.on('error', reject);

      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }

  close() {
    this.session.close();
  }
}
```

### Request Batching

```javascript
// Batch multiple requests to reduce network overhead
class BatchingClient extends DisasterOrchestratorClient {
  constructor(baseURL, apiKey) {
    super(baseURL, apiKey);
    this.batchQueue = [];
    this.batchTimeout = null;
    this.batchSize = 10;
    this.batchDelay = 100; // ms
  }

  async batchRequest(endpoint, data) {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({ endpoint, data, resolve, reject });
      
      if (this.batchQueue.length >= this.batchSize) {
        this.processBatch();
      } else if (!this.batchTimeout) {
        this.batchTimeout = setTimeout(() => this.processBatch(), this.batchDelay);
      }
    });
  }

  async processBatch() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    const batch = this.batchQueue.splice(0, this.batchSize);
    
    try {
      const results = await Promise.allSettled(
        batch.map(({ endpoint, data }) => 
          this.client.post(endpoint, data)
        )
      );

      batch.forEach((request, index) => {
        const result = results[index];
        if (result.status === 'fulfilled') {
          request.resolve(result.value);
        } else {
          request.reject(result.reason);
        }
      });
    } catch (error) {
      batch.forEach(request => request.reject(error));
    }
  }
}
```

## Testing

```javascript
// Jest test examples
const DisasterOrchestratorClient = require('./api-client');

describe('DisasterOrchestratorClient', () => {
  let client;

  beforeEach(() => {
    client = new DisasterOrchestratorClient('http://localhost:3001/api');
  });

  test('should create alert successfully', async () => {
    const alertData = {
      title: 'Test Alert',
      description: 'Test emergency situation',
      alertType: 'other',
      severity: 2,
      location: 'Test Location',
      source: 'manual'
    };

    const response = await client.createAlert(alertData);
    
    expect(response.success).toBe(true);
    expect(response.data.id).toBeDefined();
  });

  test('should generate response plan', async () => {
    const request = {
      query: 'Test emergency requiring immediate response',
      type: 'other',
      location: 'Test Location',
      severity: 'high'
    };

    const response = await client.generateResponsePlan(request);
    
    expect(response.success).toBe(true);
    expect(response.action_plan).toBeDefined();
    expect(response.action_plan.immediate_actions).toBeInstanceOf(Array);
  });

  test('should handle API errors gracefully', async () => {
    await expect(client.getAlert('invalid-id')).rejects.toThrow();
  });
});
```

This integration guide provides comprehensive examples for integrating with the AI Disaster Response Orchestrator API across different programming languages and use cases.
