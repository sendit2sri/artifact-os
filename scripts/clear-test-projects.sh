#!/usr/bin/env bash
# Clear all projects (and their data) for a fresh E2E/testing start.
# Requires: backend running with ARTIFACT_ENABLE_TEST_SEED=true.
# Usage: ./scripts/clear-test-projects.sh   OR   BACKEND_URL=http://localhost:8000 ./scripts/clear-test-projects.sh

set -e
BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
URL="${BACKEND_URL}/api/v1/test/clear_projects"

echo "Clearing all projects at $URL ..."
res=$(curl -s -w "\n%{http_code}" -X POST "$URL")
body=$(echo "$res" | head -n -1)
code=$(echo "$res" | tail -n 1)

if [ "$code" = "200" ]; then
  echo "$body" | head -c 500
  echo ""
  echo "Done. You can start E2E with a fresh DB state."
else
  echo "Failed (HTTP $code). Ensure backend is running and ARTIFACT_ENABLE_TEST_SEED=true."
  echo "$body"
  exit 1
fi
