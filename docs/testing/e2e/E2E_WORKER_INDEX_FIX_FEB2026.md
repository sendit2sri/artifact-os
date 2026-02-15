# E2E Worker Index Fix (Playwright workerInfo)

## Context

The worker-scoped seed fixture (apps/web/tests/e2e/fixtures/seed.ts) was using `process.env.TEST_PARALLEL_INDEX` to derive deterministic project_id/source_id per worker. That env var is not reliable in Playwright. Seeding must use Playwright-provided worker indices so parallel runs are deterministic and CI-safe.

## Problem

- **Symptom:** Fixture depends on `process.env.TEST_PARALLEL_INDEX ?? '0'` for worker index.
- **Risk:** Env may be unset or wrong in some environments; tests or debug file names could collide or fail.
- **Where:** apps/web/tests/e2e/fixtures/seed.ts.

## Root Cause

Playwright does not guarantee `TEST_PARALLEL_INDEX` (or any env var) for worker index. Worker-scoped fixtures receive `WorkerInfo` as the third parameter to the fixture function; that is the supported way to get `parallelIndex` or `workerIndex`.

## Fix

- **apps/web/tests/e2e/fixtures/seed.ts**
  - Use Playwright’s `WorkerInfo` (third parameter to the worker-scoped fixture): `async ({}, use, workerInfo: WorkerInfo) => { ... }`.
  - Stable worker id: `getWorkerId(workerInfo)` returns `workerInfo.parallelIndex ?? workerInfo.workerIndex ?? 0` (with safe access for older typings).
  - Derive deterministic `project_id`/`source_id` from that numeric worker id (e.g. `...174000`, `...174001`, `...174002`).
  - Optional debug file name uses the actual worker id: `e2e-seed-worker-${workerId}.json`.
  - No use of `process.env.TEST_PARALLEL_INDEX` or any env var for worker index.
- **global-setup.ts** — No change; no per-worker seeding; only backend health + E2E synthesis validation.
- **synthesis-flow.spec.ts** — No change; uses `{ page, seed }` only; stable selector `last-output-button` kept.

## How to Verify

```bash
cd apps/web
npx playwright test synthesis-flow.spec.ts --workers=3
```

**Expected:** All workers pass; each worker seeds a unique project via workerInfo; no “missing seed file” errors; optional debug files `e2e-seed-worker-0.json`, `e2e-seed-worker-1.json`, `e2e-seed-worker-2.json` may exist; tests do not depend on them.

## Notes / Follow-ups

- `WorkerInfo` is passed only to worker-scoped fixtures (third argument). Test-scoped fixtures receive `TestInfo`.
- Prefer `parallelIndex` for stable identity across worker restarts; `workerIndex` is unique per process.

---
**Tags:** #docs #e2e #testing #FEB2026
**Related:** [[_index]], [[testing/e2e/CI_E2E_PARALLEL_FIX_FEB2026]]
