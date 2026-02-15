# Productivity & Recovery v1 E2E

## Summary
E2E coverage for Undo, Review Queue, and Autosave Selection features that improve speed and safety across the core loop.

## Context
- **Undo**: Local optimistic + server-confirmed rollback for fact actions (review_status, pin, key_claim).
- **Review Queue**: Fast step-through of NEEDS_REVIEW/FLAGGED facts with keyboard shortcuts.
- **Autosave Selection**: Persist selected fact IDs per project, restore after refresh.

## What changed
- `undo-action.spec.ts` — Pin/approve → toast Undo → state restored
- `review-queue.spec.ts` — Open queue, press A, remaining count decreases
- `selection-autosave.spec.ts` — Select facts, reload, restored banner and count persists
- Seed: `with_review_queue: true` for 2 NEEDS_REVIEW + 1 FLAGGED facts

## How to run / verify

```bash
cd apps/web && npx playwright test undo-action.spec.ts review-queue.spec.ts selection-autosave.spec.ts --workers=3
```

Prerequisites: `ARTIFACT_ENABLE_TEST_SEED=true`, `ARTIFACT_E2E_MODE=true`.

## Files touched
- `apps/web/tests/e2e/undo-action.spec.ts`
- `apps/web/tests/e2e/review-queue.spec.ts`
- `apps/web/tests/e2e/selection-autosave.spec.ts`
- `apps/backend/app/api/test_helpers.py` — `with_review_queue` seed option
- `apps/web/package.json` — test:e2e:ci

## Links
- [[testing/e2e/RUN_E2E]]
- [[_index]]
