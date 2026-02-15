#!/usr/bin/env bash
# Prevent specs from using absolute URLs or BASE_URL concatenation.
# baseURL is set in playwright.config.ts; specs must use relative paths only.
# Allowed: global-setup.ts, playwright.config.ts

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Exclude global-setup (uses BASE_URL for fetch). BACKEND_URL (localhost:8000) is OK for API calls.
if command -v rg >/dev/null 2>&1; then
  MATCHES=$(rg -n "http://localhost:3000|BASE_URL \+|\$\{BASE_URL\}" apps/web/tests/e2e \
    --glob '!global-setup.ts' 2>/dev/null || true)
else
  # Fallback: grep (exclude global-setup.ts)
  MATCHES=$(grep -rn "http://localhost:3000\|BASE_URL +\|\${BASE_URL}" apps/web/tests/e2e 2>/dev/null \
    | grep -v "global-setup.ts" || true)
fi

if [ -n "$MATCHES" ]; then
  echo "❌ E2E specs must not use absolute URLs or BASE_URL concatenation."
  echo "   Use relative page.goto('/path') — baseURL comes from playwright.config.ts"
  echo ""
  echo "$MATCHES"
  exit 1
fi
exit 0
