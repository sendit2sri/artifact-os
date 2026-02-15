# Share & Audit v1 E2E

## Summary
E2E coverage for Shareable Output Page, Output Diff, and Provenance Export features.

## Context
- **Shareable Output Page**: Read-only `/output/[id]` route with Copy link, Back to project.
- **Output Diff**: Compare two outputs in History drawer with line-based diff.
- **Provenance Export**: Export output as Markdown with Facts Used + Sources sections.

## What changed
- `output-share-page.spec.ts` — Generate synth, open share page, assert title/meta/content
- `output-diff.spec.ts` — Generate two modes, open Compare, assert diff lines
- `provenance-export.spec.ts` — Open output, Export with provenance, assert download contains Facts Used + Sources

## How to run / verify

```bash
cd apps/web && npx playwright test output-share-page.spec.ts output-diff.spec.ts provenance-export.spec.ts --workers=3
```

Prerequisites: `ARTIFACT_ENABLE_TEST_SEED=true`, `ARTIFACT_E2E_MODE=true`.

## Files touched
- `apps/web/src/app/output/[id]/page.tsx` — Shareable output page
- `apps/web/src/components/OutputDrawer.tsx` — Share, Export with provenance
- `apps/web/src/components/OutputCompareDrawer.tsx` — Compare outputs diff
- `apps/web/src/app/project/[id]/page.tsx` — Compare button, projectId to OutputDrawer
- `apps/web/tests/e2e/output-share-page.spec.ts`
- `apps/web/tests/e2e/output-diff.spec.ts`
- `apps/web/tests/e2e/provenance-export.spec.ts`
- `apps/web/package.json` — test:e2e:ci

## Links
- [[testing/e2e/RUN_E2E]]
- [[_index]]
