#!/bin/bash

# Quick-start script for running backend in E2E mode
# Usage: ./start-backend-e2e.sh

set -e

echo "🚀 Starting Backend in E2E Mode..."
echo ""

# Navigate to backend directory
cd "$(dirname "$0")/apps/backend"

# Set E2E mode environment variables
export ARTIFACT_E2E_MODE=true
export ARTIFACT_ENABLE_TEST_SEED=true

echo "✅ Environment variables set:"
echo "   ARTIFACT_E2E_MODE=$ARTIFACT_E2E_MODE"
echo "   ARTIFACT_ENABLE_TEST_SEED=$ARTIFACT_ENABLE_TEST_SEED"
echo ""

# Check if backend dependencies are installed
if ! command -v uvicorn &> /dev/null; then
    echo "⚠️  uvicorn not found. Attempting to install dependencies..."
    
    if [ -f "pyproject.toml" ] && command -v poetry &> /dev/null; then
        echo "📦 Installing with poetry..."
        poetry install
        echo "🚀 Starting backend with poetry..."
        poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
    elif [ -f "Pipfile" ] && command -v pipenv &> /dev/null; then
        echo "📦 Installing with pipenv..."
        pipenv install
        echo "🚀 Starting backend with pipenv..."
        pipenv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
    elif [ -f "requirements.txt" ]; then
        echo "📦 Installing with pip..."
        echo ""
        echo "⚠️  If PyMuPDF fails to build, use minimal E2E requirements:"
        echo "   pip install -r requirements-e2e.txt"
        echo ""
        pip install -r requirements.txt || {
            echo ""
            echo "❌ Full requirements failed. Trying minimal E2E requirements..."
            pip install -r requirements-e2e.txt
        }
        echo "🚀 Starting backend with python..."
        python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
    else
        echo "❌ Could not find a way to install dependencies."
        echo "   Please manually install: pip install -r requirements.txt"
        exit 1
    fi
else
    echo "🚀 Starting backend with uvicorn..."
    python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
fi
