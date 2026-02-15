# Focus Mode & Regenerate E2E

## Summary

**Focus mode:** When the Output drawer is open, a toggle hides the floating selection bar so users can read output with less clutter. State is persisted in `localStorage` (`artifact:focusMode`). **Regenerate:** From an open output (or from History), users can regenerate synthesis with the same facts and mode; missing facts are handled with a friendly message.

## Stable Selectors

| Selector | Element |
|----------|---------|
| `output-drawer-focus-toggle` | Focus mode toggle in Output drawer header |
| `output-drawer-regenerate` | Regenerate button in Output drawer footer |
| `synthesis-selection-bar` | Floating selection bar (hidden when focus mode on and drawer open) |
| `output-drawer` | Output drawer container |
| `output-drawer-content` | Output content area |

## How to Run

```bash
cd apps/web

BASE_URL=http://localhost:3000 PLAYWRIGHT_SKIP_WEBSERVER=1 \
  ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
  npx playwright test focus-mode-regenerate.spec.ts --workers=3
```

## Tests

- **Focus mode:** Open output → toggle focus → selection bar hidden → toggle off → selection bar visible again.
- **Regenerate:** Generate synthesis, close drawer → open History → open first output → click Regenerate → drawer updates with new content (length > 80).

## Prerequisites

- Backend with `ARTIFACT_ENABLE_TEST_SEED=true`, `ARTIFACT_E2E_MODE=true`
- Seeded project with facts and synthesis capability

## Links

- [[testing/e2e/OUTPUTS_HISTORY_E2E]]
- [[testing/e2e/PANELS_PIN_BACK_E2E]]
- [[testing/e2e/RUN_E2E]]
