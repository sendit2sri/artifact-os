# Trust Gated Synthesis v1 E2E

## Summary

E2E coverage for Trust Loop → Synthesis Loop integration: trust gate before synthesis, Generate from Approved/Pinned one-click flows, and output quality stats in OutputDrawer and History.

## Context

Synthesis generation should feel trustworthy by default. Users need visibility into which facts (approved, needs review, flagged) are used, and quick paths to generate only from approved or pinned facts.

## What changed

- **Backend:** Output model `quality_stats` (JSON: total, approved, needs_review, flagged, rejected, pinned); synthesize endpoint computes and persists; outputs list and GET output include quality_stats.
- **Frontend:** Trust Gate in SelectedFactsDrawer when selection has non-approved facts (Remove non-approved, Include anyway, Open review); Generate from Approved and Generate from Pinned buttons; OutputDrawer shows quality stats; History shows "Needs review used" badge when applicable.
- **E2E:** `trust-gate.spec.ts`, `generate-from-approved.spec.ts`, `generate-from-pinned.spec.ts`.

## How to run / verify

```bash
cd apps/backend && alembic upgrade head
cd apps/web && npm run test:e2e:ci
# Or run specific specs:
npx playwright test trust-gate.spec.ts generate-from-approved.spec.ts generate-from-pinned.spec.ts --workers=2
```

Prerequisites: `ARTIFACT_ENABLE_TEST_SEED=true`, `ARTIFACT_E2E_MODE=true`, backend and web dev servers running.

## Files touched

- `apps/backend/app/models.py` — Output.quality_stats
- `apps/backend/app/api/projects.py` — FactInput review_status/is_pinned; synthesize quality_stats; outputs list quality_stats
- `apps/backend/app/api/test_helpers.py` — fact3 APPROVED; with_pinned_facts seed option
- `apps/backend/alembic/versions/k5h2c3d4e5f_add_output_quality_stats.py` — new migration
- `apps/web/src/lib/api.ts` — Output/OutputSummary quality_stats; synthesizeFacts passes review_status/is_pinned
- `apps/web/src/components/SelectedFactsDrawer.tsx` — Trust Gate UI
- `apps/web/src/components/OutputDrawer.tsx` — quality stats display
- `apps/web/src/app/project/[id]/page.tsx` — Trust Gate handlers; Generate from Approved/Pinned; richFacts with review_status/is_pinned; History quality badge
- `apps/web/tests/e2e/trust-gate.spec.ts` — new
- `apps/web/tests/e2e/generate-from-approved.spec.ts` — new
- `apps/web/tests/e2e/generate-from-pinned.spec.ts` — new
- `apps/web/tests/e2e/helpers/trust-gate.ts` — seedWithPinnedFacts
- `apps/web/package.json` — new specs in test:e2e:ci

## Links

- [[testing/e2e/RUN_E2E]]
- [[testing/e2e/TRUST_QUALITY_V2_E2E]]
