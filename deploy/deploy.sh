#!/bin/bash
# deploy.sh
# Deployment script for Karaya Bandhu on VPS

echo "Starting deployment process..."

# 1. Update Backend
echo "Updating Backend..."
cd backend
git pull origin main
cd ..

# 2. Update Provider Frontend
echo "Updating Provider Frontend..."
cd provider-frontend
git pull origin main
cd ..

# 3. Build and restart containers using docker-compose
echo "Rebuilding and restarting Docker containers..."
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# 4. Clean up unused images (optional, but good for saving disk space)
echo "Cleaning up dangling images..."
docker image prune -f

echo "Deployment completed successfully!"
