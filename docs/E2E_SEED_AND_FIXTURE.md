# E2E Seed & Worker Fixture

Short summary of how Playwright E2E seeding and parallel safety work.

## Problem

- **globalSetup runs once per run**, not per worker. Using `TEST_PARALLEL_INDEX` in global-setup only produced `e2e-seed-worker-0.json`; workers 1 and 2 had no seed file → failures with `--workers=3`.

## Solution

1. **global-setup.ts** – Run once; no per-worker logic.
   - Backend health (`/health`).
   - Verify seed endpoint (POST `/api/v1/test/seed` with `{ reset: true }`; 403 → clear error).
   - Validate E2E mode: use returned `project_id` from that seed call, then POST `/api/v1/projects/{project_id}/synthesize` and assert deterministic markers (E2E Synthesis / Sources: / Mode:).
   - No file writes from global-setup.

2. **fixtures/seed.ts** – Worker-scoped fixture (`scope: 'worker'`).
   - When a worker starts: POST `/api/v1/test/seed` with `{ reset: true }`, get `{ project_id, source_id, facts_count }`.
   - Optionally write `test-results/e2e-seed-worker-<workerIndex>.json`.
   - Expose `seed` fixture so tests use `seed.project_id` (and optionally `source_id`, `facts_count`).

3. **synthesis-flow.spec.ts** – Use fixture only.
   - Import `test` and `expect` from `./fixtures/seed`.
   - No hardcoded project IDs; no reading seed from disk. Use `seed.project_id` in `page.goto` and in route interception for the force_error test.

## Run

```bash
cd apps/web && npx playwright test synthesis-flow.spec.ts --workers=3
```

## Files

- `apps/web/tests/e2e/global-setup.ts` – One-time validation only.
- `apps/web/tests/e2e/fixtures/seed.ts` – Worker-scoped seed fixture.
- `apps/web/tests/e2e/synthesis-flow.spec.ts` – Uses `seed` fixture for all project IDs.
