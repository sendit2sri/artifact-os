# Panels Pin & Back E2E

## Summary

Right-side panels (Output drawer, Evidence panel, History drawer) support **pin** and **Back to History** navigation. Pin keeps a panel open when opening another panel or changing selection; Back returns from Output to History and restores list scroll.

## What Pin Does

- **Output drawer:** When pinned, opening the History drawer does not close the output drawer; both can be visible. Close (X) still closes the panel even when pinned.
- **Evidence panel:** When pinned, clicking another fact updates the panel content but keeps the panel open; background/outside click does not close it. Close (X) still closes.
- Pin only prevents **auto-close** (e.g. opening another panel or changing selection); explicit close always works.

## Stable Selectors

| Selector | Element |
|----------|---------|
| `output-drawer-pin` | Pin toggle in Output drawer header |
| `evidence-pin` | Pin toggle in Evidence panel header |
| `output-drawer-back-to-history` | Back to History button (when opened from History) |
| `output-drawer` | Output drawer container |
| `outputs-history-drawer` | History drawer container |
| `outputs-history-list` | History list |
| `evidence-panel` | Evidence panel container |
| `evidence-fact-text` | Fact text in Evidence panel |

## How to Run

```bash
cd apps/web

BASE_URL=http://localhost:3000 PLAYWRIGHT_SKIP_WEBSERVER=1 \
  ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
  npx playwright test panels-pin.spec.ts outputs-history.spec.ts --workers=3
```

- **panels-pin.spec.ts:** Pin evidence (click next fact, panel stays open and updates); pin output then open History (both visible).
- **outputs-history.spec.ts:** Open History → open first output → Back to History → history list visible without re-clicking History.

## Prerequisites

- Backend with `ARTIFACT_ENABLE_TEST_SEED=true`, `ARTIFACT_E2E_MODE=true`
- Seeded project with facts and at least one synthesis output for history tests

## Links

- [[testing/e2e/OUTPUTS_HISTORY_E2E]]
- [[testing/e2e/EVIDENCE_PANEL_E2E]]
- [[testing/e2e/RUN_E2E]]
