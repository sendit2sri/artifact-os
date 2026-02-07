#!/bin/bash

# Quick-start script for running synthesis E2E tests
# Usage: ./run-synthesis-tests.sh

set -e

echo "🧪 Running Synthesis E2E Tests..."
echo ""

# Navigate to web directory
cd "$(dirname "$0")/apps/web"

# Check if backend is running
echo "🔍 Checking if backend is running..."
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "❌ Backend is not running on http://localhost:8000"
    echo ""
    echo "Please start the backend first:"
    echo "  ./start-backend-e2e.sh"
    echo ""
    echo "Or manually:"
    echo "  cd apps/backend"
    echo "  export ARTIFACT_E2E_MODE=true"
    echo "  export ARTIFACT_ENABLE_TEST_SEED=true"
    echo "  python -m uvicorn app.main:app --reload"
    exit 1
fi

echo "✅ Backend is running"
echo ""

# Check if test seed endpoint is enabled
echo "🔍 Checking test seed endpoint..."
SEED_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null -X POST http://localhost:8000/api/v1/test/seed)

if [ "$SEED_RESPONSE" = "403" ]; then
    echo "❌ Test seed endpoint is disabled!"
    echo ""
    echo "Backend must have ARTIFACT_ENABLE_TEST_SEED=true"
    echo "Please restart backend with:"
    echo "  ./start-backend-e2e.sh"
    exit 1
elif [ "$SEED_RESPONSE" = "200" ]; then
    echo "✅ Test seed endpoint is enabled"
else
    echo "⚠️  Unexpected response from test seed: $SEED_RESPONSE"
fi
echo ""

# Check if frontend dev server is needed
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Frontend dev server is running"
    echo "🧪 Running tests with PLAYWRIGHT_SKIP_WEBSERVER=1..."
    echo ""
    PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test synthesis-flow.spec.ts --workers=3
else
    echo "⚠️  Frontend dev server not detected"
    echo "🧪 Playwright will start dev server automatically (slower)..."
    echo ""
    npx playwright test synthesis-flow.spec.ts --workers=3
fi

echo ""
echo "✅ Tests complete!"
