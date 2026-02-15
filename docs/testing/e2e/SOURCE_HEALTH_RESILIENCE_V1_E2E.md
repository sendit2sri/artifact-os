# Source Health & Resilience v1 E2E

## Summary

Per-source status (QUEUED/FETCHING/EXTRACTING/FACTING/DONE/FAILED), error codes and messages, dedupe by canonical_url, retry endpoint, and duplicate highlight UX. E2E coverage for failure modes, retry, and dedupe highlight without external network.

## Context

- Protects the core “Add Source” loop when sources fail (rate limits, paywalls, blocked content).
- Backend: standardized job steps and result_summary.error_code / error_message; dedupe by SourceDoc.canonical_url; POST /projects/{id}/sources/retry; seed_sources with { kind, mode } for ok / transcript_disabled / paywall / empty_content.
- Frontend: ProcessingTimeline shows error_code label and error_message; Retry calls retrySource(canonical_url, source_type); duplicate ingest shows “Already added” toast and pulse on existing source row.

## What changed

- **Backend:** Worker uses QUEUED/FETCHING/EXTRACTING/FACTING/DONE/FAILED; on failure sets result_summary.error_code and error_message. Ingest API dedupes by existing SourceDoc (canonical_url/url); returns completed “duplicate” job with is_duplicate. POST /projects/{id}/sources/retry creates new job and re-runs ingest (E2E: e2e_retry_ok stub). seed_sources accepts sources as [{ kind, mode }] with failure modes.
- **Frontend:** Job types extended (error_code, error_message, is_duplicate, canonical_url). retrySource(projectId, canonical_url, source_type). ProcessingTimeline: processing-job-error-code, processing-job-error-message, processing-job-retry; onRetry(canonicalUrl, sourceType). Duplicate ingest sets highlightCanonicalUrl; SourceTracker highlightCanonicalUrl prop and source-row / source-highlight-pulse.
- **E2E:** source-failure-modes.spec.ts, source-retry.spec.ts, source-dedupe-highlight.spec.ts; wired into test:e2e:ci.

## How to run / verify

1. Backend: set ARTIFACT_ENABLE_TEST_SEED=true for seed_sources and retry stub.
2. Run specs:  
   `npx playwright test source-failure-modes.spec.ts source-retry.spec.ts source-dedupe-highlight.spec.ts`
3. CI: `npm run test:e2e:ci` includes these specs.

## Files touched

- Backend: app/workers/ingest_task.py, app/api/ingest.py, app/api/projects.py, app/api/test_helpers.py.
- Frontend: lib/api.ts, app/project/[id]/page.tsx, ProcessingTimeline.tsx, SourceTracker.tsx.
- E2E: source-failure-modes.spec.ts, source-retry.spec.ts, source-dedupe-highlight.spec.ts; package.json test:e2e:ci.
- Docs: this file; docs/_index.md.

## Links

- [[testing/e2e/MULTISOURCE_IMPORT_V1_E2E]]
- [[testing/e2e/RUN_E2E]]
