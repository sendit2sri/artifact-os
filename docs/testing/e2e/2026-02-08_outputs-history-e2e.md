# Outputs History E2E Spec

## Context

E2E coverage for the Synthesis History feature: list past outputs and open any one. Uses the same worker-scoped seed fixture and stable selectors as the rest of the E2E suite.

## Problem

- Need automated coverage for History drawer and “open any output” flow.
- Must stay parallel-safe and CI-friendly.

## Solution

- **Spec:** `apps/web/tests/e2e/outputs-history.spec.ts`.
- **Flow:** Go to project (seed) → generate synthesis (helper) → close drawer → click History → assert outputs-list-drawer visible and outputs-list-empty hidden → click first outputs-list-item → assert output-drawer visible and content (assertDrawerSuccess).
- **Selectors:** `history-button`, `outputs-list-drawer`, `outputs-list-item`, `outputs-list-empty`, `output-drawer` (helpers).
- No Promise.race; uses existing helpers and expect().toPass() style.

## Files Changed

- `apps/web/tests/e2e/outputs-history.spec.ts` — new file

## How to Verify

```bash
cd apps/web
npx playwright test outputs-history.spec.ts
```

With E2E backend: `ARTIFACT_E2E_MODE=true ARTIFACT_ENABLE_TEST_SEED=true`.

## Links

- [[_index]]
- [[features/FEATURE_SYNTHESIS_HISTORY]]
- [[testing/e2e/CI_E2E_PARALLEL_FIX_FEB2026]]
