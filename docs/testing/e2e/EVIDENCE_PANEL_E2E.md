# Evidence Panel E2E

## Summary

Deterministic, parallel-safe Playwright E2E tests for the Evidence panel: fetches evidence from backend, shows source + excerpt, loading + error + retry, Prev/Next navigation.

## What It Tests

- Selecting a fact (click evidence-open) opens the Evidence panel and fetches evidence via network
- Panel shows fact text, source domain (example.com), source URL link
- Loading state (evidence-loading) visible during fetch, then content
- Error state: evidence-error + evidence-retry; retry succeeds
- Prev/Next buttons navigate through visible facts
- Prev disabled on first fact, Next disabled on last fact

## Selector List

| Selector | Description |
|----------|-------------|
| `evidence-open` | View Evidence button on each fact card (opens panel) |
| `data-fact-id` | Attribute on fact-card and evidence-open (fact.id) |
| `evidence-panel` | Panel container (Sheet) |
| `evidence-close` | Close button |
| `evidence-fact-text` | Current fact text |
| `evidence-source-domain` | Source domain label |
| `evidence-source-url` | Source URL link |
| `evidence-prev` | Previous fact |
| `evidence-next` | Next fact |
| `evidence-empty` | Empty state (no fact selected) |
| `evidence-loading` | Loading indicator (during fetch) |
| `evidence-error` | Inline error container |
| `evidence-retry` | Retry button (when error shown) |

## How to Run

### Locally

```bash
cd apps/web
ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true npm run test:e2e -- evidence-panel.spec.ts
```

### CI

```bash
BASE_URL=http://localhost:3001 PLAYWRIGHT_SKIP_WEBSERVER=1 \
  ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
  npm run test:e2e:ci
```

`test:e2e:ci` includes `evidence-panel.spec.ts` with `--workers=3`.

## API

- GET /api/v1/projects/{projectId}/facts/{factId}/evidence
- Returns: fact_id, fact_text, sources (domain, url, title?, excerpt?), highlights?, updated_at?

## Troubleshooting

- **404**: Fact not found or project mismatch. Ensure seed creates facts for the project.
- **500**: Backend error. Check backend logs; evidence endpoint may be missing or failing.
- **Timeout**: Increase expect().toPass timeout; network may be slow.

## Files Touched

- `apps/backend/app/api/projects.py` — GET /projects/{id}/facts/{factId}/evidence
- `apps/web/src/lib/api.ts` — fetchFactEvidence, EvidenceResponse
- `apps/web/src/components/EvidencePanelSimple.tsx` — fetch, cache, loading, error, retry
- `apps/web/src/components/FactCard.tsx` — evidence-open, data-fact-id
- `apps/web/src/app/project/[id]/page.tsx` — EvidencePanelSimple projectId
- `apps/web/tests/e2e/helpers/evidence.ts` — retryEvidence, assertEvidenceLoadingThenLoaded
- `apps/web/tests/e2e/evidence-panel.spec.ts` — spec

## Links

- [[testing/e2e/RUN_E2E]]
- [[testing/e2e/PLAYWRIGHT_STABLE_SELECTORS]]
- [[misc/EVIDENCE_PANEL_ENHANCEMENTS]]
