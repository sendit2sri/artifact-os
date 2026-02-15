# Project Rename E2E

## Summary

Deterministic, parallel-safe Playwright E2E tests for the project title inline rename flow: click to edit, save on Enter, persist after reload, inline validation errors.

## What It Tests

- Rename project: click title, fill new name, Enter, assert updated
- Persistence: reload page, assert title still the new name
- Validation: blank input, Enter → inline error visible, title unchanged (Cancel restores)

## Selector List

| Selector | Description |
|----------|-------------|
| `project-title` | Title display (click to edit) |
| `project-title-input` | Input when editing |
| `project-title-save` | Save button |
| `project-title-cancel` | Cancel button |
| `project-title-error` | Inline error banner |

## How to Run

### Locally

```bash
cd apps/web
ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true npm run test:e2e -- project-rename.spec.ts
```

### CI

```bash
BASE_URL=http://localhost:3001 PLAYWRIGHT_SKIP_WEBSERVER=1 \
  ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
  npm run test:e2e:ci
```

`test:e2e:ci` includes `project-rename.spec.ts` with `--workers=3`.

## Files Touched

- `apps/web/src/app/project/[id]/page.tsx` — inline edit UX, selectors, optimistic update
- `apps/web/src/lib/api.ts` — `updateProjectName`, `fetchProject` with signal
- `apps/web/tests/e2e/project-rename.spec.ts` — spec

## Links

- [[testing/e2e/RUN_E2E]]
- [[testing/e2e/PLAYWRIGHT_STABLE_SELECTORS]]
