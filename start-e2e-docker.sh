#!/bin/bash

# Start backend + database with Docker for E2E testing
# Usage: ./start-e2e-docker.sh

set -e

echo "🐳 Starting E2E environment with Docker..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop."
    exit 1
fi

# Navigate to project root
cd "$(dirname "$0")"

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
fi

# Add E2E mode to .env if not present
if ! grep -q "ARTIFACT_E2E_MODE" .env; then
    echo "" >> .env
    echo "# E2E Testing" >> .env
    echo "ARTIFACT_E2E_MODE=true" >> .env
    echo "ARTIFACT_ENABLE_TEST_SEED=true" >> .env
fi

# Update .env to enable E2E mode
sed -i.bak 's/ARTIFACT_E2E_MODE=false/ARTIFACT_E2E_MODE=true/' .env
sed -i.bak 's/ARTIFACT_ENABLE_TEST_SEED=false/ARTIFACT_ENABLE_TEST_SEED=true/' .env
rm -f .env.bak

echo "✅ E2E mode enabled in .env"
echo ""

# Start only the services needed for E2E tests
echo "🚀 Starting database, redis, and backend..."
docker-compose up -d db redis backend

echo ""
echo "⏳ Waiting for backend to be ready..."
sleep 5

# Wait for backend health check
MAX_ATTEMPTS=30
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅ Backend is ready!"
        break
    fi
    echo "   Waiting... ($((ATTEMPT+1))/$MAX_ATTEMPTS)"
    sleep 2
    ATTEMPT=$((ATTEMPT+1))
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo "❌ Backend failed to start. Check logs:"
    echo "   docker-compose logs backend"
    exit 1
fi

echo ""
echo "✅ E2E environment is ready!"
echo ""
echo "Backend: http://localhost:8000"
echo "Database: postgresql://postgres:postgres@localhost:5432/artifact_dev"
echo ""
echo "To run synthesis tests:"
echo "  cd apps/web"
echo "  npm run dev  # In another terminal"
echo "  ./run-synthesis-tests.sh"
echo ""
echo "To view logs:"
echo "  docker-compose logs -f backend"
echo ""
echo "To stop:"
echo "  docker-compose down"
