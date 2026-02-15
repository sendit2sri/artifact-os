# Facts Sort & Group E2E

## Summary

E2E coverage for **Needs review first** sort, **Group by Source**, and related specs (synthesis output modes, evidence snippet, history Back button). All tests use stable `data-testid` selectors and are parallel-safe via worker-scoped seed.

## Context

- **Sort:** Backend supports `sort=needs_review`; default sort is "Needs review first". UI: `facts-sort-trigger`, `facts-sort-option-needs_review`.
- **Group:** Client-side "Group by Source" groups facts by `source_domain`; `facts-group-trigger`, `facts-group-option-source`, `facts-group-section`, `facts-group-title`.
- **Evidence:** Panel shows `evidence_snippet` (source excerpt) with fallback "No excerpt captured yet"; selectors: `evidence-snippet`, `evidence-empty-snippet`, `evidence-source-url`.
- **History:** OutputDrawer opened from History shows "Back to History" button; `output-drawer-back-to-history` closes drawer and re-opens History.

## What changed

- New specs: `synthesis-output-modes.spec.ts`, `evidence-snippet.spec.ts`, `facts-group-sort.spec.ts`.
- Outputs-history: test for Back to History flow.
- Seed: 4 facts, 2 sources, mixed review statuses, `evidence_snippet` on some facts.
- CI: `test:e2e:ci` includes the new spec files.

## How to run / verify

```bash
cd apps/web
ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true npx playwright test synthesis-output-modes.spec.ts evidence-snippet.spec.ts facts-group-sort.spec.ts outputs-history.spec.ts --workers=3
```

Full CI suite:

```bash
npm run test:e2e:ci
```

## Files touched

- `tests/e2e/synthesis-output-modes.spec.ts` — mode-specific drawer content and footer.
- `tests/e2e/evidence-snippet.spec.ts` — evidence panel snippet vs fact text, URL.
- `tests/e2e/facts-group-sort.spec.ts` — Needs review first sort, Group by Source.
- `tests/e2e/outputs-history.spec.ts` — Back to History E2E.
- `tests/e2e/helpers/synthesis.ts` — `setSynthesisFormat` uses data-testid options.
- `package.json` — `test:e2e:ci` script updated.

## Links

- [[testing/e2e/]]
- [[testing/e2e/RUN_E2E]]
- [[testing/e2e/CI_E2E_PARALLEL_FIX_FEB2026]]
