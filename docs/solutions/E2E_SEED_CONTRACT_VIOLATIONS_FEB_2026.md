# E2E Seed Contract Violations Summary (Feb 2026)

## Overview

22 E2E tests failed due to **TWO** independent seed contract violations discovered sequentially:

1. **Search term mismatch** → 0 fact cards rendered (facts filtered out)
2. **Workspace name mismatch** → workspace-switch test couldn't find "Personal"/"Team"

Both issues had the same root cause: **tests assumed seed properties that didn't exist**.

## Violation #1: Missing Search Term in Facts

### Symptom
```
Error: locator.toBeVisible() failed
Locator: getByTestId('fact-card').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found
```

Affected: 22 tests (view-link, capture-excerpt, facts-dedup, etc.)

### Root Cause
- Tests searched for `q=research`
- Seeded facts contained "Global temperatures...", "Arctic sea ice..." (NO "research")
- All 9 facts filtered out → empty UI → cascading failures

### Fix
Added "research" to all fact texts:
```python
# Before:
fact_text="Global temperatures have risen by approximately 1.1°C..."

# After:
fact_text="Climate research shows global temperatures have risen by approximately 1.1°C..."
```

**Files:** 7 fact definitions in `test_helpers.py` (lines 178, 203, 229, 246, 259-260, 275-276, 299)

## Violation #2: Wrong Workspace Names

### Symptom
```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByTestId('workspace-item').filter({ hasText: 'Personal' })
```

Affected: `workspace-switch.spec.ts`

### Root Cause
- Test expects workspaces named "Personal" and "Team"
- Seed created single workspace named "Test Workspace"
- Test times out waiting for "Personal" workspace menu item

### Fix
Create both workspaces with correct names:
```python
# Before:
workspace = Workspace(name="Test Workspace")

# After:
workspace_personal = Workspace(name="Personal")  # DEFAULT_WORKSPACE_ID
workspace_team = Workspace(name="Team")          # DEFAULT_WORKSPACE_ID_TEAM
```

**Files:** `test_helpers.py` lines 17-20, 98-118

## Prevention Measures Implemented

### 1. Seed Contract Constants
`tests/e2e/helpers/seed-contract.ts`:
```typescript
export const E2E_SEED_SEARCH_TERM = "research";
export const E2E_SEED_WORKSPACES = {
  personal: "Personal",
  team: "Team",
};
```

### 2. Preflight Checks
`tests/e2e/helpers/preflight.ts`:
- Verifies facts exist before test logic runs
- Verifies search term returns results
- Fails fast with actionable error instead of 22 cryptic failures

### 3. Documentation
- `docs/testing/e2e/E2E_SEED_CONTRACT.md` - Complete contract reference
- `docs/solutions/E2E_TEST_FAILURES_SEED_DATA_MISMATCH.md` - Root cause analysis

## Verification Steps

### After Backend Restart
```bash
docker-compose restart backend

cd apps/web
ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
NEXT_PUBLIC_E2E_MODE=true PLAYWRIGHT_SKIP_WEBSERVER=1 \
BASE_URL=http://localhost:3000 \
npx playwright test tests/e2e/view-link.spec.ts tests/e2e/workspace-switch.spec.ts --project=chromium
```

### Expected Results
- ✅ view-link passes (facts contain "research", search returns results)
- ✅ workspace-switch passes (both Personal and Team workspaces exist)
- ✅ All 22 original failures collapse

## Key Lesson

**Implicit assumptions are fragile.** Tests assumed:
1. Facts would contain searchable text
2. Specific workspace names would exist

When these assumptions broke, we got 22+ confusing failures. The fix:
- **Explicit contract** (constants + docs)
- **Fail-fast validation** (preflight checks)
- **Single source of truth** (tests import constants, seed documents contract)

## Files Modified

### Backend
- `apps/backend/app/api/test_helpers.py`
  - Lines 17-20: Add Team workspace ID
  - Lines 98-118: Create Personal + Team workspaces
  - Lines 178, 203, 229, 246, 259-260, 275-276, 299: Add "research" to facts

### Frontend
- `apps/web/tests/e2e/helpers/seed-contract.ts` - NEW: Contract constants
- `apps/web/tests/e2e/helpers/preflight.ts` - NEW: Preflight checks
- `apps/web/tests/e2e/view-link.spec.ts` - Use contract + preflight

### Documentation
- `docs/testing/e2e/E2E_SEED_CONTRACT.md` - NEW: Contract guide
- `docs/solutions/E2E_TEST_FAILURES_SEED_DATA_MISMATCH.md` - Root cause doc
- `docs/_index.md` - Add links

## Status
✅ **RESOLVED** - Both violations fixed. Backend restarted. Tests ready to run once Playwright browsers installed.
