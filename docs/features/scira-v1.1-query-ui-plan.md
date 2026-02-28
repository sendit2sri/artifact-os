# Scira V1.1: Query intake UI — implementation plan

## Summary

Add a **Query** intake mode on the project page that calls the existing `POST /projects/{project_id}/ingest/query` endpoint, shows loading/success/partial/error states, and is hidden unless the feature is enabled or the backend returns an explicit 403 with a helpful message. No new backend or search-provider work.

## Context

- **Backend (done):** `POST /api/v1/projects/{project_id}/ingest/query` — feature-flagged (`SCIRA_QUERY_INGEST_ENABLED`), rate-limited, returns `query`, `urls_found`, `urls_enqueued`, `urls_skipped_duplicate`, `job_ids`, `jobs`.
- **Existing UI:** Project page has URL + Upload modes in two places: (1) inline intake bar (sm+ breakpoint) with tabs and (2) `AddSourceSheet` (bottom sheet) with same two modes. Both use `inputType: "url" | "file"` and mutations `ingestMutation` / `uploadMutation`.
- **Ref:** [[features/scira-v1-query-intake-plan]] (backend contract); `apps/backend/app/api/ingest.py` (endpoint); `apps/backend/app/services/scira.py` (`run_query_ingest` return shape).

---

## 1) UI placement and states

### Placement

- **AddSourceSheet:** Add a third tab **Query** next to URL and Upload. Type union: `inputType: "url" | "file" | "query"`.
- **Project page inline bar (sm+):** Add **Query** tab next to URL/Upload; when Query is selected, show a single text input (search query) and a “Search and add sources” (or “Query”) button.
- **Feature visibility:** Query tab is shown only when:
  - **Option A (recommended):** Frontend env `NEXT_PUBLIC_SCIRA_QUERY_INGEST_ENABLED=true`. When unset/false, do not render the Query tab at all.
  - **Option B:** No env; always show Query tab. On first 403 from the query endpoint, show toast “Query search is not enabled.” and optionally set session/local state to hide the Query tab for the rest of the session.

Use Option A if you want to avoid users seeing a tab that will always 403; use Option B if you want zero config and are okay with one failed attempt.

### States

| State      | UI behavior |
|-----------|-------------|
| **Idle**  | Query input + “Search and add sources” button (disabled when query empty or too long). |
| **Loading** | Button shows spinner; optional short toast “Searching…” (or “Adding sources…”). |
| **Success** | Toast: “Added N sources.” Invalidate `project-jobs` / `project-facts` / `project-sources`; optionally show a small success block with list of added URLs + link to Active Sources. |
| **Partial** | Toast: “Added N, skipped M (already in project).” Same invalidation; show list of added URLs + note that M were skipped; link to Active Sources. |
| **Error 403** | Toast (or inline message): “Query search is not enabled.” Optionally hide Query tab for session (if Option B). |
| **Error 429** | Toast: “Too many searches. Try again in a few minutes.” |
| **Error 400** | Toast or inline: show backend `detail` (e.g. “query is required”, “query must be at most 500 characters”). |
| **Error 503** | Toast: “Search is temporarily unavailable. Try again later.” (or backend message). |

### UX details

- **List of added URLs:** From `response.jobs[].params.url` (and optionally `params.canonical_url`). Render as a simple list (e.g. bullet or compact list); truncate long URLs with title tooltip.
- **Link to Active Sources:** Text link or button that opens the Sources drawer/area (e.g. same as “Active Sources” — `setSourcesDrawerOpen(true)` or equivalent on the project page).

---

## 2) API contract usage (request / response)

### Request

- **Endpoint:** `POST /api/v1/projects/{project_id}/ingest/query`
- **Body:**
  - `workspace_id: string` (UUID)
  - `query: string` (1–500 chars, required)
  - `max_urls?: number` (optional; default 5; backend clamps to 1–5)

### Response (200)

```ts
{
  query: string;
  urls_found: number;
  urls_enqueued: number;
  urls_skipped_duplicate: number;
  job_ids: string[];
  jobs: Array<{
    id: string;
    status: string;
    params: { url: string; source_type?: string; canonical_url?: string };
    [k: string]: unknown;
  }>;
}
```

