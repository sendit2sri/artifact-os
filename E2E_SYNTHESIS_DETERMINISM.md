# E2E Synthesis Determinism Fix

## Summary

This document covers the complete fix for making Playwright synthesis-flow tests deterministic and reliable without requiring real LLM calls.

## Root Causes

1. **Backend calling LLM in tests**: Without `ARTIFACT_E2E_MODE=true`, backend makes real API calls to OpenAI which may timeout or return empty
2. **Frontend Invalid URL error**: `new URL()` constructor throws when given relative path without base
3. **Unstable test selectors**: Sonner toast library doesn't forward `data-testid` to DOM elements

## Solution Overview

### Backend (apps/backend/app/api/projects.py)
✅ **Already implemented** - E2E mode returns deterministic synthesis without LLM calls.

**Key functions:**
```python
def _e2e_mode_enabled() -> bool:
    """True when ARTIFACT_E2E_MODE=true OR ARTIFACT_ENABLE_TEST_SEED=true"""
    e2e = os.environ.get("ARTIFACT_E2E_MODE", "").lower() == "true"
    seed = os.environ.get("ARTIFACT_ENABLE_TEST_SEED", "").lower() == "true"
    return e2e or seed

def _build_e2e_synthesis(payload: SynthesisRequest) -> str:
    """Deterministic synthesis text for E2E tests"""
    lines = ["E2E Synthesis", ""]
    for f in payload.facts:
        lines.append(f"- {f.text}")
    lines.append("")
    sources = len(set(f.url for f in payload.facts if f.url))
    lines.append(f"Sources: {sources} | Mode: {payload.mode}")
    return "\n".join(lines)
```

**Endpoint behavior:**
- **E2E mode + force_error=true**: Returns 502 with `{"detail": "LLM returned empty synthesis", "code": "EMPTY_SYNTHESIS"}`
- **E2E mode (normal)**: Returns deterministic synthesis and creates Output in database
- **Non-E2E mode**: Calls real LLM (OpenAI API)

### Frontend (apps/web/src/lib/api.ts)
✅ **Already implemented** - Safe URL construction without `new URL()`.

```typescript
// ✅ FIX: Don't use new URL() with relative path
const baseUrl = `${API_URL}/projects/${projectId}/synthesize`;
const url = options?.forceError ? `${baseUrl}?force_error=true` : baseUrl;

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ facts: normalized, mode }),
});
```

### Frontend UI (apps/web/src/app/project/[id]/page.tsx)
✅ **Already implemented** - Error banner with stable `data-testid`.

```tsx
{lastSynthesisError && (
  <div data-testid="synthesis-error-banner" className="fixed top-4 right-4 z-50 ...">
    <AlertTriangle className="w-5 h-5" />
    <div>
      <p className="font-medium">Synthesis Error</p>
      <p className="text-xs">{lastSynthesisError}</p>
    </div>
    <button onClick={() => setLastSynthesisError(null)}>
      <X className="w-4 h-4" />
    </button>
  </div>
)}
```

**Features:**
- Stable `data-testid="synthesis-error-banner"` for Playwright
- Displays backend error message
- Auto-dismisses after 10 seconds
- Manual dismiss with X button

### Tests (apps/web/tests/e2e/synthesis-flow.spec.ts)
✅ **Already implemented** - Uses stable error banner selector.

```typescript
test('should show error banner when synthesis fails (force_error)', async ({ page }) => {
  await page.goto(`/project/${TEST_PROJECT_ID}?playwright_force_synthesis_error=1`);
  // ... select facts and click Generate ...
  
  const errorBanner = page.getByTestId('synthesis-error-banner');
  await expect(errorBanner).toBeVisible({ timeout: 10000 });
  await expect(errorBanner).toContainText(/LLM returned empty synthesis/i);
});
```

## How to Run Tests

### Prerequisites

1. **Backend environment variables** (required!):
```bash
export ARTIFACT_E2E_MODE=true
export ARTIFACT_ENABLE_TEST_SEED=true
```

Or add to `apps/backend/.env`:
```env
ARTIFACT_E2E_MODE=true
ARTIFACT_ENABLE_TEST_SEED=true
```

2. **Database running** (Docker):
```bash
docker-compose up -d db redis
```

### Step-by-Step Execution

