# E2E Synthesis Test Improvements

**Date:** February 7, 2026  
**Status:** ✅ **COMPLETE**

---

## Summary

Made `synthesis-flow.spec.ts` deterministic and non-flaky by:
1. Adding stable `data-testid` selectors to UI components
2. Updating tests to use stable locators
3. Adding E2E test mode for deterministic synthesis (no LLM calls)
4. Fixing test issues (recreating locators after reload, asserting hidden state)

---

## Changes Made

### 1. UI Components - Stable Selectors

| Component | Test ID | Purpose |
|-----------|---------|---------|
| OutputDrawer | `data-testid="output-drawer"` | Stable selector for drawer container |
| OutputDrawer | `role="dialog"` | ARIA compliance |
| OutputDrawer Close | `data-testid="output-drawer-close"` | Close action |
| Generate Button | `data-testid="generate-synthesis"` | Synthesis trigger |
| FactCard | `data-testid="fact-select-button"` | Already existed ✅ |

**Files:** `OutputDrawer.tsx`, `project/[id]/page.tsx`, `FactCard.tsx` (no change).

### 2. E2E Tests - Updated Locators

- **Test 1:** Use `[data-testid="generate-synthesis"]` and `[data-testid="output-drawer"]` instead of text/role.
- **Test 2:** Recreate `lastOutputBtn` locator after reload; use `output-drawer-close`; assert drawer hidden after close.
- **Test 3:** Use `generate-synthesis` and `expect(generateBtn).toBeDisabled()`.

### 3. Backend - E2E Test Mode

**`apps/backend/app/api/projects.py`**

- When `ARTIFACT_E2E_MODE=true`, return deterministic synthesis (templates by mode: paragraph/outline/brief) without calling LLM.
- Benefits: fast (2–3s), no API cost, deterministic, no flakiness from LLM.

**`.env.example`**

- Added `ARTIFACT_E2E_MODE=false` with comment.

---

## How to Run

**With E2E mode (fast, deterministic):**

```bash
# .env: ARTIFACT_E2E_MODE=true, ARTIFACT_ENABLE_TEST_SEED=true
docker-compose up
cd apps/web && PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test synthesis-flow.spec.ts
```

**With real LLM:** Set `ARTIFACT_E2E_MODE=false`; tests take ~30s.

---

## Benefits

| Before | After |
|--------|--------|
| Brittle selectors (text/role) | Stable `data-testid` selectors |
| Stale locators after reload | Locators recreated after reload |
| No assertion drawer closes | Explicit hidden-state assertion |
| Slow, flaky LLM calls (10–30s) | E2E mode: 2–3s, deterministic |
| External API failures | No external deps in test mode |

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/web/src/components/OutputDrawer.tsx` | +2 test IDs |
| `apps/web/src/app/project/[id]/page.tsx` | +1 test ID |
| `apps/web/tests/e2e/synthesis-flow.spec.ts` | Stable locators, reload fix |
| `apps/backend/app/api/projects.py` | E2E test mode |
| `.env.example` | E2E mode flag |

---

## Related

- **Parallel-safe seeding:** See [[E2E_SEED_AND_FIXTURE]] (global-setup runs once; worker-scoped `seed` fixture for per-worker project IDs).

---

✅ **Synthesis E2E tests are deterministic and non-flaky.**
