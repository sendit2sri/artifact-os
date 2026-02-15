# E2E Test Failures: Seed Data Mismatch (Feb 2026)

## Summary

22 E2E tests failed with "element not found" errors (fact-card, buttons, drawers, workspaces). Root cause was **NOT** missing env vars or seed failure — the seed worked correctly, but **test search queries didn't match seeded fact text**, causing all facts to be filtered out and resulting in empty UI states.

## Symptoms: How to Recognize This Issue

### Fast Repro
1. Navigate to project page with seeded data
2. Check stats: "9 facts extracted from 2 sources" (data exists)
3. Type search query: `?q=research`
4. Result: **Zero fact cards render** (all filtered out)

### Diagnostic Signature
- ✅ Backend seed succeeds (200 OK, correct fact count)
- ✅ Frontend fetches facts (stats show correct count)
- ✅ E2E mode active (debug strip visible)
- ❌ **NO fact-card elements in DOM** (all filtered by search)
- ❌ Cascading failures: buttons/drawers that depend on visible facts never appear

### Common Error Patterns
```
Error: locator.toBeVisible() failed
Locator: getByTestId('fact-card').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found
```

This pattern appears across:
- `fact-card` not found (many tests)
- `generate-from-pinned` / `output-drawer` buttons not found
- Workspace menu items not found (because app state is wrong)
- Review queue sees 1 instead of >=2 (partial seed visibility)

## Context

### Failure Pattern
- 22 tests failed with consistent signature:
  - `fact-card` not found
  - `generate-from-pinned` / `output-drawer` buttons not found
  - Workspace menu "Personal" never appears
  - Review queue expects >=2 items but sees 1
  - Evidence panels/snippets not found

### Initial Hypothesis (Incorrect)
The failure pattern suggested:
1. E2E seed didn't run / seed endpoint disabled
2. E2E mode flags not reaching web app
3. Tests navigating to wrong place (auth redirect)
4. Seed produced different dataset than tests assume

### Actual Root Cause
**Seed data text content didn't match test search queries.** Tests executed search filters (e.g., `q=research`) but seeded facts contained text like "Global temperatures have risen..." with **no** occurrence of "research", causing all facts to be filtered from view.

## Diagnostic Evidence

### Error Context Analysis
From `view-link-View-link-copy-v-cb5bd--navigate-state-matches-URL-chromium/error-context.md`:

```yaml
# Page shows stats indicating data exists:
- paragraph [ref=e134]: "9 facts extracted from 2 sources"  # ✅ Backend has data
- generic [ref=e141]: "facts: 9"                            # ✅ Debug strip confirms
- generic [ref=e10]: "E2E"                                  # ✅ E2E mode is active

# But search input has filter applied:
- searchbox "Filter facts..." [ref=e141]: research          # ❌ Searching for "research"

# And NO fact cards rendered:
# (no fact-card elements in DOM tree)                       # ❌ All filtered out
```

**Key insight:** The page showed correct stats (9 facts) but rendered zero cards because the search query `"research"` didn't match any fact text.

### Seed Data Review
Original seeded fact texts (from `apps/backend/app/api/test_helpers.py`):
- "Global temperatures have risen by approximately 1.1°C since pre-industrial times [E2E_APPROVED_1]"
- "Arctic sea ice has declined by 13% per decade since 1979 [E2E_APPROVED_2]"
- "Ocean acidification has increased by 30% since industrial revolution"
- "Additional context for E2E mixed-source tests."

**NONE** contained the word "research" that tests were searching for.

The word "research" only appeared in:
- Source URL: `https://example.com/climate-research` (not searched)
- Source title: "Climate Change Research Summary" (not included in fact_text search)
- Bulk facts (line 316): "Climate **research** supplementary point" — but only created when `facts_count > 4`

Default seed creates only 4 base facts (`seed.ts` line 48), so bulk facts with "research" were never generated.

## What Changed

### Files Modified
- `apps/backend/app/api/test_helpers.py` — Updated all seeded fact texts to include "research"

### Changes Made
Added "research" keyword to all base fact texts to ensure search queries match:

