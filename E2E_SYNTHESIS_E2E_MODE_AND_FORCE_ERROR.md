# E2E Synthesis: E2E Mode & Force Error Fix

## Problem: Invalid URL Error

### Root Cause
The frontend synthesis API call was failing with:
```
TypeError: Failed to construct 'URL': Invalid URL
```

**Why?**  
In `apps/web/src/lib/api.ts`, the `synthesizeFacts()` function attempted to construct a URL object from a relative path:
```typescript
const url = new URL(`${API_URL}/projects/${projectId}/synthesize`);
```

When `API_URL = "/api/v1"` (relative path), the browser's `URL()` constructor requires a base URL. Without it, the call throws `Invalid URL`.

### Impact
- Synthesis tests failed immediately when clicking "Generate"
- No OutputDrawer opened
- Error banner tests couldn't run

---

## Solution: String Concatenation for Relative Paths

### Fix in `apps/web/src/lib/api.ts`
Replaced `new URL()` constructor with direct string concatenation:

```typescript
// ✅ FIX: Don't use new URL() with relative path (throws Invalid URL in browser)
const baseUrl = `${API_URL}/projects/${projectId}/synthesize`;
const url = options?.forceError ? `${baseUrl}?force_error=true` : baseUrl;

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ facts: normalized, mode }),
});
```

**Why this works:**
- `fetch()` accepts relative URLs directly in the browser
- No `URL()` constructor needed for simple query params
- Works in both browser and Playwright test environments

---

## Stable Error Selector for Tests

### Problem with Sonner Toasts
Sonner toast library does **not** forward `data-testid` to the DOM. Tests using `getByTestId('synthesis-error-toast')` would fail even when the toast appeared.

### Solution: Error Banner Component
Added a **fixed-position error banner** in `apps/web/src/app/project/[id]/page.tsx`:

```tsx
{lastSynthesisError && (
  <div
    data-testid="synthesis-error-banner"
    className="fixed top-4 right-4 z-50 max-w-md bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 animate-in slide-in-from-right-5"
  >
    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
    <div className="flex-1 text-sm">
      <p className="font-medium">Synthesis Error</p>
      <p className="text-xs mt-1 opacity-90">{lastSynthesisError}</p>
    </div>
    <button
      onClick={() => setLastSynthesisError(null)}
      className="shrink-0 text-destructive/70 hover:text-destructive transition-colors"
      aria-label="Dismiss error"
    >
      <X className="w-4 h-4" />
    </button>
  </div>
)}
```

**Features:**
- ✅ `data-testid="synthesis-error-banner"` for stable Playwright targeting
- ✅ Displays backend error message (e.g., "LLM returned empty synthesis")
- ✅ Dismissible with X button
- ✅ Auto-clears after 10 seconds (non-blocking UX)

**State management:**
```typescript
const [lastSynthesisError, setLastSynthesisError] = useState<string | null>(null);

// In executeSynthesis catch block:
setLastSynthesisError(errorMsg);

// Auto-clear effect:
useEffect(() => {
  if (lastSynthesisError) {
    const timer = setTimeout(() => setLastSynthesisError(null), 10000);
    return () => clearTimeout(timer);
  }
}, [lastSynthesisError]);
```

---

## Backend: E2E Mode & Force Error

### E2E Mode (Deterministic Synthesis)
When `ARTIFACT_E2E_MODE=true` or `ARTIFACT_ENABLE_TEST_SEED=true`, the backend returns **deterministic synthesis** without calling external LLM:

**Format:**
```
E2E Synthesis

- [fact 1 text]
- [fact 2 text]
- ...

Sources: 3 | Mode: paragraph
```

