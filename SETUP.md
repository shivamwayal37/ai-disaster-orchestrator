# 🚀 **Setup Guide** - AI Disaster Response Orchestrator

## 📋 **Prerequisites**

- **Node.js** 20+ ([Download](https://nodejs.org/))
- **Docker & Docker Compose** ([Download](https://www.docker.com/get-started))
- **Git** ([Download](https://git-scm.com/downloads))

## ⚡ **Quick Start Options**

### Option 1: One-Command Demo (Recommended)
```bash
git clone https://github.com/your-username/ai-disaster-orchestrator.git
cd ai-disaster-orchestrator
cp .env.example .env
# Edit .env with your API keys (see API Keys section below)
npm run demo:start
```

### Option 2: Development Setup
```bash
git clone https://github.com/your-username/ai-disaster-orchestrator.git
cd ai-disaster-orchestrator
npm install
npm run setup:dev
npm run dev
```

## 🔑 **Required API Keys**

### 1. TiDB Serverless Database (REQUIRED)
1. Sign up at [TiDB Cloud](https://tidbcloud.com/)
2. Create a new Serverless cluster
3. Get connection details from the cluster dashboard
4. Add to `.env`:
```bash
DATABASE_URL="mysql://username:password@gateway01.us-west-2.prod.aws.tidbcloud.com:4000/database_name?ssl={\"rejectUnauthorized\":true}"
```

### 2. Kimi AI - Entity Extraction (REQUIRED)
1. Sign up at [Moonshot AI](https://platform.moonshot.cn/)
2. Get API key from console
3. Add to `.env`:
```bash
KIMI_API_KEY=your_kimi_api_key_here
```

### 3. OpenAI - Response Planning (REQUIRED)
1. Sign up at [OpenAI](https://platform.openai.com/)
2. Get API key from dashboard
3. Add to `.env`:
```bash
OPENAI_API_KEY=your_openai_api_key_here
```

### 4. Jina AI - Text Embeddings (REQUIRED)
1. Sign up at [Jina AI](https://jina.ai/embeddings/)
2. Get API key from dashboard
3. Add to `.env`:
```bash
JINA_API_KEY=your_jina_api_key_here
```

### 5. Google Maps - Route Planning (OPTIONAL)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Maps JavaScript API and Directions API
3. Create API key with restrictions
4. Add to `.env`:
```bash
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

### 6. Twilio - SMS Notifications (OPTIONAL)
1. Sign up at [Twilio](https://console.twilio.com/)
2. Get Account SID, Auth Token, and phone number
3. Add to `.env`:
```bash
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

## 🛠️ **Manual Setup Steps**

### 1. Clone and Install
```bash
git clone https://github.com/your-username/ai-disaster-orchestrator.git
cd ai-disaster-orchestrator
npm install
```

### 2. Environment Configuration
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Database Setup
```bash
npm run db:setup
npm run db:migrate
```

### 4. Seed Demo Data
```bash
npm run db:seed
npm run ingestion:demo
```

### 5. Start Services
```bash
# Option A: All services with Docker
docker-compose up -d
npm run dev

# Option B: Manual services
npm run dev:backend    # Terminal 1
npm run dev:frontend   # Terminal 2
npm run worker:embedding  # Terminal 3 (optional)
```

## 🌐 **Access Points**

- **Frontend Dashboard**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **API Documentation**: http://localhost:3001/api/docs
- **Health Check**: http://localhost:3001/api/health
- **Redis**: localhost:6379

## 🧪 **Testing the Setup**

### 1. Health Check
```bash
npm run health
# Should return: {"status":"healthy","timestamp":"..."}
```

### 2. Test API Endpoints
```bash
# Test search
curl "http://localhost:3001/api/search?q=wildfire&limit=5"

# Test orchestration
curl -X POST "http://localhost:3001/api/orchestrate" \
  -H "Content-Type: application/json" \
  -d '{"query":"Wildfire emergency in California","type":"wildfire","location":"California","severity":"high"}'
```

### 3. Frontend Demo
1. Open http://localhost:3000
2. You should see real-time alerts dashboard
3. Click on any alert to generate AI response plan
4. Search for "wildfire" to test hybrid search

## 🐛 **Troubleshooting**

### Common Issues

**Port Already in Use**
```bash
# Kill processes on ports 3000, 3001
npx kill-port 3000 3001
```

**Database Connection Failed**
```bash
# Check TiDB connection
npm run db:test
```

**Redis Connection Failed**
```bash
# Start Redis with Docker
docker run -d -p 6379:6379 redis:alpine
```

**Missing API Keys**
```bash
# Verify environment variables
npm run config:check
```

### Docker Issues
```bash
# Rebuild containers
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# View logs
npm run logs
```

### Performance Issues
```bash
# Check system resources
docker stats

# Reduce worker concurrency in .env
WORKER_CONCURRENCY=1
EMBEDDING_BATCH_SIZE=5
```

## 📊 **Monitoring**

### View Logs
```bash
# All services
npm run logs

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Database Statistics
```bash
# Check data counts
npm run db:stats

# View recent alerts
npm run db:alerts
```

### Performance Monitoring
```bash
# API response times
curl -w "@curl-format.txt" -s "http://localhost:3001/api/health"

# Memory usage
docker stats --no-stream
```

## 🚀 **Production Deployment**

### Frontend (Vercel)
```bash
npm run deploy:frontend
```

### Backend (Railway/Render)
```bash
npm run deploy:backend
```

### Full Stack (Docker)
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## 📚 **Next Steps**

1. **Explore the API**: Visit http://localhost:3001/api/docs
2. **Test Real Data**: Configure external API keys for live ingestion
3. **Customize Alerts**: Modify demo data in `scripts/seed-demo-data.js`
4. **Add New Features**: Check `docs/api-integration-guide.md`

## 🆘 **Support**

- **Documentation**: `./docs/`
- **API Reference**: http://localhost:3001/api/docs
- **Issues**: Create GitHub issue with logs and environment details
- **Demo Video**: [Watch the 4-minute demo](https://your-demo-link.com)

---

**🎯 Ready for Demo**: Once setup is complete, you'll have a fully functional AI disaster response system with real-time alerts, vector search, and AI-generated response plans!
