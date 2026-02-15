# Saved Views & Performance v1 E2E

## Summary

E2E coverage for Saved Views (named presets), shareable view links (URL state), “Selected only” toggle, and virtualized fact list. No new ingestion; frontend-only saved views and performance polish.

## Context

- **Saved Views**: Named presets for scope/filter/sort/group/search/scope; stored in `localStorage` per project (`artifact_saved_views_v1:${projectId}`). Default view in `artifact_default_view_v1:${projectId}`.
- **URL state**: `type`, `value`, `q`, `sort`, `review_status`, `group`, `view`, `show_selected` kept in sync. Clean URL → default view applied on load.
- **Selected only**: Toggle to show only selected facts; persisted per project (`artifact_show_selected_v1:${projectId}`).
- **Virtualization**: Fact list virtualized when count > 200; grouping disabled when virtualized, with banner.

## What changed

- Backend test seed: bulk facts when `facts_count` > 4 (for virtualization E2E).
- Frontend: `lib/savedViews.ts`, `ViewsPanel`, project page state/URL/default view, “Selected only” toggle, virtual list (`@tanstack/react-virtual`), evidence prefetch (max 2).
- E2E: `saved-views.spec.ts`, `view-link.spec.ts`, `selected-only.spec.ts`, `virtualization.spec.ts`; seed fixture `seedLarge` (facts_count=400).

## How to run / verify

- `cd apps/web && npm run test:e2e -- saved-views.spec.ts view-link.spec.ts selected-only.spec.ts virtualization.spec.ts`
- CI: `npm run test:e2e:ci` (includes the four new specs).
- Backend: `ARTIFACT_ENABLE_TEST_SEED=true` for seed (and virtualization seed).

## Files touched

- `apps/backend/app/api/test_helpers.py` — bulk facts when `facts_count` > 4
- `apps/web/src/lib/savedViews.ts` — new
- `apps/web/src/components/ViewsPanel.tsx` — new
- `apps/web/src/app/project/[id]/page.tsx` — views, URL, default view, showOnlySelected, virtualization
- `apps/web/src/components/EvidencePanelSimple.tsx` — prefetch next/prev (max 2)
- `apps/web/tests/e2e/fixtures/seed.ts` — `SeedOptions`, `seedLarge` fixture
- `apps/web/tests/e2e/saved-views.spec.ts` — new
- `apps/web/tests/e2e/view-link.spec.ts` — new
- `apps/web/tests/e2e/selected-only.spec.ts` — new
- `apps/web/tests/e2e/virtualization.spec.ts` — new
- `apps/web/package.json` — `@tanstack/react-virtual`, test:e2e:ci entries

## Links

- [[testing/e2e/RUN_E2E]]
- [[testing/e2e/FACTS_SORT_GROUP_E2E]]
- [[_index]]
