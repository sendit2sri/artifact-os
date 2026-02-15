# UX Fixes: Non-Modal Panels, Output Types, Split Sections, Fact Status

## Summary

Fixes for 8 UX issues: non-modal right-side panels, Radix DialogTitle, output type differentiation, “Generate Separate Sections” (split mode), and fact status buttons (Approve / Needs Review / Flag). E2E tests added/updated for non-modal behavior, output types, split sections, and fact status persistence.

## Context

- SynthesisBuilder, OutputDrawer, History drawer, and Evidence panel were blocking background interaction (blur/overlay).
- Paragraph / Script Outline / Research Brief produced identical output.
- “Generate Separate Sections” produced a single section.
- Approve / Needs Review / Flag did not update state or show feedback.

## What Changed

- **Panels:** All right-side panels use `modal={false}` and `nonModal` on SheetContent; overlay omitted when `nonModal` so background stays clickable.
- **Radix:** EvidencePanelSimple includes `SheetHeader` + `SheetTitle` (sr-only) for accessibility.
- **Output types:** Backend E2E and LLM vary content by mode (paragraph / outline / brief / split); output title and footer reflect mode.
- **Split:** Builder sends `mode=split`; backend returns sectioned content (`## Section N: …` in E2E).
- **Fact status:** FactCard sends uppercase `APPROVED` / `NEEDS_REVIEW` / `FLAGGED`; toasts on success/error; stable testids `fact-approve`, `fact-needs-review`, `fact-flag`.
- **E2E:** Non-modal test (open drawer, click FactCard evidence → evidence panel opens); output types test (paragraph vs outline differ + Mode footer); split test (builder → Generate Separate Sections → content has `## Section`); fact-status.spec.ts (Approve → toast + persist after reload). Seed extended with second source for builder/split flow.

## How to Run / Verify

```bash
# Backend (E2E mode)
ARTIFACT_E2E_MODE=true ARTIFACT_ENABLE_TEST_SEED=true uvicorn app.main:app ...

# Frontend
cd apps/web && npm run dev

# E2E (all relevant specs)
BASE_URL=... PLAYWRIGHT_SKIP_WEBSERVER=1 ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true npx playwright test synthesis-flow.spec.ts outputs-history.spec.ts fact-status.spec.ts --workers=3
```

## Files Touched

- `apps/web/src/components/ui/sheet.tsx` — `nonModal` prop, conditional overlay
- `apps/web/src/components/OutputDrawer.tsx` — `modal={false}`, `nonModal`
- `apps/web/src/components/SynthesisBuilder.tsx` — `nonModal`
- `apps/web/src/components/EvidencePanelSimple.tsx` — `modal={false}`, `nonModal`, SheetTitle
- `apps/web/src/app/project/[id]/page.tsx` — History drawer non-modal, format testid, split mode, mode types
- `apps/web/src/lib/api.ts` — `synthesizeFacts` mode type includes `split`
- `apps/web/src/components/FactCard.tsx` — uppercase status, toast, testids
- `apps/backend/app/api/projects.py` — E2E synthesis by mode, output_type, split
- `apps/backend/app/services/llm.py` — split prompt
- `apps/backend/app/api/test_helpers.py` — second source for mixed-source E2E
- `apps/web/tests/e2e/helpers/synthesis.ts` — setSynthesisFormat, getOutputDrawerContent, selectTwoFactsFromDifferentSources, generateSplitSections
- `apps/web/tests/e2e/synthesis-flow.spec.ts` — output types differ, split sections tests
- `apps/web/tests/e2e/outputs-history.spec.ts` — non-modal test
- `apps/web/tests/e2e/fact-status.spec.ts` — new spec for Approve persistence

## Links

- [[_index]]
- [[testing/e2e/2026-02-08_outputs-history-e2e]]