#### Terminal 1: Start Backend
```bash
cd /Users/sriram/Documents/Projects/artifact-os/apps/backend

# Set environment variables
export ARTIFACT_E2E_MODE=true
export ARTIFACT_ENABLE_TEST_SEED=true

# Start backend (choose one method):
python -m uvicorn app.main:app --reload
# OR if using poetry:
poetry run uvicorn app.main:app --reload
# OR if using pipenv:
pipenv run uvicorn app.main:app --reload

# Verify backend is running:
# Should see: "Application startup complete"
# Test health endpoint:
curl http://localhost:8000/health
```

#### Terminal 2: Start Frontend (Dev Mode)
```bash
cd /Users/sriram/Documents/Projects/artifact-os/apps/web

npm run dev

# Verify frontend is running:
# Should see: "Ready in XXXms"
# Open browser: http://localhost:3000
```

#### Terminal 3: Run Playwright Tests
```bash
cd /Users/sriram/Documents/Projects/artifact-os/apps/web

# Run synthesis-flow tests with 3 workers
PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test synthesis-flow.spec.ts --workers=3

# Expected output:
# ✓ should generate synthesis and open OutputDrawer
# ✓ should show Last Output button after generation
# ✓ should show error banner when synthesis fails (force_error)
# 3 passed (10-15s)
```

### Alternative: Let Playwright Start Web Server

If you don't want to manually start the web server:

```bash
cd /Users/sriram/Documents/Projects/artifact-os/apps/web

# Make sure backend is still running with E2E mode in Terminal 1
# Then run tests without PLAYWRIGHT_SKIP_WEBSERVER:
npx playwright test synthesis-flow.spec.ts --workers=3

# Playwright will start `npm run dev` automatically
# This takes longer (~30s for first run)
```

## Test Scenarios

### 1. Success: Generate Synthesis
**What it tests:** Clicking Generate opens OutputDrawer with deterministic content.

**E2E behavior:**
- Backend receives facts and mode
- Backend checks: `ARTIFACT_E2E_MODE=true` → E2E mode enabled
- Backend calls `_build_e2e_synthesis()` (no LLM)
- Returns: `{"synthesis": "E2E Synthesis\n\n- fact1\n- fact2\n\nSources: 2 | Mode: paragraph", "output_id": "uuid", "clusters": []}`
- Frontend opens OutputDrawer with content
- Test asserts: `[data-testid="output-drawer"]` is visible

### 2. Success: Last Output Persistence
**What it tests:** After generating synthesis, "Last Output" button works after page reload.

**E2E behavior:**
- First synthesis creates Output row in database
- Frontend fetches `/api/v1/projects/{id}/outputs` → returns Output list
- "Last Output" button becomes enabled
- After reload: button still enabled (persisted in DB)
- Clicking button opens drawer with same content
- Test asserts: drawer contains previous synthesis

### 3. Error: Force Error Test
**What it tests:** Error handling when synthesis fails.

**E2E behavior:**
- Frontend reads `?playwright_force_synthesis_error=1` query param
- Frontend calls `/synthesize?force_error=true`
- Backend checks: `e2e=true AND force_error=true`
- Backend returns 502 with `{"detail": "LLM returned empty synthesis", "code": "EMPTY_SYNTHESIS"}`
- Frontend throws Error with detail message
- Frontend shows error banner with message
- Test asserts: `[data-testid="synthesis-error-banner"]` is visible and contains text "LLM returned empty synthesis"

## Deterministic Synthesis Format

When `ARTIFACT_E2E_MODE=true`, synthesis looks like:

```
E2E Synthesis

- Tesla's Model 3 production increased by 40% in Q3 2024
- Battery technology improvements led to 15% range increase
- New Gigafactory in Texas reached full capacity

Sources: 2 | Mode: paragraph
```

**Structure:**
1. Title: `"E2E Synthesis"`
2. Empty line
3. Bullet list of each fact's text
4. Empty line
5. Footer: `"Sources: {count} | Mode: {mode}"`

## Error Response Contract

### Empty Synthesis (E2E force_error OR LLM returned empty)
```http
HTTP/1.1 502 Bad Gateway
X-Error-Code: EMPTY_SYNTHESIS
Content-Type: application/json

{
  "detail": "LLM returned empty synthesis",
  "code": "EMPTY_SYNTHESIS"
}
```

### Other Synthesis Errors
```http
HTTP/1.1 500 Internal Server Error
X-Error-Code: SYNTHESIS_EXCEPTION
Content-Type: application/json

{
  "detail": "Synthesis generation failed: {error_message}"
}
```

## Troubleshooting

