#!/usr/bin/env bash
# Verify models are in sync with migrations (no forgotten autogenerate).
# Run from repo root. CI: DATABASE_URL + alembic in PATH. Local Docker: use make db-check or run via backend container.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/apps/backend"

# Run alembic: use PATH if available, else via Docker (backend container has DATABASE_URL from .env)
run_alembic() {
  if command -v alembic >/dev/null 2>&1; then
    alembic "$@"
  else
    (cd "$REPO_ROOT" && docker compose exec -T backend bash -c "cd /app && alembic $*")
  fi
}

cd "$BACKEND_DIR"

# 1. Require clean git state in alembic/versions
if [ -n "$(git -C "$REPO_ROOT" status --porcelain -- apps/backend/alembic/versions/)" ]; then
  echo "alembic/versions has uncommitted changes. Commit or stash first."
  exit 1
fi

# 2. Require DATABASE_URL when running alembic locally (Docker uses .env)
if ! command -v alembic >/dev/null 2>&1; then
  : # Using Docker; DATABASE_URL from container .env
elif [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL required (or use: make db-check)"
  exit 1
fi

# 3. Upgrade to latest (CI already did this; SKIP_UPGRADE=1 to skip)
if [ "${SKIP_UPGRADE:-0}" != "1" ]; then
  run_alembic upgrade head
fi

# 4. Check for pending autogenerate ops (no file creation)
run_alembic check || {
  echo "Models out of sync. Run: make db-rev msg='your_message' (or alembic revision --autogenerate)"
  exit 1
}

echo "Migrations OK (models in sync)"
