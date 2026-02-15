# PR Template: Project UX stability

**Title**: `Project UX stability: phase model, view state, watchdog, tests`

---

## What changed

- View state refactor (7 bugs fixed: prefs timing, URL sync, effect loops)
- Filter chips row (active filters visible + dismissible)
- Diagnostics strip (`?debug=1`)
- Control height standardization (h-9)
- Enhanced idle contract (job status in E2E)
- Phase state machine (EMPTY/INGESTING/PROCESSING/READY/ERROR)
- Empty-only overlay (onboarding only in EMPTY phase)
- Queued watchdog (stuck job detection + retry)
- 25 acceptance tests + 3 canary tests

---

## Risky areas

- **URL sync**: Hydration gates, debouncing; verify no loops
- **Timers**: 1s interval in QueuedJobAlert; verify cleanup on unmount
- **Retry**: In-flight protection; verify no duplicate API calls

---

## How to test

1. **Manual**: See `docs/testing/e2e/PRE_MERGE_CHECKLIST.md`
2. **E2E**:
   ```bash
   npm run test:e2e -- canary.spec.ts
   npm run test:e2e -- view-state-refactor.spec.ts
   npm run test:e2e
   ```

---

## Rollback plan

- View state: Single file revert
- Filter chips: Remove conditional block
- Diagnostics: Debug-only
- Watchdog: Remove component + route
- Phase model: Remove imports

---

## Metrics to watch post-deploy

- Job pending durations
- Retry rate
- Client errors (Sentry): "Maximum update depth", "setState on unmounted", "Invalid time value"

---

## Links

- **Summary**: `docs/architecture/COMPLETE_IMPLEMENTATION_SUMMARY_FEB_2026.md`
- **Checklist**: `docs/testing/e2e/PRE_MERGE_CHECKLIST.md`
