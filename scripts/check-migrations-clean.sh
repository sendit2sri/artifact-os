#!/usr/bin/env bash
# Verify models are in sync with migrations (no forgotten autogenerate).
# Run from repo root. Requires: DATABASE_URL, alembic, apps/backend.
# Leaves no files behind; uses trap for cleanup on success/failure.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/apps/backend"
VERSIONS_DIR="$BACKEND_DIR/alembic/versions"
CI_MSG="ci_check_do_not_commit"

cleanup() {
  cd "$REPO_ROOT"
  rm -f "${OUT:-}" 2>/dev/null || true
  rm -f "$VERSIONS_DIR"/*${CI_MSG}*.py 2>/dev/null || true
  git checkout -- apps/backend/alembic/versions/ 2>/dev/null || true
}
trap cleanup EXIT

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

# 4. Autogenerate: creates a new file only if models changed
BEFORE=$(find "$VERSIONS_DIR" -name "*.py" ! -name "__init__.py" 2>/dev/null | wc -l | tr -d ' ')
OUT="$(mktemp)"
alembic revision --autogenerate -m "$CI_MSG" >"$OUT" 2>&1 || {
  echo "Migration check failed while autogenerating:"
  cat "$OUT"
  rm -f "$OUT"
  exit 1
}
rm -f "$OUT"
AFTER=$(find "$VERSIONS_DIR" -name "*.py" ! -name "__init__.py" 2>/dev/null | wc -l | tr -d ' ')

# 5. Fail if new file appeared (models out of sync)
if [ "$AFTER" -gt "$BEFORE" ]; then
  echo "Models out of sync. Run: cd apps/backend && alembic revision --autogenerate -m 'your_message'"
  exit 1
fi

echo "Migrations OK (models in sync)"
