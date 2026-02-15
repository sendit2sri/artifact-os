# Pin Output & Selection UX E2E

## Summary

E2E coverage for: **Selection header bar** (select all visible, invert, clear), **Output sections index + copy** (split mode), **Evidence freshness + Reprocess Source**, **Pin output** (history pinned section), and **Output cache** (instant reopen from history).

## Context

Part of the “polish + trust + speed” upgrades: make multi-select obvious, split output copyable by section, evidence trust (freshness + reprocess), pin outputs for quick access, and cache outputs to avoid duplicate fetches.

## What changed

- **Selection UX:** Selection bar above fact list when `selectedFacts.size > 0`; floating bar has “Bulk actions” label; batch buttons disabled when nothing selected. Testids: `selection-bar`, `selection-select-all-visible`, `selection-invert`, `selection-clear`.
- **Output sections:** For `split` / `split_sections` mode, section index with anchors and “Copy section” per row. Testids: `output-sections-index`, `output-section-item`, `output-section-copy`.
- **Evidence:** Freshness line (“Excerpt captured…” / “No excerpt captured yet…”); “Reprocess Source” CTA when snippet missing; uses existing `ingestUrl`. Testids: `evidence-freshness`, `evidence-reprocess-source`.
- **Pin output:** Backend `is_pinned` on Output + migration; `PATCH /outputs/{id}`; OutputDrawer pin toggle; History “Pinned” section at top. Testids: `output-pin-toggle`, `outputs-history-pinned-section`.
- **Output cache:** In-memory cache in project page; `fetchOutput` only when not cached; pin toggle updates cache.

## How to run / verify

```bash
cd apps/web
npx playwright test pin-output-selection.spec.ts
```

With parallel workers (seed fixture):

```bash
npx playwright test pin-output-selection.spec.ts --workers=3
```

Prerequisites: `ARTIFACT_ENABLE_TEST_SEED=true`, `ARTIFACT_E2E_MODE=true`, backend and web running.

## Files touched

- `apps/web/src/app/project/[id]/page.tsx` — selection bar, output cache, history pinned section, EvidencePanelSimple `workspaceId`, OutputDrawer pin props
- `apps/web/src/components/OutputDrawer.tsx` — section index + copy, output pin toggle
- `apps/web/src/components/EvidencePanelSimple.tsx` — freshness line, Reprocess Source, `workspaceId` prop
- `apps/web/src/lib/api.ts` — `Output`/`OutputSummary` `is_pinned`, `patchOutput`
- `apps/backend/app/models.py` — Output `is_pinned`
- `apps/backend/app/api/projects.py` — list `is_pinned`, `PATCH /outputs/{id}`, `OutputPatch`
- `apps/backend/alembic/versions/h2e7f8a9b0c1_add_output_is_pinned.py` — migration
- `apps/web/tests/e2e/pin-output-selection.spec.ts` — E2E spec

## Links

- [[testing/e2e/RUN_E2E]]
- [[testing/e2e/OUTPUTS_HISTORY_E2E]]
- [[features/FEATURE_SYNTHESIS_HISTORY]]
