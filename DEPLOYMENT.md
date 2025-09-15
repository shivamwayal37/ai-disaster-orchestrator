# Deployment Guide - Render

This guide covers deploying the AI Disaster Response Orchestrator backend to Render.

## Prerequisites

1. **Render Account**: Sign up at [render.com](https://render.com)
2. **GitHub Repository**: Your code should be pushed to GitHub
3. **Environment Variables**: Prepare all required API keys and credentials

## Required Environment Variables

Set these in your Render service dashboard:

### Database Configuration
```
DATABASE_URL=mysql://username:password@host:port/database?sslaccept=strict
TIDB_HOST=gateway01.ap-southeast-1.prod.aws.tidbcloud.com
TIDB_PORT=4000
TIDB_USER=your_tidb_user
TIDB_PASSWORD=your_tidb_password
TIDB_DATABASE=your_database_name
```

### API Keys
```
OPENAI_API_KEY=sk-...
KIMI_API_KEY=your_kimi_key
GOOGLE_MAPS_API_KEY=your_google_maps_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1234567890
```

### External Services
```
REDIS_URL=redis://localhost:6379
OPENWEATHER_API_KEY=your_openweather_key
NASA_API_KEY=your_nasa_key
TWITTER_BEARER_TOKEN=your_twitter_token
```

### Application Settings
```
NODE_ENV=production
PORT=10000
FRONTEND_URL=https://your-frontend-domain.vercel.app
```

## Deployment Steps

### Option 1: Using render.yaml (Recommended)

1. **Push render.yaml**: The `render.yaml` file is already configured in your repository root
2. **Connect Repository**: In Render dashboard, create a new service and connect your GitHub repo
3. **Auto-Deploy**: Render will automatically detect the `render.yaml` and deploy both web service and Redis
4. **Set Environment Variables**: Add all required environment variables in the Render dashboard
5. **Deploy**: Render will build and deploy your application

### Option 2: Manual Service Creation

1. **Create Web Service**:
   - Service Type: Web Service
   - Environment: Node
   - Build Command: `cd packages/backend && npm install && npx prisma generate`
   - Start Command: `cd packages/backend && npm start`
   - Health Check Path: `/health`

2. **Create Redis Service**:
   - Service Type: Redis
   - Plan: Starter (or higher based on needs)

3. **Configure Environment Variables**: Add all variables listed above

## Post-Deployment

### Verify Deployment
1. Check health endpoint: `https://your-service.onrender.com/health`
2. Test API endpoints: `https://your-service.onrender.com/api/`
3. Monitor logs in Render dashboard

### Database Setup
1. Ensure TiDB Serverless is properly configured
2. Run database migrations if needed: `npx prisma migrate deploy`
3. Verify database connectivity through health checks

### Performance Optimization
1. **Redis**: Use Render's Redis service for caching and session storage
2. **Environment**: Set `NODE_ENV=production` for optimized performance
3. **Monitoring**: Enable Render's built-in monitoring and alerts

## Troubleshooting

### Common Issues

1. **Build Failures**:
   - Check that all dependencies are in `package.json`
   - Verify Node.js version compatibility (using Node 20)
   - Ensure Prisma generates correctly

2. **Database Connection**:
   - Verify TiDB credentials and connection string
   - Check firewall settings for TiDB Cloud
   - Ensure SSL is properly configured

3. **Environment Variables**:
   - Double-check all API keys are set correctly
   - Verify Redis URL format
   - Ensure frontend URL is correct for CORS

4. **Health Check Failures**:
   - Verify `/health` endpoint is accessible
   - Check application startup logs
   - Ensure port 10000 is used (Render's default)

### Logs and Monitoring
- Access logs through Render dashboard
- Use structured logging with Pino for better debugging
- Monitor response times and error rates

## Security Considerations

1. **Environment Variables**: Never commit API keys to repository
2. **CORS**: Configure proper CORS origins for production
3. **Rate Limiting**: Built-in rate limiting is configured (100 req/15min)
4. **Helmet**: Security headers are automatically applied
5. **SSL**: Render provides SSL certificates automatically

## Scaling

- **Horizontal Scaling**: Render supports auto-scaling based on traffic
- **Database**: TiDB Serverless scales automatically
- **Redis**: Upgrade Redis plan as needed for larger cache requirements
- **Monitoring**: Set up alerts for high CPU/memory usage

## Cost Optimization

- **Starter Plan**: Sufficient for development and small-scale production
- **Sleep Mode**: Free tier services sleep after inactivity
- **Resource Monitoring**: Monitor usage to optimize plan selection