**Implementation** (`apps/backend/app/api/projects.py`):
```python
def _e2e_mode_enabled() -> bool:
    e2e = os.environ.get("ARTIFACT_E2E_MODE", "").lower() == "true"
    seed = os.environ.get("ARTIFACT_ENABLE_TEST_SEED", "").lower() == "true"
    return e2e or seed

def _build_e2e_synthesis(payload: SynthesisRequest) -> str:
    lines = ["E2E Synthesis"]
    lines.append("")
    for f in payload.facts:
        lines.append(f"- {f.text}")
    lines.append("")
    sources = len(set(f.url for f in payload.facts if f.url))
    lines.append(f"Sources: {sources} | Mode: {payload.mode}")
    return "\n".join(lines)
```

### Force Error Query Param
For error-handling tests, the endpoint accepts `?force_error=true`:

**Behavior:**
- When **E2E mode is ON** and `force_error=true`, backend returns:
  - **Status:** `502 Bad Gateway`
  - **Body:** `{"detail": "LLM returned empty synthesis", "code": "EMPTY_SYNTHESIS"}`
  - **Header:** `X-Error-Code: EMPTY_SYNTHESIS`
- Does **NOT** call LLM or create Output row (no 500 error)

**Usage:**
```typescript
// Frontend passes forceError from query param:
const forceError = searchParams.get("playwright_force_synthesis_error") === "1";
const result = await synthesizeFacts(projectId, facts, mode, { forceError });
```

---

## Running Synthesis E2E Tests

### Prerequisites
1. **Backend with E2E mode:**
   ```bash
   ARTIFACT_E2E_MODE=true
   ARTIFACT_ENABLE_TEST_SEED=true
   ```
   Set these in `apps/backend/.env` or export them before starting the backend.

2. **Test seed data:**
   Ensure backend `/api/v1/test/seed` endpoint is available (enabled by `ARTIFACT_ENABLE_TEST_SEED=true`).

### Run Tests
```bash
cd apps/web

# Option 1: Let Playwright start the webserver (dev mode)
npx playwright test synthesis-flow.spec.ts --workers=3

# Option 2: Skip webserver if already running
PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test synthesis-flow.spec.ts --workers=3
```

### Expected Output
```
Running 3 tests using 3 workers

✓ [chromium] › synthesis-flow.spec.ts:24:3 › should generate synthesis and open OutputDrawer
✓ [chromium] › synthesis-flow.spec.ts:119:3 › should show Last Output button after generation
✓ [chromium] › synthesis-flow.spec.ts:235:3 › should show error banner when synthesis fails (force_error)

3 passed (15s)
```

---

## Test Scenarios

### 1. Success: Generate Synthesis
- **Test:** `should generate synthesis and open OutputDrawer`
- **Flow:**
  1. Select 2+ facts
  2. Click "Generate" button
  3. Wait for `[data-testid="output-drawer"]` to appear
  4. Assert drawer contains non-empty content
- **Backend:** Returns deterministic E2E synthesis (no LLM call)

### 2. Success: Last Output Persistence
- **Test:** `should show Last Output button after generation`
- **Flow:**
  1. Generate synthesis (creates Output row)
  2. Close drawer
  3. Reload page
  4. Click "Last Output" button (should be enabled)
  5. Verify drawer opens with previous content
- **Backend:** Fetches Output from database

### 3. Error: Force Error Test
- **Test:** `should show error banner when synthesis fails (force_error)`
- **Flow:**
  1. Open page with `?playwright_force_synthesis_error=1`
  2. Select 2+ facts
  3. Click "Generate"
  4. Assert `[data-testid="synthesis-error-banner"]` is visible
  5. Assert banner contains text "LLM returned empty synthesis"
- **Backend:** Returns 502 with `EMPTY_SYNTHESIS` code (no Output created)

---

## Files Changed

### Backend
- **`apps/backend/app/api/projects.py`**
  - Added `_e2e_mode_enabled()` helper
  - Added `_build_e2e_synthesis()` for deterministic synthesis
  - Added `force_error` query param to `/projects/{id}/synthesize`
  - Changed empty synthesis response: 502 with `{"detail": "...", "code": "EMPTY_SYNTHESIS"}`

