# Core Loop Polish V1 — E2E

## Summary

E2E coverage and implementation for the primary loop polish: Processing Timeline, Selected Facts drawer, Output drawer meta, Export quick actions, and History back button.

## Context

Goal: make the loop URL → facts → selection → synth → export feel reliable and clear. Changes include inline job progress (Processing Timeline), selection review (Selected Facts drawer), output meta and “View selected facts”, export quick actions (last output MD, facts CSV), and History back navigation.

## What changed

- **Processing Timeline**: Inline timeline when any job is PENDING/RUNNING/FAILED; stages (Queued → Fetching → Extracting → Facting → Done); failed job shows error + Retry (re-runs ingest for that URL).
- **Selected Facts Drawer**: Non-modal right sheet; list selected facts, remove one, “X facts • Y sources”, Cross-source badge, Generate CTA; open via `selected-facts-open` in action bar when selection size > 0.
- **Output Drawer**: Meta row “X facts • Y sources”, “View selected facts” link opening SelectedFactsDrawer (read-only).
- **Export Panel**: Quick actions “Last output (Markdown)” and “Facts CSV”; filename preview; `export-disabled-reason` when no last output.
- **History**: Back to History button in OutputDrawer when opened from History; E2E for back → history list visible.

## How to run / verify

**Backend (E2E mode):**

```bash
cd apps/backend
ARTIFACT_E2E_MODE=true ARTIFACT_ENABLE_TEST_SEED=true uvicorn app.main:app --reload
```

**E2E (new specs):**

```bash
cd apps/web
BASE_URL=http://localhost:3000 PLAYWRIGHT_SKIP_WEBSERVER=1 \
ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
npx playwright test processing-timeline.spec.ts selected-facts-drawer.spec.ts output-drawer-meta.spec.ts export-quick-actions.spec.ts history-back-button.spec.ts --workers=3
```

**Full E2E CI list (includes new specs):**

```bash
npm run test:e2e:ci
```

## Files touched

- `apps/web/src/components/ProcessingTimeline.tsx` (new)
- `apps/web/src/components/SelectedFactsDrawer.tsx` (new)
- `apps/web/src/components/OutputDrawer.tsx` (meta + onViewSelectedFacts)
- `apps/web/src/components/ExportPanel.tsx` (quick actions + testids)
- `apps/web/src/app/project/[id]/page.tsx` (timeline, drawer, wiring)
- `apps/web/tests/e2e/processing-timeline.spec.ts` (new)
- `apps/web/tests/e2e/selected-facts-drawer.spec.ts` (new)
- `apps/web/tests/e2e/output-drawer-meta.spec.ts` (new)
- `apps/web/tests/e2e/export-quick-actions.spec.ts` (new)
- `apps/web/tests/e2e/history-back-button.spec.ts` (new)
- `apps/web/tests/e2e/helpers/selected-facts.ts` (new)
- `apps/web/package.json` (test:e2e:ci)

## Links

- [[testing/e2e/RUN_E2E]]
- [[testing/e2e/OUTPUTS_HISTORY_E2E]]
- [[testing/e2e/EXPORT_E2E]]