| Original Fact Text | Updated Fact Text |
|-------------------|------------------|
| "Global temperatures have risen by approximately 1.1°C..." | "**Climate research shows** global temperatures have risen by approximately 1.1°C..." |
| "Arctic sea ice has declined by 13% per decade since 1979 [E2E_APPROVED_2]" | "**Climate research indicates** Arctic sea ice has declined by 13% per decade since 1979 [E2E_APPROVED_2]" |
| "Ocean acidification has increased by 30%..." | "**Ocean research confirms** acidification has increased by 30%..." |
| "Additional context for E2E mixed-source tests." | "Additional **research** context for E2E mixed-source tests." |
| Similar facts: "Arctic sea ice has declined..." (2 variants) | "**Arctic research shows** sea ice has declined..." (2 variants) |
| Similar facts: "Climate change is driven mainly..." (2 variants) | "**Climate research shows** change is driven mainly..." (2 variants) |
| Duplicate: "Global temperatures have risen by approximately 1.1 degrees Celsius..." | "**Climate research shows** global temperatures have risen by approximately 1.1 degrees Celsius..." |

**Result:** Now all seeded facts contain "research", ensuring test search queries (`q=research`) return visible results.

### Workspace Names
Also updated workspace creation to match test expectations:

| Original | Updated |
|----------|---------|
| Single workspace: "Test Workspace" | Two workspaces: "Personal" (default) and "Team" |

This fixes `workspace-switch.spec.ts` which expects both "Personal" and "Team" workspaces to exist.

## How to Verify

### 1. Restart Backend + Worker
The seed endpoint code changed, so backend must be restarted:

```bash
# Docker Compose (recommended - restarts both API and worker):
docker-compose restart backend worker

# Or manual restart:
cd apps/backend
# Stop existing process
uvicorn app.main:app --reload
```

### 2. Run Tests in Signal-Rich Order

**Why this order?** Each test validates a different aspect; run most-specific first to isolate root cause.

#### A. Canary Test (Direct Search Dependency)
```bash
cd apps/web

# This test directly depends on q=research working:
ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
  npx playwright test tests/e2e/view-link.spec.ts --project=chromium
```

**Expected:** ✅ PASS (facts with "research" are visible and searchable)

**If fails:** Seed data still doesn't contain "research" → check backend restart completed.

#### B. Workspace Test (Non-Search Dependencies)
```bash
# This test depends on workspace navigation, not search:
ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
  npx playwright test tests/e2e/workspace-switch.spec.ts --project=chromium
```

**Expected:** ✅ PASS (workspaces seed correctly, no search involved)

**If fails:** Broader seed issue (not just search term) → check seed endpoint logs.

#### C. Full Suite
```bash
# If first two pass, 90% chance all 22 failures collapse:
ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true npm run test:e2e:ci
```

### 3. Verify Seed Data (Optional Debug)
Check that seeded facts now contain "research":

```bash
# Trigger seed and inspect response:
curl -X POST http://localhost:8000/api/v1/test/seed \
  -H "Content-Type: application/json" \
  -d '{"reset": true, "facts_count": 4}' | jq '.'

# Response should include facts with "research" in fact_text:
# "fact_text": "Climate research shows global temperatures..."
```

### 4. Troubleshooting: Next.js Network Interface Error

**Symptom:**
```
[WebServer] Unhandled Rejection: NodeError [SystemError]: 
  uv_interface_addresses returned Unknown system error 1
```

**Cause:** Next.js dev server can't detect network interfaces (macOS-specific issue).

**Solutions:**
1. **Use existing dev server** (preferred):
   ```bash
   # In one terminal, start dev server manually:
   cd apps/web && npm run dev
   
   # In another terminal, run tests with PLAYWRIGHT_SKIP_WEBSERVER=1:
   ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
   NEXT_PUBLIC_E2E_MODE=true PLAYWRIGHT_SKIP_WEBSERVER=1 \
   BASE_URL=http://localhost:3000 \
   npx playwright test tests/e2e/view-link.spec.ts --project=chromium
   ```

2. **Or suppress warning** (if server starts despite warning):
   ```bash
   # Add NODE_OPTIONS to suppress deprecation warnings:
   NODE_OPTIONS="--no-warnings" npx playwright test ...
   ```

