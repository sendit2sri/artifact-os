# Outputs API + Seed Fixture Upgrade for Multi-Output

## Context

E2E seed previously created only facts and sources; outputs were created only via synthesis. The History UI and outputs-history E2E tests needed ≥2 outputs per project to validate the list and “open any output” flow deterministically, without requiring a synthesis call every time.

## Problem

- Seed fixture produced 0 outputs; History tests had to generate synthesis first.
- No deterministic way to validate multi-output History UI.
- Global-setup didn’t verify the outputs list API.

## Root Cause

The test seed endpoint (`POST /api/v1/test/seed`) lacked support for creating Output rows. Outputs were only created by the synthesis flow (LLM or E2E synthesis).

## Fix

- **apps/backend/app/api/test_helpers.py**
  - Added `outputs_count: Optional[int] = 0` to `SeedRequest`.
  - When `outputs_count > 0`, create N deterministic `Output` rows with:
    - Title: `E2E Output #k`
    - Content: `E2E Output #k\n\nSources: 1 | Mode: paragraph`
    - `source_count=1`, `mode="paragraph"`, `fact_ids=[]`.
  - Response includes `outputs_count` when outputs were created (backwards compatible).

- **apps/web/tests/e2e/fixtures/seed.ts**
  - Seed request includes `outputs_count: 2`.
  - `SeedFixture` extended with `outputs_count?: number`.

- **apps/web/tests/e2e/global-setup.ts**
  - Seed request includes `outputs_count: 2`.
  - Smoke assertion: `GET /api/v1/projects/{project_id}/outputs` returns ≥2 items; throws if not.

## How to Verify

```bash
# Seed with outputs
curl -s -X POST http://localhost:8000/api/v1/test/seed \
  -H "Content-Type: application/json" \
  -d '{"reset":true,"outputs_count":2}' | jq
# Expect: outputs_count: 2 in response

# List outputs (use project_id from above)
curl -s "http://localhost:8000/api/v1/projects/PROJECT_ID/outputs?limit=20" | jq
# Expect: 2 items with titles "E2E Output #1", "E2E Output #2"

# Run E2E tests
cd apps/web && PLAYWRIGHT_SKIP_WEBSERVER=1 ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true \
  npx playwright test synthesis-flow.spec.ts outputs-history.spec.ts --workers=3
# Expect: "Outputs API OK (2 seeded)" in global-setup; all tests pass.
```

## Notes / Follow-ups

- No DB schema changes; uses existing `Output` model.
- No new dependencies.
- History UI now shows seeded outputs before any synthesis.

---
**Tags:** #docs #e2e #testing #feb2026
**Related:** [[docs/_index]] [[testing/e2e/2026-02-08_outputs-history-e2e]] [[features/FEATURE_SYNTHESIS_HISTORY]]