- **Success (all new):** `urls_enqueued === urls_found`, `urls_skipped_duplicate === 0`.
- **Partial:** `urls_skipped_duplicate > 0`; message: “Added N, skipped M (already ingested).”
- **All duplicates:** `urls_enqueued === 0`; message: “All M sources were already in the project.” (or “Added 0 sources; N were already in the project.”)

### Add to `api.ts`

- `ingestQuery(projectId: string, workspaceId: string, payload: { query: string; max_urls?: number }): Promise<QueryIngestResponse>`.
- Define `QueryIngestResponse` (or inline type) matching the 200 shape above; handle non-OK by status and throw with a message derived from `detail` or a stable user-facing string for 403/429/400/503.

---

## 3) Error handling mapping

| Status | Backend behavior | UI action |
|--------|------------------|-----------|
| **403** | Feature disabled (`SCIRA_QUERY_INGEST_ENABLED` not true). Body: `detail: "Query search is not enabled."` | Toast (and optionally hide Query tab for session if no env flag). |
| **429** | Rate limit. Body: `detail: "Too many searches. Try again in a few minutes."` | Toast with that message. |
| **400** | Invalid `project_id`/`workspace_id`, missing/empty query, query length > 500, etc. Body: `detail: string` | Toast or inline error with `detail`. |
| **404** | Project not found | Toast: “Project not found.” |
| **502/503** | Search provider error. Body: e.g. “Search is temporarily unavailable. Try again later.” | Toast with that (or generic) message. |

In `ingestQuery`, after `fetch`, if `!res.ok`, read `res.json().catch(() => ({}))`, then throw `new Error(detail ?? defaultMessage)` so the mutation `onError` receives a single message for toasts.

---

## 4) Optional test plan

- **Unit (frontend):**
  - `ingestQuery` builds the correct URL and body; on 200 returns typed response; on 403/429/400 parses `detail` and throws.
- **Component / integration:**
  - With feature flag on: Query tab visible; submit with valid query → loading → success toast and invalidation; submit with empty query → button disabled or 400 handled.
  - With feature flag off (Option A): Query tab not rendered.
- **E2E (no network dependency):**
  - Mock `POST .../ingest/query` to return 200 with `urls_enqueued: 2`, `jobs: [{ params: { url: "https://example.com/1" } }, ...]`; assert toast “Added 2 sources.” and that jobs/sources lists update (or assert invalidation). Alternatively use seed env + mock search backend so real endpoint returns deterministic data without hitting live search.

---

## Files to touch (estimate)

| Area | File | Change |
|------|------|--------|
| API | `apps/web/src/lib/api.ts` | Add `QueryIngestResponse` type and `ingestQuery(projectId, workspaceId, { query, max_urls })`; map 403/429/400/503 to thrown message. |
| Sheet | `apps/web/src/components/AddSourceSheet.tsx` | Add `"query"` to type; add Query tab and query input + “Search and add sources” button; optional props for query state and query mutation (or keep state in page and pass callbacks). |
| Project page | `apps/web/src/app/project/[id]/page.tsx` | Add `queryInputType` or extend `inputType` to `"url" \| "file" \| "query"`; add `queryInput`, `setQueryInput`, `queryIngestMutation`; wire Query tab in inline bar and in AddSourceSheet; show added-URLs list + link to Sources drawer on success/partial; gate Query tab by `NEXT_PUBLIC_SCIRA_QUERY_INGEST_ENABLED` (or 403-fallback). |
| Config | `.env.example` | Add `NEXT_PUBLIC_SCIRA_QUERY_INGEST_ENABLED=` (optional, for frontend gating). |

Optional: small success/partial result block component (or inline in page) to show “Added: url1, url2, …” and “View in Active Sources” link.

---

## Commands to run

- `cd apps/web && npm run lint`
- `cd apps/web && npm run typecheck`

---

## Links

- [[features/scira-v1-query-intake-plan]] — Backend contract and flow
- [[architecture/]] — View state, phases
- `apps/backend/app/api/ingest.py` — Endpoint
- `apps/backend/app/services/scira.py` — `run_query_ingest` return shape
