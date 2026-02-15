# Synthesis History + Open Any Output

## Context

Users can previously open only the latest synthesis via "Last Output". This feature adds a **History** list so they can view past outputs for the current project and open any one. Works in normal and E2E mode; testable with Playwright via stable selectors.

## Problem

- No way to browse or reopen older synthesis outputs.
- "Last Output" was the only entry point to view a previous result.

## Solution

1. **Backend:** `GET /api/v1/projects/{project_id}/outputs?limit=20&offset=0` returns a list of **summary** items (id, title, created_at, source_count, fact_ids_count, preview ~160 chars, mode). Sorted by created_at desc. Validation: project_id, limit 1–100, offset ≥ 0; 404 if project not found. Existing Output model/table unchanged.
2. **Frontend:** Added `OutputSummary` type and `fetchProjectOutputsList(projectId, limit, offset)`. "Last Output" now uses the list (first item) and fetches full output on click via `fetchOutput(id)`. New **History** button opens a drawer (Sheet) listing outputs; each row shows title, date, sources count, facts count, preview; clicking a row opens OutputDrawer for that output.
3. **Stable selectors:** `history-button`, `outputs-list-drawer`, `outputs-list-item` (with `data-output-id`), `outputs-list-empty`.
4. **E2E:** New spec `outputs-history.spec.ts` — generate synthesis, open History, assert ≥1 output, open first item, assert OutputDrawer content. Parallel-safe (seed fixture); uses helpers and `expect().toPass()` style.

## Files Changed

- `apps/backend/app/api/projects.py` — list endpoint with limit/offset and summary response
- `apps/web/src/lib/api.ts` — `OutputSummary`, `fetchProjectOutputsList`, `fetchProjectOutputs` calls list
- `apps/web/src/app/project/[id]/page.tsx` — History button, History Sheet, Last Output fetches full output on click
- `apps/web/tests/e2e/outputs-history.spec.ts` — new E2E spec

## How to Verify

- **Backend:** `GET /api/v1/projects/{project_id}/outputs?limit=20&offset=0` returns JSON array of summary objects.
- **UI:** On project page, click History → drawer with list; click an item → OutputDrawer opens with that output.
- **E2E:** `cd apps/web && npx playwright test outputs-history.spec.ts` (with backend E2E mode and seed).

## Links

- [[_index]]
- [[testing/e2e/2026-02-08_outputs-history-e2e]]
- [[README]]