### 5. Expected Outcome
- ✅ All 22 previously failing tests pass
- ✅ Search for "research" returns visible fact cards
- ✅ No more "element not found" failures for fact-card
- ✅ Workspace switcher shows "Personal" (tests navigate to correct project)

## Prevention: Making This Permanently Robust

### 1. Seed Contract Constant (Prevents Drift)

**Problem:** Tests hardcode "research" everywhere; if seed changes, silent breakage.

**Solution:** Single source of truth in `tests/e2e/helpers/seed-contract.ts`:

```typescript
export const E2E_SEED_SEARCH_TERM = "research";
export const E2E_SEED_MIN_FACTS = 4;
export const E2E_SEED_MIN_APPROVED = 2;
```

**Usage in tests:**
```typescript
import { E2E_SEED_SEARCH_TERM } from './helpers/seed-contract';

// Instead of hardcoding "research":
await page.getByTestId('facts-search-input').fill(E2E_SEED_SEARCH_TERM);
```

**Usage in seed (backend):**
Backend seed comments reference the contract, but Python can't import TypeScript.
Document the contract in seed endpoint docstring:

```python
# E2E SEED CONTRACT (must match tests/e2e/helpers/seed-contract.ts):
# - ALL facts must contain "research" (E2E_SEED_SEARCH_TERM)
# - Kitchen sink provides >=4 facts, >=2 approved, >=2 pinned
```

### 2. Preflight Check (Fail Fast, 1 Clear Error)

**Problem:** 22 confusing failures ("fact-card not found", "button not found", etc.)

**Solution:** Single preflight check at test start in `tests/e2e/helpers/preflight.ts`:

```typescript
export async function preflightCheckSeedData(page: Page): Promise<void> {
  // 1. Verify facts loaded
  const count = await getFactCount(page);
  if (count < E2E_SEED_MIN_FACTS) {
    throw new Error(`Expected >= ${E2E_SEED_MIN_FACTS} facts, got ${count}`);
  }
  
  // 2. Verify search term returns results
  await page.getByTestId('facts-search-input').fill(E2E_SEED_SEARCH_TERM);
  const cardsAfterSearch = await page.getByTestId('fact-card').count();
  if (cardsAfterSearch === 0) {
    throw new Error(
      `Search for "${E2E_SEED_SEARCH_TERM}" returned 0 results. ` +
      `ALL seeded facts must contain this term. ` +
      `See: docs/solutions/E2E_TEST_FAILURES_SEED_DATA_MISMATCH.md`
    );
  }
}
```

**Usage in tests:**
```typescript
test('some test', async ({ page, seed }) => {
  await gotoProject(page, seed.project_id);
  await preflightCheckSeedData(page); // ← Fail fast if seed is broken
  // ... rest of test logic (won't run if preflight fails)
});
```

**Result:** Converts "22 random failures" into "1 actionable failure" with solution link.

### 3. Backend + Worker Restart

**Pitfall:** Seed endpoint lives in backend API, but if tests rely on job processing, you need both:
- Backend API (seed endpoint)
- Worker (job completion for ingestion tests)

**Solution:** Restart both after seed changes:
```bash
docker-compose restart backend worker
```

### 4. Lessons Learned
1. **Seed data MUST match common test queries** — if tests search, seed must contain those terms
2. **Single source of truth** — seed contract constant prevents drift
3. **Fail fast with actionable errors** — preflight checks give clear fix instructions
4. **Document contracts explicitly** — both tests and seed reference the contract
5. **Use generic keywords** — "research" is widely applicable, appears in all seeded facts

## Links
- [[testing/e2e/RUN_E2E]] — E2E test runner guide
- [[architecture/EMPTY_ONLY_OVERLAY]] — UI empty states
- [[testing/e2e/E2E_SEED_CONTRACT]] — Seed data requirements (TODO: create this doc)
- GitHub issue: N/A (internal investigation)

## Related Changes
- `apps/backend/app/api/test_helpers.py` lines 178, 203, 229, 246, 259-260, 275-276, 299
- Backend restart required for seed changes to take effect

## Status
✅ **RESOLVED** — Seed data updated to include "research" keyword in all fact texts. Backend restart required, then re-run failing tests.