### Tests Still Failing: "LLM returned empty synthesis"

**Diagnosis:** Backend is NOT in E2E mode (calling real LLM).

**Fix:**
```bash
# In Terminal 1 (backend):
# Stop backend (Ctrl+C)

# Verify environment variables are set:
echo $ARTIFACT_E2E_MODE  # Should output: true
echo $ARTIFACT_ENABLE_TEST_SEED  # Should output: true

# If empty, set them:
export ARTIFACT_E2E_MODE=true
export ARTIFACT_ENABLE_TEST_SEED=true

# Restart backend:
python -m uvicorn app.main:app --reload

# Verify in logs - backend should NOT make OpenAI API calls
# If you see synthesis happening instantly (~100ms), E2E mode is working
```

### "TypeError: Failed to construct 'URL': Invalid URL"

**Diagnosis:** Old version of `api.ts` still using `new URL()`.

**Fix:**
```bash
cd /Users/sriram/Documents/Projects/artifact-os/apps/web

# Verify the fix is in place:
grep -A 3 "FIX: Don't use new URL" src/lib/api.ts

# Should output:
#   // ✅ FIX: Don't use new URL() with relative path
#   const baseUrl = `${API_URL}/projects/${projectId}/synthesize`;
#   const url = options?.forceError ? `${baseUrl}?force_error=true` : baseUrl;

# If not present, pull latest changes
git pull origin main

# Restart dev server (Terminal 2):
# Ctrl+C and then: npm run dev
```

### Error Banner Not Showing in Tests

**Diagnosis:** Error banner state not being set.

**Verify:**
```typescript
// In page.tsx, catch block should have:
setLastSynthesisError(errorMsg);

// And error banner should render at top of return:
{lastSynthesisError && (
  <div data-testid="synthesis-error-banner">...</div>
)}
```

**Fix:** Pull latest `page.tsx` changes if missing.

### Backend: "No module named uvicorn"

**Diagnosis:** Python dependencies not installed or wrong Python environment.

**Fix:**
```bash
cd /Users/sriram/Documents/Projects/artifact-os/apps/backend

# Check if virtualenv exists:
ls -la | grep venv

# Option 1: Using pip
pip install -r requirements.txt

# Option 2: Using poetry
poetry install
poetry run uvicorn app.main:app --reload

# Option 3: Using pipenv
pipenv install
pipenv run uvicorn app.main:app --reload

# Option 4: Check Python version
python --version  # Should be 3.10+
python3 --version
```

### Tests Pass Individually But Fail in Parallel

**Diagnosis:** Database state interference between tests.

**Fix:**
```bash
# Run with fewer workers:
npx playwright test synthesis-flow.spec.ts --workers=1

# Or ensure test seed resets state properly:
# Check global-setup.ts calls /api/v1/test/seed before each test
```

## Summary of Changes

| File | Change | Status |
|------|--------|--------|
| `apps/backend/app/api/projects.py` | Added E2E mode helpers + deterministic synthesis | ✅ Complete |
| `apps/web/src/lib/api.ts` | Fixed URL construction (string concat instead of `new URL()`) | ✅ Complete |
| `apps/web/src/app/project/[id]/page.tsx` | Added error banner with `data-testid` | ✅ Complete |
| `apps/web/tests/e2e/synthesis-flow.spec.ts` | Updated error test to use banner selector | ✅ Complete |

**No additional code changes needed** - all fixes are already implemented!

## Verification Commands

```bash
# 1. Backend health check
curl http://localhost:8000/health
# Expected: {"status":"ok"}

# 2. Test seed endpoint (requires ARTIFACT_ENABLE_TEST_SEED=true)
curl -X POST http://localhost:8000/api/v1/test/seed
# Expected: {"workspace_id":"...", "project_id":"...", "fact_count":10}

# 3. Frontend is running
curl http://localhost:3000
# Expected: HTML content (Next.js page)

# 4. Run tests
cd apps/web
npx playwright test synthesis-flow.spec.ts --workers=3
# Expected: 3 passed
```

## Key Takeaways

1. **E2E mode MUST be enabled** via environment variables for deterministic synthesis
2. **No real LLM calls** are made when `ARTIFACT_E2E_MODE=true`
3. **Error banner** provides stable `data-testid` for Playwright (Sonner toast doesn't)
4. **force_error** query param simulates empty synthesis (502 response) for error testing
5. **All code is already in place** - issue is typically missing environment variables
