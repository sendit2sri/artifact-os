# Running E2E Tests

## Summary

Playwright E2E tests for synthesis flow and outputs history. Requires backend (with E2E mode + test seed) and optionally frontend (when using `PLAYWRIGHT_SKIP_WEBSERVER=1`).

## Env Vars (Single Source of Truth)

| Var | Purpose | Default |
|-----|---------|---------|
| `BASE_URL` | Frontend URL for tests | `http://localhost:3000` |
| `BACKEND_URL` | Backend API URL | `http://localhost:8000` |
| `PLAYWRIGHT_SKIP_WEBSERVER` | Skip starting dev server (use existing) | unset |
| `ARTIFACT_ENABLE_TEST_SEED` | Enable seed endpoint (backend) | - |
| `ARTIFACT_E2E_MODE` | Deterministic synthesis (backend) | - |

## Local: One Command

**Prerequisites:** Backend and frontend already running with correct env.

```bash
cd apps/web

BASE_URL=http://localhost:3001 \
  PLAYWRIGHT_SKIP_WEBSERVER=1 \
  ARTIFACT_ENABLE_TEST_SEED=true \
  ARTIFACT_E2E_MODE=true \
  npm run test:e2e:ci
```

If frontend is on 3000:
```bash
BASE_URL=http://localhost:3000 PLAYWRIGHT_SKIP_WEBSERVER=1 \
  ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
  npm run test:e2e:ci
```

## Local: Start Services First

**Terminal 1 – Backend (Docker):**
```bash
ARTIFACT_E2E_MODE=true ARTIFACT_ENABLE_TEST_SEED=true docker-compose up -d backend worker db redis
```

**Terminal 2 – Frontend:**
```bash
cd apps/web
npm run dev
# Note: may use 3000 or 3001 if 3000 is busy
```

**Terminal 3 – Run tests:**
```bash
cd apps/web
# Use the port shown by npm run dev (e.g. 3001)
BASE_URL=http://localhost:3000 PLAYWRIGHT_SKIP_WEBSERVER=1 \
  ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
  npm run test:e2e:ci
```

## CI

Run from `apps/web` with env set by the workflow:

```bash
cd apps/web
BACKEND_URL=http://localhost:8000 \
  ARTIFACT_ENABLE_TEST_SEED=true \
  ARTIFACT_E2E_MODE=true \
  npm run test:e2e:ci
```

CI typically does not use `PLAYWRIGHT_SKIP_WEBSERVER`; Playwright starts the frontend via `webServer` in `playwright.config.ts`.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Frontend is not reachable at http://localhost:3000` | Wrong port or not running | Start `npm run dev`, check which port it uses, set `BASE_URL=http://localhost:3001` (or 3000) |
| `Backend is not reachable` | Backend not running or wrong URL | Start backend; set `BACKEND_URL` if not on 8000 |
| `Test seed endpoint disabled (403)` | Seed disabled | Set `ARTIFACT_ENABLE_TEST_SEED=true` on backend |
| `E2E mode not enabled` | Deterministic synthesis off | Set `ARTIFACT_E2E_MODE=true` on backend |
| `cd: no such directory: apps/web` | Wrong cwd | Always run from repo root or `apps/web` |
| `test.describe() not expected` | Running from wrong dir | Run from `apps/web` where `playwright.config.ts` lives |

## Files Touched

- `apps/web/playwright.config.ts` – baseURL, webServer, timeouts
- `apps/web/package.json` – `test:e2e:ci` script
- `apps/web/tests/e2e/global-setup.ts` – env resolution, fail-fast checks

---
**Tags:** #docs #e2e #testing
**Related:** [[docs/_index]] [[testing/e2e/OUTPUTS_SEED_MULTI_OUTPUT_FEB2026]]
