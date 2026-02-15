# E2E Seed Contract

## Summary

Defines the expected properties of seeded test data. Tests and seed endpoint must stay in sync via these constants to prevent silent drift.

## The Problem This Solves

**Before:** Tests hardcode assumptions about seed data (e.g., "search for 'research'"). If seed changes, tests break with cryptic errors like "fact-card not found" across 22 specs.

**After:** Single source of truth. Tests import constants. Seed documents contract. Preflight checks verify contract before running tests.

## Core Contract (`tests/e2e/helpers/seed-contract.ts`)

```typescript
// Search term that ALL seeded facts must contain
export const E2E_SEED_SEARCH_TERM = "research";

// Minimum counts from kitchen sink seed (facts_count >= 4)
export const E2E_SEED_MIN_FACTS = 4;
export const E2E_SEED_MIN_APPROVED = 2;
export const E2E_SEED_MIN_PINNED = 2;
export const E2E_SEED_MIN_REVIEW_QUEUE = 2;
export const E2E_SEED_MIN_WITH_EVIDENCE = 2;

// Expected workspace names
export const E2E_SEED_WORKSPACES = {
  personal: "Personal",
  team: "Team",
};
```

## Backend Seed Responsibilities

The backend seed endpoint (`apps/backend/app/api/test_helpers.py`) must:

1. **Create both Personal and Team workspaces:**
   ```python
   workspace_personal = Workspace(
       id=DEFAULT_WORKSPACE_ID,
       name="Personal",  # E2E_SEED_WORKSPACES.personal
   )
   workspace_team = Workspace(
       id=DEFAULT_WORKSPACE_ID_TEAM,
       name="Team",  # E2E_SEED_WORKSPACES.team
   )
   ```

2. **Include search term in ALL fact texts:**
   ```python
   fact_text="Climate research shows global temperatures have risen..."
   # NOT: "Global temperatures have risen..." (missing "research")
   ```

3. **Provide kitchen sink seed by default:**
   - At least 4 facts
   - At least 2 approved
   - At least 2 pinned
   - At least 2 with evidence (for evidence panel tests)
   - At least 2 needs review (for review queue tests)

4. **Include duplicates + similar facts:**
   - For dedup tests
   - For collapse-similar tests
   - For cluster-preview tests

5. **Document the contract in docstring:**
   ```python
   """
   E2E SEED CONTRACT (must match tests/e2e/helpers/seed-contract.ts):
   - ALL facts must contain "research" (E2E_SEED_SEARCH_TERM)
   - Kitchen sink provides >=4 facts, >=2 approved, >=2 pinned
   - Include duplicates + similar facts for dedup/cluster tests
   """
   ```

## Frontend Test Responsibilities

Tests should:

1. **Import constants instead of hardcoding:**
   ```typescript
   import { E2E_SEED_SEARCH_TERM } from './helpers/seed-contract';
   
   // Good:
   await page.getByTestId('facts-search-input').fill(E2E_SEED_SEARCH_TERM);
   
   // Bad:
   await page.getByTestId('facts-search-input').fill('research');
   ```

2. **Run preflight checks:**
   ```typescript
   import { preflightCheckSeedData } from './helpers/preflight';
   
   test('my test', async ({ page, seed }) => {
     await gotoProject(page, seed.project_id);
     await preflightCheckSeedData(page); // Fail fast if seed is broken
     // ... rest of test
   });
   ```

3. **Use contract-aware helpers:**
   ```typescript
   // For tests that search:
   await preflightCheckSeedData(page);
   
   // For tests that don't search (skip search check):
   await preflightCheckFactsExist(page);
   ```

## Preflight Check Benefits

**Without preflight:**
- 22 tests fail with cryptic "element not found"
- Hard to diagnose root cause
- Wasted time debugging individual test logic

**With preflight:**
- 1 test fails with clear message:
  ```
  ❌ PREFLIGHT FAILED: Search for "research" returned 0 results.
     ALL seeded facts must contain "research" for E2E tests to work.
     Fix: Update test_helpers.py seed data to include "research" in fact_text.
     See: docs/solutions/E2E_TEST_FAILURES_SEED_DATA_MISMATCH.md
  ```
- Immediate actionable fix
- Other 21 tests don't run (fast feedback)

## How to Extend the Contract

### Adding a New Required Seed Property

1. **Add constant to `seed-contract.ts`:**
   ```typescript
   export const E2E_SEED_MIN_FLAGGED = 1; // For new flagged-facts test
   ```

2. **Update backend seed:**
   ```python
   # In test_helpers.py, ensure at least 1 FLAGGED fact exists
   fact_flagged = ResearchNode(
       review_status=ReviewStatus.FLAGGED,
       ...
   )
   ```

3. **Update preflight check (optional):**
   ```typescript
   // In preflight.ts, add verification:
   const flaggedCount = await page.getByTestId('fact-card').filter({ hasText: 'Flagged' }).count();
   if (flaggedCount < E2E_SEED_MIN_FLAGGED) {
     throw new Error(`Expected >= ${E2E_SEED_MIN_FLAGGED} flagged facts, got ${flaggedCount}`);
   }
   ```

4. **Document in contract docstring** (backend seed comments).

### Changing the Search Term

If you need to change from "research" to another term:

1. **Update constant** (only one place):
   ```typescript
   export const E2E_SEED_SEARCH_TERM = "climate"; // Changed from "research"
   ```

2. **Update backend seed fact texts** to include new term.

3. **All tests automatically use new term** (no per-test changes needed).

## Quick Reference

| Aspect | Location | Purpose |
|--------|----------|---------|
| **Contract constants** | `tests/e2e/helpers/seed-contract.ts` | Single source of truth |
| **Preflight checks** | `tests/e2e/helpers/preflight.ts` | Fail fast with clear errors |
| **Backend seed** | `apps/backend/app/api/test_helpers.py` | Implements contract |
| **Example test** | `tests/e2e/view-link.spec.ts` | Uses contract + preflight |
| **Troubleshooting** | [[solutions/E2E_TEST_FAILURES_SEED_DATA_MISMATCH]] | Diagnosis + fix |

## Links

- [[solutions/E2E_TEST_FAILURES_SEED_DATA_MISMATCH]] — Root cause analysis for Feb 2026 failures
- [[testing/e2e/E2E_IDLE_CONTRACT]] — Canonical idle definition
- [[testing/e2e/TIER_0_STABILITY_PRIMITIVES]] — Core test stability primitives
