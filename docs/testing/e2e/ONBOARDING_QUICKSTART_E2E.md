# Onboarding & Quick Start E2E

## Summary

E2E coverage for **first-run guided tour** (onboarding overlay), **empty-state quick start cards**, **smart default sort/group persistence**, and **command palette** (Cmd/Ctrl+K).

## Context

Part of “activation + onboarding + perceived intelligence”: reduce confusion for first-time users with a lightweight guided tour, quick start when empty, and power-user command palette.

## What changed

- **Onboarding:** 5-step overlay (Add Source → Facts → Select → Generate → History). Shown when 0 sources and 0 facts and `artifact_onboarding_completed_v1` not in localStorage. Skip/Next/Finish; click outside closes. Selectors: `onboarding-overlay`, `onboarding-next`, `onboarding-skip`, `onboarding-step-title`.
- **Quick start:** When no jobs/sources/facts, show 3 cards: Paste a URL (focus input), Try demo seed (only when `NEXT_PUBLIC_ENABLE_TEST_SEED=true`), Upload a PDF (switch to file tab). Selectors: `quickstart-paste-url`, `quickstart-demo-seed`, `quickstart-upload-pdf`.
- **Sort/group persistence:** Default sort = needs_review, group = OFF. Persist in localStorage: `artifact_sort_v1`, `artifact_group_by_source_v1` when user changes.
- **Command palette:** Cmd+K / Ctrl+K opens non-modal palette; commands: Add Source, Open History, Open Export, Toggle Group by Source, Sort: Needs Review. Selectors: `command-palette`, `command-item`.

## How to run / verify

```bash
cd apps/web
npx playwright test onboarding.spec.ts quickstart.spec.ts command-palette.spec.ts
```

Onboarding and quickstart tests create an empty project via API; command-palette uses seed fixture. For demo seed in quickstart, set `NEXT_PUBLIC_ENABLE_TEST_SEED=true` and `ARTIFACT_ENABLE_TEST_SEED=true`.

## Files touched

- `apps/web/src/components/OnboardingOverlay.tsx` — new
- `apps/web/src/app/project/[id]/page.tsx` — onboarding state, quickstart block, sort/group persist, command palette, demo seed mutation, urlInputRef
- `apps/web/src/lib/api.ts` — `seedDemoProject`
- `apps/web/tests/e2e/onboarding.spec.ts` — new
- `apps/web/tests/e2e/quickstart.spec.ts` — new
- `apps/web/tests/e2e/command-palette.spec.ts` — new
- `.env.example` — `NEXT_PUBLIC_ENABLE_TEST_SEED` comment

## Links

- [[testing/e2e/RUN_E2E]]
- [[testing/e2e/PIN_OUTPUT_SELECTION_E2E]]
