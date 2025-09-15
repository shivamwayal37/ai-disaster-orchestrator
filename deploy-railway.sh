#!/bin/bash

# Railway Deployment Script for AI Disaster Response Orchestrator Backend

echo "🚀 Deploying Backend to Railway..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Login to Railway (if not already logged in)
echo "Logging into Railway..."
railway login

# Initialize Railway project
echo "Initializing Railway project..."
railway init

# Set environment variables (you'll need to add these manually in Railway dashboard)
echo "⚠️  Don't forget to add these environment variables in Railway dashboard:"
echo "- DATABASE_URL"
echo "- KIMI_API_KEY"
echo "- OPENAI_API_KEY"
echo "- JINA_API_KEY"
echo "- GOOGLE_MAPS_API_KEY (optional)"
echo "- TWILIO_ACCOUNT_SID (optional)"
echo "- TWILIO_AUTH_TOKEN (optional)"

# Deploy
echo "Deploying to Railway..."
railway up

echo "✅ Deployment complete!"
echo "Your backend will be available at the URL provided by Railway"
echo "Update your frontend NEXT_PUBLIC_BACKEND_URL to point to the Railway URL"
