# Sources Add URL E2E

## Summary

Deterministic, parallel-safe Playwright E2E tests for the Add URL (source ingestion) flow: paste URL, click Add, source appears in Active Sources; inline errors for invalid URLs.

## What It Tests

- Adding a URL source: paste URL, click Add, source appears in Active Sources list
- Invalid URL: inline error shown (no toast-only)
- Uses route interception to mock ingest API for deterministic behavior (no external network)

## Selector List

| Selector | Description |
|----------|-------------|
| `source-tab-url` | URL tab button |
| `source-url-input` | URL input field |
| `source-add-button` | Add button |
| `source-add-loading` | Loading spinner (when adding) |
| `source-add-error` | Inline error area (invalid URL / backend error) |
| `sources-list` | Active Sources list container |
| `source-item` | Each source row |
| `data-source-id` | Attribute on source-item (job id) |
| `sources-empty` | Empty state (no sources) |

## How to Run

### Locally

```bash
cd apps/web
ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true npm run test:e2e -- sources-add-url.spec.ts
```

### CI

```bash
BASE_URL=... PLAYWRIGHT_SKIP_WEBSERVER=1 ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true npm run test:e2e:ci
```

`test:e2e:ci` includes `sources-add-url.spec.ts` with `--workers=3`.

## Behavior

- Add button disabled unless URL starts with http:// or https://
- Inline error for invalid URL (client-side validation)
- Inline error for backend ingest failure (no toast-only)
- Route interception mocks POST /api/v1/ingest and GET .../jobs for add test

## Files Touched

- `apps/web/src/app/project/[id]/page.tsx` — selectors, validation, inline error
- `apps/web/src/components/SourceTracker.tsx` — sources-list, source-item, sources-empty
- `apps/web/tests/e2e/helpers/sources.ts` — helpers
- `apps/web/tests/e2e/sources-add-url.spec.ts` — spec

## Links

- [[testing/e2e/RUN_E2E]]
- [[testing/e2e/PLAYWRIGHT_STABLE_SELECTORS]]
