# Fact Dedup + Cluster Preview v1 E2E

## Summary

Semantic fact deduplication and cluster preview before synthesis. Collapse near-duplicate facts into representative rows, show "+N similar" chip, allow expanding via drawer, and preview cluster choices before Generate.

## Context

Multi-source import (Reddit, web, YouTube) yields duplicate/near-duplicate facts. Users need to collapse and review before synthesis without external APIs or embeddings in tests.

## What changed

### Backend

- **GET /projects/{id}/facts**: Optional params `group_similar`, `similarity_mode`, `min_sim`, `group_limit`. Lexical Jaccard clustering (deterministic).
- **GET /projects/{id}/facts/group/{group_id}**: Returns full facts for a group.
- **Test seed**: `with_similar_facts: true` adds token-similar facts.

### Frontend

- **Toggle** "Collapse duplicates" near group/sort; persists via `collapse_similar_default` preference.
- **FactCard** chip "+N similar" (`fact-similar-chip`) when `collapsed_count > 1`.
- **SimilarFactsDrawer** (`similar-facts-drawer`): list group facts, "Select all in group", "Replace selection with representative only".
- **ClusterPreviewModal** (`cluster-preview`): pre-synthesis modal when collapse ON and selection includes grouped facts; per-group "include all / rep only", confirm → synthesis.

### E2E

- `collapse-similar.spec.ts`: Toggle collapse, fewer cards, chip visible, click opens drawer.
- `similar-drawer-selection.spec.ts`: Select rep, open drawer, Select all, count increases.
- `cluster-preview-generate.spec.ts`: Collapse + grouped selection, Generate, cluster preview, confirm, output content > 80.

## How to run / verify

```bash
# E2E (requires ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true)
cd apps/web && npm run test:e2e -- collapse-similar.spec.ts similar-drawer-selection.spec.ts cluster-preview-generate.spec.ts
```

## Files touched

- `apps/backend/app/api/projects.py` — grouping API, group endpoint
- `apps/backend/app/api/test_helpers.py` — `with_similar_facts` seed option
- `apps/web/src/lib/api.ts` — `group_similar`, `fetchFactsGroup`, `FactsGroupedResponse`
- `apps/web/src/components/FactCard.tsx` — `fact-similar-chip`, `onSimilarChipClick`
- `apps/web/src/components/SimilarFactsDrawer.tsx` — new
- `apps/web/src/components/ClusterPreviewModal.tsx` — new
- `apps/web/src/app/project/[id]/page.tsx` — toggle, drawer, cluster preview wiring
- `apps/web/tests/e2e/collapse-similar.spec.ts` — new
- `apps/web/tests/e2e/similar-drawer-selection.spec.ts` — new
- `apps/web/tests/e2e/cluster-preview-generate.spec.ts` — new
- `apps/web/tests/e2e/helpers/collapse-similar.ts` — new
- `apps/web/tests/e2e/fixtures/seed.ts` — `with_similar_facts` in options

## Links

- [[testing/e2e/RUN_E2E]]
- [[testing/e2e/TRUST_QUALITY_V2_E2E]] — fact dedup (suppress) vs collapse-similar (display)
- [[features/FEATURE_SYNTHESIS_HISTORY]]
