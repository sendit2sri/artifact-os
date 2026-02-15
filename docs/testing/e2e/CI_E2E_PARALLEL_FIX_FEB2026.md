# CI E2E Parallel Fix

## Context

Playwright synthesis E2E tests run with `--workers=3` for speed. Each worker needs its own seeded project to avoid collisions. The previous setup relied on globalSetup writing per-worker seed files, but globalSetup runs once per run (not per worker), so only `e2e-seed-worker-0.json` existed and workers 1/2 failed. This fix makes seeding worker-scoped and deterministic so all workers pass in CI.

## Problem

- **Symptom:** `npx playwright test synthesis-flow.spec.ts --workers=3` fails for workers 1 and 2.
- **Error:** `Seed data file not found: ... e2e-seed-worker-1.json` / `e2e-seed-worker-2.json`.
- **Where:** Only `test-results/e2e-seed-worker-0.json` exists; workers 1 and 2 expect their own files.

## Root Cause

globalSetup runs once per run (not per worker). Any per-worker file writing in globalSetup only executes in a single process, so only worker-0’s file was created. Tests or fixtures that read seed by worker index then failed for workers 1 and 2. Relying on `TEST_PARALLEL_INDEX` in globalSetup is invalid; that env is set per worker process, not in the globalSetup process.

## Fix

- **global-setup.ts** — No code change. It already runs once, does not write per-worker files, and only validates backend health + E2E mode (one seed call to get a project_id for the synthesis check).
- **apps/web/tests/e2e/fixtures/seed.ts** — Worker-scoped seed fixture:
  - Read worker index **inside** the fixture: `const workerIndex = process.env.TEST_PARALLEL_INDEX ?? '0'` (so each worker process gets its own value).
  - Deterministic IDs: `deterministicIds(workerIndex)` returns `project_id` and `source_id` (e.g. `...174000`, `...174001`, `...174002`).
  - `POST /api/v1/test/seed` with `{ project_id, source_id, facts_count: 3, reset: true }`.
  - `scope: 'worker'` so the fixture runs once per worker.
  - Optional debug write to `test-results/e2e-seed-worker-${workerIndex}.json`; tests do not depend on it.
  - Export `test` (with `seed` fixture) and `expect` from `@playwright/test`.
- **apps/web/tests/e2e/synthesis-flow.spec.ts** — One stability change: Last Output check uses `page.getByTestId('last-output-button')` instead of text matching. No file-based seed reading; spec only uses `{ page, seed }`.

No `Promise.race`, no arbitrary sleeps; deterministic IDs per worker; tests do not depend on seed files existing on disk.

## How to Verify

**Backend env (required):**

```bash
export ARTIFACT_E2E_MODE=true
export ARTIFACT_ENABLE_TEST_SEED=true
```

**Local (backend already up):**

```bash
cd apps/web
npx playwright test synthesis-flow.spec.ts --workers=3
```

**Expected:** All 3 tests pass. Each worker has its own `project_id` from the fixture. Optional debug files `e2e-seed-worker-0.json`, `e2e-seed-worker-1.json`, `e2e-seed-worker-2.json` may appear under `test-results/`; tests do not read them.

## Notes / Follow-ups

- Debug JSON files are for visibility only; CI must not rely on them.
- If adding more E2E specs that need a project, use the same `seed` fixture and `seed.project_id`.

---
**Tags:** #docs #e2e #testing #FEB2026
**Related:** [[_index]], [[E2E_SEED_AND_FIXTURE]]
