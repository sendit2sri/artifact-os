# Trust & Quality v2 — E2E

## Summary

E2E coverage and implementation for de-duplication, source health dashboard, and audit-grade export.

## Context

Goal: make facts feel clean, non-repetitive, and audit-ready. Changes include near-duplicate merge UX, Source Health panel, and export with evidence snippets.

## What changed

- **Fact Deduplication**: ResearchNode fields `duplicate_group_id`, `is_suppressed`, `canonical_fact_id`; POST `/projects/{id}/facts/dedup` with deterministic similarity (SequenceMatcher); canonical selection (pinned > key_claim > confidence > older); suppress non-canonical (no delete). Frontend: "Clean duplicates" button (`facts-dedup-trigger`), "Show suppressed" toggle (`facts-show-suppressed-toggle`), FactCard "Duplicate of" badge (`fact-duplicate-badge`).
- **Source Health Panel**: GET `/projects/{id}/sources/summary` per-source status, counts; non-modal sheet (`source-health-panel`), Open button (`source-health-open`) filters main view to URL. Command palette + top bar.
- **Export Upgrade**: CSV columns `source_domain`, `source_url`, `fact_text`, `confidence_score`, `is_key_claim`, `review_status`, `is_pinned`, `evidence_snippet`; Markdown adds Evidence snippet and Source URL. Formats `csv_evidence` and `markdown_evidence`. Frontend: `export-facts-csv-evidence`, `export-facts-md-evidence`.

## How to run / verify

**Backend migration:**
```bash
cd apps/backend
alembic upgrade head
```

**E2E (new specs):**
```bash
cd apps/web
BASE_URL=http://localhost:3000 PLAYWRIGHT_SKIP_WEBSERVER=1 \
ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
npx playwright test facts-dedup.spec.ts source-health.spec.ts export-evidence.spec.ts --workers=3
```

## Files touched

- Backend: models (dedup fields), migration j4g1b2c3d4e, projects.py (dedup, sources/summary, export extensions), test_helpers (with_near_duplicate)
- Frontend: api.ts, FactCard, page.tsx, SourceHealthPanel, ExportPanel
- E2E: facts-dedup.spec.ts, source-health.spec.ts, export-evidence.spec.ts, helpers/dedup.ts

## Links

- [[testing/e2e/TRUST_REVIEW_LOOP_V1_E2E]]
- [[testing/e2e/EXPORT_E2E]]