### Frontend
- **`apps/web/src/lib/api.ts`**
  - Fixed `synthesizeFacts()` URL construction (string concat instead of `new URL()`)
  - Added `SynthesizeOptions` interface with `forceError?: boolean`
  - Updated 502 error handling to use backend `detail` field

- **`apps/web/src/app/project/[id]/page.tsx`**
  - Added `lastSynthesisError` state
  - Added error banner component with `data-testid="synthesis-error-banner"`
  - Added auto-clear effect (10s timeout)
  - Set `lastSynthesisError` in `executeSynthesis` catch block
  - Pass `forceError` from `?playwright_force_synthesis_error=1` query param

### Tests
- **`apps/web/tests/e2e/synthesis-flow.spec.ts`**
  - Updated header comment with E2E mode instructions
  - Renamed error test: `should show error banner when synthesis fails (force_error)`
  - Changed error assertion: use `[data-testid="synthesis-error-banner"]` instead of Sonner toast

- **`apps/web/tests/e2e/global-setup.ts`**
  - Added console hint about `ARTIFACT_E2E_MODE=true` for synthesis tests

---

## Notes on Sonner Toast Reliability

### Why We Don't Use Sonner for Test Assertions

**Problem:**
- Sonner toast library **does not forward** custom props like `data-testid` to the DOM
- Toast elements use dynamic roles (`role="status"`) and text content
- Text-based selectors are fragile (dependent on exact error message formatting)

**Previous Approach (unreliable):**
```typescript
// ❌ Unreliable: Sonner doesn't render data-testid
const errorToast = page.getByTestId('synthesis-error-toast');

// ❌ Fragile: Depends on exact text and role
const errorToast = page.getByRole('status', { name: /LLM returned empty synthesis/i });
```

**Current Approach (stable):**
```typescript
// ✅ Stable: Custom error banner with guaranteed data-testid
const errorBanner = page.getByTestId('synthesis-error-banner');
await expect(errorBanner).toBeVisible();
await expect(errorBanner).toContainText(/LLM returned empty synthesis/i);
```

### Toast Still Shown to Users
- The toast is **still displayed** in production for UX (brief notification)
- The **error banner** is the stable, testable UI element
- Banner auto-dismisses after 10s (doesn't block UI)

---

## Troubleshooting

### "Invalid URL" still appears
- **Check:** Ensure `apps/web/src/lib/api.ts` uses string concatenation (not `new URL()`)
- **Fix:** Pull latest changes and rebuild: `cd apps/web && npm run dev`

### Test fails: "Drawer never opened"
- **Check:** Backend has `ARTIFACT_E2E_MODE=true`
- **Verify:** `curl http://localhost:8000/health` returns 200
- **Check:** Backend logs show "E2E Synthesis" output (not calling LLM)

### Test fails: "Error banner not visible"
- **Check:** `?playwright_force_synthesis_error=1` is in the URL
- **Verify:** Backend returns 502 (not 200) for the synthesis request
- **Debug:** Check Playwright trace: `npx playwright show-trace test-results/.../trace.zip`

### Backend returns 500 instead of 502
- **Check:** `force_error=true` query param is being sent to backend
- **Verify:** Frontend `forceError` is `true` when query param is set
- **Fix:** Clear browser cache and restart dev server

---

## Summary

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Invalid URL error | `new URL()` with relative path | String concatenation for URL building |
| Toast not testable | Sonner doesn't forward `data-testid` | Custom error banner with stable selector |
| Tests depend on real LLM | No E2E mode in backend | `ARTIFACT_E2E_MODE=true` for deterministic synthesis |
| Error tests can't trigger failure | No force_error mechanism | `?force_error=true` query param + frontend support |

**Result:** All synthesis tests pass reliably with `--workers=3` when backend has E2E mode enabled.
