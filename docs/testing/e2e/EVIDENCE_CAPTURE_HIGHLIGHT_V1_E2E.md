# Evidence Capture + Highlight v1 E2E

## Summary

E2E coverage for the Evidence Capture + Highlight feature: capture excerpt from source content, store offsets, and highlight evidence in the source viewer.

## Context

Evidence was previously semi-placeholder: snippet existed only when seeded or when the ingestion pipeline provided it. This feature makes Evidence a real capture + highlight + quote system.

## What changed

- **Backend:** `POST /projects/{project_id}/facts/{fact_id}/capture_excerpt` — capture source excerpt by start/end offsets (raw or markdown), store `evidence_snippet`, `quote_text_raw`, and offset fields.
- **Frontend:** EvidencePanelSimple — enabled "Capture excerpt" button, Source content viewer with highlight, format toggle, start/end inputs, "Capture selection" save.
- **SourceContentViewer:** Fetches source content, renders with optional `<mark data-testid="source-highlight">` when offsets exist.
- **Export:** Facts CSV (with evidence) outputs "No excerpt captured yet" when snippet is empty.
- **E2E:** `capture-excerpt.spec.ts`, `capture-excerpt-no-content.spec.ts`.

## How to run / verify

```bash
cd apps/web && npm run test:e2e:ci
# Or run specific specs:
npx playwright test capture-excerpt.spec.ts capture-excerpt-no-content.spec.ts --workers=2
```

Prerequisites: `ARTIFACT_ENABLE_TEST_SEED=true`, `ARTIFACT_E2E_MODE=true`, backend and web dev servers running.

## Files touched

- `apps/backend/app/api/projects.py` — capture_excerpt endpoint, evidence offsets in response, csv_evidence "No excerpt"
- `apps/backend/app/api/test_helpers.py` — `with_source_no_content` seed option
- `apps/web/src/lib/api.ts` — `captureExcerpt`, `EvidenceResponse` offsets, `CaptureExcerptParams`
- `apps/web/src/components/SourceContentViewer.tsx` — new
- `apps/web/src/components/EvidencePanelSimple.tsx` — capture flow, SourceContentViewer integration
- `apps/web/src/app/project/[id]/page.tsx` — `onFactUpdate` invalidation
- `apps/web/tests/e2e/capture-excerpt.spec.ts` — new
- `apps/web/tests/e2e/capture-excerpt-no-content.spec.ts` — new
- `apps/web/tests/e2e/helpers/capture-excerpt.ts` — new
- `apps/web/package.json` — new specs in test:e2e:ci

## Links

- [[testing/e2e/RUN_E2E]]
- [[features/FEATURE_SYNTHESIS_HISTORY]]
