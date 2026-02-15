# Fact Status Actions E2E

## Summary

Fact status actions (Approve / Needs Review / Flag) now show immediate UI feedback, optimistic updates with rollback on error, toast with Undo (5s), and Clear status. E2E coverage for all three actions, Clear, and persistence.

## Context

- Status changes were “silent” (no visible badge/feedback, no undo).
- Need stable selectors, optimistic updates that survive filter/sort, and metrics (Needs Review count).

## What Changed

- **FactCard:** Display status with optimistic local state; badge with `data-testid="fact-status-badge"`; Clear button `fact-clear-status` when status is set; buttons `fact-status-approve`, `fact-status-needs-review`, `fact-status-flag`; disabled while mutation in-flight; toast with “Undo” (5s); on error revert + toast.error.
- **Page:** `counts.needsReview` and KPI with `data-testid="needs-review-count"` when count > 0.
- **Backend:** PATCH `/api/v1/facts/{id}` already supports `review_status`; “clear” sends `PENDING`.
- **E2E:** `fact-status-actions.spec.ts` + `helpers/fact-status.ts`; tests: Approve + persist, Needs Review + count, Flag, Clear + persist.

## Stable Selectors

- `fact-status-badge` — wrapper when card has Approved/Needs Review/Flagged/Rejected
- `fact-clear-status` — clear button (visible when card has a status)
- `fact-status-approve` — Approve button
- `fact-status-needs-review` — Needs Review button
- `fact-status-flag` — Flag button
- `needs-review-count` — KPI area (only when count > 0)

## How to Run / Verify

```bash
cd apps/web
BASE_URL=http://localhost:3000 PLAYWRIGHT_SKIP_WEBSERVER=1 ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true npx playwright test fact-status-actions.spec.ts --workers=3
```

## Files Touched

- `apps/web/src/components/FactCard.tsx`
- `apps/web/src/app/project/[id]/page.tsx`
- `apps/web/tests/e2e/helpers/fact-status.ts` (new)
- `apps/web/tests/e2e/fact-status-actions.spec.ts` (new)
- `apps/web/tests/e2e/fact-status.spec.ts` (selector update)

## Links

- [[_index]]
- [[testing/e2e/2026-02-08_ux-panels-output-types-facts]]
