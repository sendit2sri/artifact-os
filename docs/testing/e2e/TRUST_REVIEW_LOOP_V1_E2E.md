# Trust & Review Loop v1 — E2E

## Summary

E2E coverage and implementation for the trust loop: pin facts, pin outputs, evidence UX (copy snippet, open source, capture excerpt disabled), and review bar with auto-advance.

## Context

Goal: make facts feel reviewable, system predictable, and remove confusion. Users can pin facts and outputs to “save what matters,” review evidence with copy/open/capture (coming soon), and use a compact review bar (Approve / Needs Review / Flag / Reject) with optional auto-advance to next fact.

## What changed

- **Pin Facts**: Backend `is_pinned` on Fact (migration), PATCH/batch accept `is_pinned`. Frontend FactCard pin toggle (`fact-pin-toggle`, `fact-pin-state`), “Pinned” filter tab (`facts-filter-pinned`). Pinned persists after refresh.
- **Pin Outputs**: Output already had `is_pinned`; History drawer shows pinned section (`outputs-history-pinned-section`, `outputs-history-item-pinned`). OutputDrawer pin toggle (`output-pin-toggle`).
- **Evidence UX**: Copy evidence button (`evidence-copy-snippet`) copies snippet when present else fact text; Open source button (`evidence-open-source`); Capture excerpt disabled when no snippet (`evidence-capture-excerpt-disabled`) with “Coming soon” tooltip.
- **Review flow**: Evidence panel review bar (`evidence-review-bar`) with Approve / Needs Review / Flag / Reject (`evidence-review-approve`, etc.). Auto-advance toggle (`evidence-auto-advance-toggle`), default ON; after review action, advances to next fact when enabled.

## How to run / verify

**Backend (migration):**

```bash
cd apps/backend
alembic upgrade head
```

**Backend (E2E mode):**

```bash
ARTIFACT_E2E_MODE=true ARTIFACT_ENABLE_TEST_SEED=true uvicorn app.main:app --reload
```

**E2E (new specs):**

```bash
cd apps/web
BASE_URL=http://localhost:3000 PLAYWRIGHT_SKIP_WEBSERVER=1 \
ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
npx playwright test pin-facts.spec.ts pin-outputs.spec.ts evidence-review-flow.spec.ts evidence-copy.spec.ts --workers=3
```

**Full E2E CI (includes new specs):**

```bash
npm run test:e2e:ci
```

## Files touched

- Backend: `apps/backend/app/models.py` (Fact `is_pinned`), `apps/backend/app/main.py` (UpdateFactRequest + update_fact + batch), `apps/backend/app/api/projects.py` (filter `pinned`), `apps/backend/alembic/versions/i3f0a9b1c2d_add_fact_is_pinned.py`
- Frontend: `apps/web/src/lib/api.ts` (Fact `is_pinned`, FactsFilter `pinned`), `apps/web/src/components/FactCard.tsx` (pin toggle), `apps/web/src/components/EvidencePanelSimple.tsx` (copy, open source, capture excerpt, review bar, auto-advance), `apps/web/src/app/project/[id]/page.tsx` (Pinned tab, evidence props, history pinned testid)
- E2E: `apps/web/tests/e2e/pin-facts.spec.ts`, `apps/web/tests/e2e/pin-outputs.spec.ts`, `apps/web/tests/e2e/evidence-review-flow.spec.ts`, `apps/web/tests/e2e/evidence-copy.spec.ts`
- Docs: `docs/testing/e2e/TRUST_REVIEW_LOOP_V1_E2E.md`, `docs/_index.md`

## Links

- [[testing/e2e/RUN_E2E]]
- [[testing/e2e/EVIDENCE_PANEL_E2E]]
- [[testing/e2e/CORE_LOOP_POLISH_V1_E2E]]
