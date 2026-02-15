# Export E2E

## Summary

Deterministic, parallel-safe Playwright E2E tests for the project export flow: Markdown/CSV/JSON export via panel, success banner with download link, error + retry.

## What It Tests

- Export Markdown success: open panel, click Markdown, wait for success, click download, assert filename and content (Sources:/example.com/seeded fact text)
- Export error + retry: intercept API to return 500, assert error banner and retry visible, click retry, assert success

## Selector List

| Selector | Description |
|----------|-------------|
| `export-button` | Export button in header |
| `export-panel` | Sheet/panel container |
| `export-option-markdown` | Markdown format option |
| `export-option-csv` | CSV format option |
| `export-option-json` | JSON format option |
| `export-loading` | Loading indicator |
| `export-success` | Success banner |
| `export-download` | Download link/button |
| `export-error` | Error banner |
| `export-retry` | Retry button |
| `export-close` | Close button |

## How to Run

### Locally

```bash
cd apps/web
ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true npm run test:e2e -- export.spec.ts
```

### CI

```bash
BASE_URL=http://localhost:3001 PLAYWRIGHT_SKIP_WEBSERVER=1 \
  ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
  npm run test:e2e:ci
```

`test:e2e:ci` includes `export.spec.ts` with `--workers=3`.

## API

- GET /api/v1/projects/{projectId}/export?format=markdown|json|csv
- Returns file content (deterministic with seeded facts)

## Files Touched

- `apps/backend/app/api/projects.py` — export endpoint
- `apps/web/src/lib/api.ts` — exportProject()
- `apps/web/src/components/ExportPanel.tsx` — new component
- `apps/web/src/app/project/[id]/page.tsx` — ExportPanel integration
- `apps/web/tests/e2e/export.spec.ts` — spec

## Links

- [[testing/e2e/RUN_E2E]]
- [[testing/e2e/PLAYWRIGHT_STABLE_SELECTORS]]
