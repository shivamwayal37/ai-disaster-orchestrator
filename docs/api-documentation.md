# AI Disaster Response Orchestrator - API Documentation

## Overview

The AI Disaster Response Orchestrator provides a comprehensive REST API for disaster management, real-time alert processing, AI-powered response planning, and multi-modal search capabilities.

**Base URL**: `http://localhost:3001/api`
**Version**: 1.0.0
**Content-Type**: `application/json`

## Authentication

Currently, all endpoints are public for development. In production, implement API key authentication:

```http
Authorization: Bearer YOUR_API_KEY
```

## Rate Limiting

- **General endpoints**: 100 requests per 15 minutes per IP
- **Orchestration endpoints**: 20 requests per 15 minutes per IP
- **Search endpoints**: 50 requests per 15 minutes per IP

## Core API Endpoints

### 1. Alerts Management

#### Get All Alerts
```http
GET /api/alerts
```

**Query Parameters:**
- `limit` (integer, optional): Number of results (default: 20, max: 100)
- `offset` (integer, optional): Pagination offset (default: 0)
- `severity` (integer, optional): Filter by severity level (1-4)
- `type` (string, optional): Filter by alert type
- `location` (string, optional): Filter by location
- `active` (boolean, optional): Filter active/inactive alerts

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "12345",
      "title": "Wildfire Alert - Napa Valley",
      "description": "Fast-spreading wildfire threatening residential areas",
      "alertType": "wildfire",
      "severity": 3,
      "location": "Napa Valley, California",
      "latitude": 38.5025,
      "longitude": -122.2654,
      "isActive": true,
      "createdAt": "2025-09-15T12:00:00Z",
      "updatedAt": "2025-09-15T12:30:00Z",
      "source": "weather_api",
      "rawData": {
        "temperature": "45°C",
        "windSpeed": "25 mph",
        "humidity": "15%"
      }
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

#### Get Alert by ID
```http
GET /api/alerts/{id}
```

**Path Parameters:**
- `id` (string, required): Alert identifier

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "12345",
    "title": "Wildfire Alert - Napa Valley",
    "description": "Fast-spreading wildfire threatening residential areas",
    "alertType": "wildfire",
    "severity": 3,
    "location": "Napa Valley, California",
    "latitude": 38.5025,
    "longitude": -122.2654,
    "isActive": true,
    "createdAt": "2025-09-15T12:00:00Z",
    "updatedAt": "2025-09-15T12:30:00Z",
    "embedding": [0.1, 0.2, ...], // 1536-dimensional vector
    "documents": [
      {
        "id": "doc_123",
        "title": "Wildfire Response Protocol",
        "content": "Emergency procedures for wildfire incidents...",
        "type": "protocol"
      }
    ]
  }
}
```

#### Create New Alert
```http
POST /api/alerts
```

**Request Body:**
```json
{
  "title": "Emergency Alert Title",
  "description": "Detailed description of the emergency situation",
  "alertType": "wildfire|flood|earthquake|cyclone|heatwave|landslide|other",
  "severity": 1, // 1=Low, 2=Medium, 3=High, 4=Critical
  "location": "Geographic location",
  "latitude": 38.5025,
  "longitude": -122.2654,
  "source": "weather_api|social_media|satellite|manual",
  "rawData": {
    "additional": "metadata"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "12346",
    "message": "Alert created successfully"
  }
}
```

#### Update Alert Status
```http
PATCH /api/alerts/{id}/status
```

**Request Body:**
```json
{
  "status": "PENDING|PROCESSING|RESOLVED|FALSE_ALARM",
  "metadata": {
    "resolvedBy": "system|user_id",
    "resolution": "Description of resolution"
  }
}
```

#### Real-time Alert Stream
```http
GET /api/alerts/stream
```

**Response**: Server-Sent Events (SSE) stream
```
event: alert
data: {"id": "12347", "title": "New Emergency Alert", ...}

event: update
data: {"id": "12345", "status": "RESOLVED"}

