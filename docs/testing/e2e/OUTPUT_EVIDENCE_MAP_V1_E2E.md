# Output Evidence Map v1 E2E

## Summary

Interactive Output Annotations v1: every synthesis output is auditable via an **Evidence Map** (facts used, status/pin, one-click jump to evidence). OutputDrawer and share page show the map; "View evidence" opens EvidencePanelSimple and highlights excerpt when present.

## Context

- Backend: `GET /outputs/{output_id}/evidence_map` returns facts (with review_status, is_pinned, is_key_claim, source_type, source_url, source_domain, evidence_snippet, has_excerpt, evidence_start_char_raw/end) and sources.
- Frontend: OutputDrawer has collapsible "Evidence Map (X facts)" with per-fact badges and "View evidence" CTA; share page has read-only Evidence Map with snippet + Open source link.
- Page wiring: `onOpenEvidenceForFact(factId, evidenceMapFact)` sets viewingFact (from factMap or minimal Fact built from evidence map) so EvidencePanelSimple opens.

## What changed

- **Backend:** New endpoint `GET /outputs/{output_id}/evidence_map`; single query (ResearchNode join SourceDoc by output.fact_ids); response schema per spec.
- **Frontend:** OutputDrawer Evidence Map UI; share page Evidence Map; `fetchOutputEvidenceMap` and types in api.ts; project page `onOpenEvidenceForFact` + `evidenceMapFactToFact`.
- **E2E:** `output-evidence-map.spec.ts` (Evidence Map visible, 2 items, View evidence opens panel, fact text + snippet); `output-share-evidence.spec.ts` (share page evidence map, items, at least one Open source link).

## How to run / verify

- Backend: `GET /api/v1/outputs/{output_id}/evidence_map` returns JSON with `output_id`, `facts[]`, `sources[]`.
- E2E: `npx playwright test output-evidence-map.spec.ts` and `npx playwright test output-share-evidence.spec.ts`. Wire into `test:e2e:ci` (run with full e2e suite).

## Files touched

- `apps/backend/app/api/projects.py` — evidence_map endpoint + schemas
- `apps/web/src/lib/api.ts` — `OutputEvidenceMapFact`, `OutputEvidenceMapResponse`, `fetchOutputEvidenceMap`
- `apps/web/src/components/OutputDrawer.tsx` — Evidence Map collapsible, `onOpenEvidenceForFact`
- `apps/web/src/app/project/[id]/page.tsx` — `onOpenEvidenceForFact`, `evidenceMapFactToFact`
- `apps/web/src/app/output/[id]/page.tsx` — Evidence Map section, fetch evidence map
- `apps/web/tests/e2e/output-evidence-map.spec.ts` — new
- `apps/web/tests/e2e/output-share-evidence.spec.ts` — new
- `docs/testing/e2e/OUTPUT_EVIDENCE_MAP_V1_E2E.md` — this file

## Links

- [[EVIDENCE_PANEL_E2E]]
- [[OUTPUTS_HISTORY_E2E]]
- [[RUN_E2E]]
