# Outputs History E2E

## Summary

Outputs History is a right-side drawer listing recent synthesis outputs. Users can open any output in OutputDrawer. Fully testable via stable selectors; parallel-safe with seeded outputs.

## Stable Selectors

| Selector | Element |
|----------|---------|
| `outputs-history-button` | Header button to open History |
| `outputs-history-drawer` | Drawer container |
| `outputs-history-list` | List of outputs |
| `outputs-history-item` | Each row (li) |
| `outputs-history-open` | Button to open an output (has `data-output-id`) |
| `outputs-history-empty` | Empty state message |
| `outputs-history-loading` | Loading indicator |
| `outputs-history-error` | Error banner |
| `outputs-history-retry` | Retry button in error state |
| `outputs-history-close` | Close drawer button |

## How to Run

```bash
cd apps/web

BASE_URL=http://localhost:3000 PLAYWRIGHT_SKIP_WEBSERVER=1 \
  ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
  npx playwright test outputs-history.spec.ts --workers=3
```

## Prerequisites

- Backend with `ARTIFACT_ENABLE_TEST_SEED=true`, `ARTIFACT_E2E_MODE=true`
- Frontend running (or remove `PLAYWRIGHT_SKIP_WEBSERVER=1`)
- Global setup seeds 2 outputs per project

## E2E Helpers

- `openOutputsHistory(page)`
- `assertHistoryHasItems(page)`
- `openFirstHistoryItem(page)`
- `assertHistoryEmpty(page)`
- `closeOutputsHistory(page)`

---
**Tags:** #docs #e2e #testing
**Related:** [[docs/_index]] [[testing/e2e/RUN_E2E]]