event: heartbeat
data: {"timestamp": "2025-09-15T12:00:00Z"}
```

### 2. AI Orchestration

#### Generate Response Plan
```http
POST /api/orchestrate
```

**Request Body:**
```json
{
  "query": "Fast-spreading wildfire with strong winds threatening residential areas",
  "type": "wildfire",
  "location": "Napa Valley, California",
  "severity": "high",
  "metadata": {
    "timestamp": "2025-09-15T12:00:00Z",
    "alertId": "12345",
    "source": "frontend_alert_panel"
  }
}
```

**Response:**
```json
{
  "success": true,
  "action_plan": {
    "summary": "A fast-spreading wildfire with strong winds is threatening residential areas in Napa Valley, California.",
    "risk_level": "CRITICAL",
    "time_sensitivity": "IMMEDIATE",
    "estimated_impact": "Potential loss of life, property damage, and disruption of essential services.",
    "immediate_actions": [
      {
        "action": "Evacuate residents from the affected areas and surrounding communities",
        "priority": 1,
        "timeline": "0-1 hour"
      },
      {
        "action": "Dispatch emergency responders and firefighting teams to combat the wildfire",
        "priority": 2,
        "timeline": "0-1 hour"
      }
    ],
    "resource_requirements": {
      "personnel": ["Firefighters", "Police officers", "Emergency medical technicians"],
      "equipment": ["Fire trucks", "Helicopters for water drops", "Portable radios"],
      "facilities": ["Emergency shelters", "Temporary command center"]
    },
    "response_timeline": {
      "immediate": "Evacuation orders and initial firefighting efforts within 0-1 hour",
      "short_term": "Assessing damage, providing medical assistance, and securing the area within 1-6 hours",
      "medium_term": "Restoration of essential services, debris removal, and preliminary damage assessment within 6-24 hours"
    },
    "coordination_requirements": {
      "primary_agencies": ["California Department of Forestry and Fire Protection", "Napa County Sheriff's Office", "American Red Cross"],
      "communication_plan": "Establish a unified command structure with regular briefings and updates among agencies",
      "public_information": "Advise residents to evacuate, provide updates on fire status, and inform about available resources and shelters"
    },
    "estimated_cost": "High due to extensive personnel and equipment needs",
    "generated_at": "2025-09-15T12:00:00Z",
    "request_id": "req_12345",
    "cached": false
  }
}
```

### 3. Search & Retrieval

#### Hybrid Search
```http
POST /api/search/hybrid
```

**Request Body:**
```json
{
  "query": "wildfire evacuation procedures",
  "limit": 10,
  "threshold": 0.7,
  "filters": {
    "category": "protocol",
    "type": "wildfire",
    "location": "California"
  },
  "weights": {
    "vector": 0.4,
    "text": 0.6
  }
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "id": "doc_123",
      "title": "Wildfire Evacuation Protocol",
      "content": "Standard operating procedures for wildfire evacuations...",
      "category": "protocol",
      "similarity": 0.89,
      "text_score": 0.76,
      "combined_score": 0.82,
      "metadata": {
        "source": "emergency_manual",
        "last_updated": "2024-08-15T10:00:00Z"
      }
    }
  ],
  "query_info": {
    "processed_query": "wildfire evacuation procedures",
    "embedding_generated": true,
    "search_type": "hybrid",
    "total_results": 25
  }
}
```

#### Vector Search
```http
POST /api/search/vector
```

**Request Body:**
```json
{
  "query": "earthquake response protocols",
  "limit": 5,
  "threshold": 0.8,
  "filters": {
    "category": "protocol|report|social_media"
  }
}
```

#### Full-text Search
```http
POST /api/search/fulltext
```

**Request Body:**
```json
{
  "query": "flood warning Mumbai",
  "limit": 10,
  "filters": {
    "location": "Mumbai",
    "type": "flood"
  }
}
```

#### Geospatial Search
```http
POST /api/search/geospatial
```

**Request Body:**
```json
{
  "latitude": 19.0760,
  "longitude": 72.8777,
  "radius": 50, // kilometers
  "limit": 20,
  "filters": {
    "type": "shelter|hospital|emergency_center"
  }
}
```

### 4. Incidents Management

#### Get All Incidents
```http
GET /api/incidents
```

**Query Parameters:**
- `limit` (integer): Results per page (default: 20)
- `offset` (integer): Pagination offset
- `type` (string): Filter by incident type
- `severity` (integer): Filter by severity (1-4)
- `location` (string): Filter by location
- `startDate` (string): ISO date string
- `endDate` (string): ISO date string

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "incident_123",
      "title": "Mumbai Flood Alert",
      "description": "Heavy rainfall causing flooding in low-lying areas",
      "type": "flood",
      "severity": 3,
      "location": "Mumbai, Maharashtra",
      "latitude": 19.0760,
      "longitude": 72.8777,
      "createdAt": "2025-09-15T08:00:00Z",
      "source": "weather_api",
      "isActive": true,
      "embedding": [0.1, 0.2, ...],
      "metadata": {
        "rainfall": "150mm",
        "affected_areas": ["Dharavi", "Kurla", "Andheri East"]
      }
    }
  ],
  "pagination": {
    "total": 500,
    "page": 1,
    "limit": 20,
    "totalPages": 25
  }
}
```

### 5. Document Management

#### Get Documents
```http
GET /api/documents
```

**Query Parameters:**
- `category` (string): protocol|report|social_media|manual
- `type` (string): Disaster type filter
- `limit` (integer): Results per page
- `offset` (integer): Pagination offset

#### Search Documents
```http
POST /api/documents/search
```

