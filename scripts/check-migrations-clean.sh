#!/usr/bin/env bash
# Verify models are in sync with migrations (no forgotten autogenerate).
# Run from repo root. Requires: DATABASE_URL, alembic, apps/backend.
# Leaves no files behind; uses trap for cleanup on success/failure.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/apps/backend"

cd "$BACKEND_DIR"

# 1. Require clean git state in alembic/versions
if [ -n "$(git -C "$REPO_ROOT" status --porcelain -- apps/backend/alembic/versions/)" ]; then
  echo "alembic/versions has uncommitted changes. Commit or stash first."
  exit 1
fi

# 2. Require DATABASE_URL (same DB that alembic upgrade head used)
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL required"
  exit 1
fi

# 3. Upgrade to latest (CI already did this; SKIP_UPGRADE=1 to skip)
if [ "${SKIP_UPGRADE:-0}" != "1" ]; then
  alembic upgrade head
fi

# 4. Check for pending autogenerate ops (no file creation)
alembic check || {
  echo "Models out of sync. Run: cd apps/backend && alembic revision --autogenerate -m 'your_message'"
  exit 1
}

echo "Migrations OK (models in sync)"
