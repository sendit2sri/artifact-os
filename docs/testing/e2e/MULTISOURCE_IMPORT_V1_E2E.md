# Multi-Source Import v1 E2E

## Summary

E2E coverage for Reddit thread and YouTube transcript import: source-type badges, fact context chips (OP / Comment / Transcript timestamps), evidence permalink/video button, and deterministic demo seeds. No external network in tests.

## Context

- URL → facts → synth → export remains the core flow; multi-source adds first-class Reddit and YouTube without breaking it.
- Backend: `SourceDoc.source_type` (WEB | REDDIT | YOUTUBE), `canonical_url`, `metadata_json`; `ResearchNode.source_url` for comment permalink / video URL.
- E2E uses `POST /test/seed_sources` with `sources: ["reddit"]` or `["youtube"]` when `ARTIFACT_ENABLE_TEST_SEED=true`.

## What changed

- **Backend:** SourceDoc + ResearchNode schema (source_type, canonical_url, metadata_json, source_url); extractors (reddit, youtube, web); ingest pipeline detects type and uses extractors; evidence/sources APIs return source_type and fact-level url.
- **Frontend:** Quickstart “Try Reddit demo” / “Try YouTube demo” (when `NEXT_PUBLIC_ENABLE_TEST_SEED=true`); SourceTracker source-type badge; FactCard context chip (OP / Comment / Transcript 0:00–0:10); Evidence panel “Open permalink” / “Open video”.
- **E2E:** `reddit-import.spec.ts`, `youtube-import.spec.ts`; wired into `test:e2e:ci`.

## How to run / verify

1. **Backend in E2E mode**  
   Set `ARTIFACT_ENABLE_TEST_SEED=true`. Run API + worker as usual (no extra flags).

2. **Frontend**  
   Set `NEXT_PUBLIC_ENABLE_TEST_SEED=true` so quickstart shows Reddit/YouTube demo buttons.

3. **Run the two specs**
   - `npx playwright test reddit-import.spec.ts`
   - `npx playwright test youtube-import.spec.ts`

4. **CI**  
   `npm run test:e2e:ci` includes both specs.

## Files touched

- Backend: `app/models.py`, `app/extractors/` (reddit, youtube, web, `__init__`), `app/workers/ingest_task.py`, `app/api/ingest.py`, `app/api/projects.py`, `app/api/test_helpers.py`, `alembic/versions/m7j4e5f6g7h_*`.
- Frontend: `lib/api.ts`, `app/project/[id]/page.tsx`, `SourceTracker.tsx`, `FactCard.tsx`, `EvidencePanelSimple.tsx`.
- E2E: `reddit-import.spec.ts`, `youtube-import.spec.ts`; `package.json` (test:e2e:ci).
- Docs: this file; `docs/_index.md`.

## Links

- [[testing/e2e/RUN_E2E]]
- [[testing/e2e/EVIDENCE_PANEL_E2E]]
- [[testing/e2e/SOURCES_ADD_URL_E2E]]