**Request Body:**
```json
{
  "query": "emergency shelter procedures",
  "category": "protocol",
  "limit": 10
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "validation error details"
  },
  "timestamp": "2025-09-15T12:00:00Z"
}
```

### Common Error Codes

- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid API key)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error
- `503` - Service Unavailable (database/external service down)

## Data Models

### Alert Model
```typescript
interface Alert {
  id: string;
  title: string;
  description: string;
  alertType: 'wildfire' | 'flood' | 'earthquake' | 'cyclone' | 'heatwave' | 'landslide' | 'other';
  severity: 1 | 2 | 3 | 4; // Low | Medium | High | Critical
  location: string;
  latitude?: number;
  longitude?: number;
  isActive: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  source: 'weather_api' | 'social_media' | 'satellite' | 'manual';
  embedding?: number[]; // 1536-dimensional vector
  rawData?: Record<string, any>;
}
```

### Document Model
```typescript
interface Document {
  id: string;
  title: string;
  content: string;
  category: 'protocol' | 'report' | 'social_media' | 'manual';
  type?: string; // disaster type
  embedding?: number[]; // 1536-dimensional vector
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
```

### Action Plan Model
```typescript
interface ActionPlan {
  summary: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  time_sensitivity: 'LOW' | 'MEDIUM' | 'HIGH' | 'IMMEDIATE';
  estimated_impact: string;
  immediate_actions: Array<{
    action: string;
    priority: number;
    timeline: string;
  }>;
  resource_requirements: {
    personnel: string[];
    equipment: string[];
    facilities: string[];
  };
  response_timeline: {
    immediate: string;
    short_term: string;
    medium_term: string;
  };
  coordination_requirements: {
    primary_agencies: string[];
    communication_plan: string;
    public_information: string;
  };
  estimated_cost: string;
  generated_at: string;
  request_id: string;
  cached: boolean;
}
```

## Integration Examples

### JavaScript/Node.js
```javascript
const API_BASE = 'http://localhost:3001/api';

// Get all alerts
const alerts = await fetch(`${API_BASE}/alerts?limit=10&severity=3`)
  .then(res => res.json());

// Generate response plan
const actionPlan = await fetch(`${API_BASE}/orchestrate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'Wildfire threatening residential areas',
    type: 'wildfire',
    location: 'California',
    severity: 'high'
  })
}).then(res => res.json());

// Real-time alert stream
const eventSource = new EventSource(`${API_BASE}/alerts/stream`);
eventSource.onmessage = (event) => {
  const alert = JSON.parse(event.data);
  console.log('New alert:', alert);
};
```

### Python
```python
import requests
import json

API_BASE = 'http://localhost:3001/api'

# Get alerts
response = requests.get(f'{API_BASE}/alerts', params={
    'limit': 10,
    'severity': 3
})
alerts = response.json()

# Generate action plan
plan_response = requests.post(f'{API_BASE}/orchestrate', json={
    'query': 'Earthquake in urban area',
    'type': 'earthquake',
    'location': 'San Francisco',
    'severity': 'high'
})
action_plan = plan_response.json()
```

### cURL Examples
```bash
# Get all alerts
curl -X GET "http://localhost:3001/api/alerts?limit=5&severity=3" \
  -H "Content-Type: application/json"

# Create new alert
curl -X POST "http://localhost:3001/api/alerts" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Flash Flood Warning",
    "description": "Rapid water rise in downtown area",
    "alertType": "flood",
    "severity": 3,
    "location": "Downtown District",
    "source": "manual"
  }'

# Generate response plan
curl -X POST "http://localhost:3001/api/orchestrate" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Flash flood in urban area with trapped vehicles",
    "type": "flood",
    "location": "Downtown District",
    "severity": "high"
  }'

# Hybrid search
curl -X POST "http://localhost:3001/api/search/hybrid" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "flood evacuation procedures",
    "limit": 5,
    "threshold": 0.7
  }'
```

## Webhooks (Future Implementation)

### Alert Webhooks
```http
POST /api/webhooks/alerts
```

Configure webhook endpoints to receive real-time alert notifications:

```json
{
  "url": "https://your-app.com/webhooks/alerts",
  "events": ["alert.created", "alert.updated", "alert.resolved"],
  "secret": "webhook_secret_key"
}
```

## SDK Libraries (Planned)

- **JavaScript/TypeScript**: `@disaster-orchestrator/js-sdk`
- **Python**: `disaster-orchestrator-python`
- **Go**: `disaster-orchestrator-go`

## Support

- **Documentation**: [https://docs.disaster-orchestrator.com](https://docs.disaster-orchestrator.com)
- **GitHub Issues**: [https://github.com/your-org/ai-disaster-orchestrator/issues](https://github.com/your-org/ai-disaster-orchestrator/issues)
- **Email**: support@disaster-orchestrator.com

---

**Last Updated**: September 15, 2025
**API Version**: 1.0.0
