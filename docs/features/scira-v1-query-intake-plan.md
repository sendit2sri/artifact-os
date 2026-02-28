# Scira V1: Query-based intake plan

## Summary

Query-based intake: user submits a search query → backend web-searches 3–5 URLs → enqueues each into the existing ingest pipeline (dedup by URL, feature-flagged, rate-limited). No multi-step agent, no summarization in search, no citation verification.

## Context

- **Existing:** `POST /api/v1/ingest` (URL), `POST /api/v1/ingest/file` (upload). Jobs are `url_ingest` / `file_ingest`; worker `ingest_url_task` uses `detect_source_type`, `normalize_url`, dedup by `SourceDoc.canonical_url` and `Job.idempotency_key`.
- **Goal:** New path: query → search provider → top N URLs → one ingest job per URL (reuse current flow).
- **Constraints:** Feature flag off by default; per-project rate limit; max URLs cap; optional domain allowlist; tests must not call live search APIs.

---

## 1) Endpoint contract

**Endpoint:** `POST /api/v1/projects/{project_id}/ingest/query`

**Path params:** `project_id` (UUID).

**Request body:**
```json
{
  "workspace_id": "<uuid>",
  "query": "string, 1–500 chars",
  "max_urls": 5
}
```
- `max_urls`: optional; default 5; clamped to 1–5 server-side.

**Success (200):**
```json
{
  "query": "<echo>",
  "urls_found": 4,
  "urls_enqueued": 3,
  "urls_skipped_duplicate": 1,
  "job_ids": ["<uuid>", "<uuid>", "<uuid>"],
  "jobs": [
    { "id": "<uuid>", "status": "PENDING", "params": { "url": "...", "source_type": "WEB" }, ... }
  ]
}
```
- `jobs`: same shape as existing ingest response (for UI to show in job list).
- If all URLs are duplicates: still 200, `urls_enqueued: 0`, `job_ids: []`, `jobs: []` (or include duplicate job summaries if we want to mirror single-URL “already added” behaviour; recommend minimal: just counts).

**Errors:**
- **400** — Invalid body (missing `query`/`workspace_id`, query too long, `max_urls` out of range).
- **403** — Feature disabled (`SCIRA_QUERY_INGEST_ENABLED=false` or unset).
- **404** — Project not found.
- **429** — Per-project rate limit exceeded (retry-after or message).
- **502 / 503** — Search provider unavailable (with safe message; no leaking of provider keys).

**User-facing messages (stable):**
- Feature disabled: “Query search is not enabled.”
- Rate limited: “Too many searches. Try again in a few minutes.”
- Search failed: “Search is temporarily unavailable. Try again later.”
- Partial success: “Added 3 of 4 sources; 1 was already in the project.”

---

## 2) Backend flow diagram (search → enqueue)

```
POST /projects/{id}/ingest/query
         │
         ▼
┌────────────────────────────┐
│ 1. Feature flag check      │  → 403 if SCIRA_QUERY_INGEST_ENABLED != true
│ 2. Resolve project         │  → 404 if not found
│ 3. Rate limit check        │  → 429 if over limit
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 4. SearchProvider.search   │  → get N raw results (e.g. 5–10)
│    (query, limit)          │  → 502/503 on provider failure
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 5. Pick top N URLs         │  N = min(request.max_urls, 5)
│    (simple order; optional │  Optional: filter by allowlist domain
│     domain allowlist)      │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 6. For each URL (dedup):   │
│    - normalize_url(WEB)    │
│    - existing SourceDoc?  │  → skip, count urls_skipped_duplicate
│    - existing Job same    │
│      idempotency_key?      │  → skip
│    - Create Job +          │
│      send_task("ingest_url"│
│        args=[job.id, url]) │
└────────────────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 7. Record rate-limit usage │  (e.g. update last_used or counter)
│ 8. Return 200 + summary    │
└────────────────────────────┘
```

**Decision: one job per URL.** Reuse existing `ingest_url` task and idempotency/dedup in `apps/backend/app/api/ingest.py`. No new “batch” job type; orchestrator only creates multiple `url_ingest` jobs and returns their ids.

---

## 3) Provider interface + mock plan

**Interface (e.g. `app/search/provider.py`):**

```python
from typing import Protocol

class SearchResult:
    url: str
    title: str | None = None
    snippet: str | None = None

class SearchProvider(Protocol):
    def search(self, query: str, limit: int = 5) -> list[SearchResult]:
        ...
```

**Production:** One implementation (e.g. `TavilySearchProvider`) using env: `TAVILY_API_KEY`, optional `TAVILY_BASE_URL`. Call Tavily search API; map response to `SearchResult(url=..., title=..., snippet=...)`. No ranking beyond “return first N” (or provider’s default order).

**Recommendation:** Start with **Tavily** (simple API, good for dev); keep interface so we can add SerpAPI/Bing/Brave later via env (e.g. `SCIRA_SEARCH_PROVIDER=tavily|serpapi`).

**Test mock:** `MockSearchProvider` in `tests/fixtures/search.py` (or `app/search/mock.py` used only in tests):
- `search(query: str, limit: int) -> list[SearchResult]` returns fixed list of URLs (e.g. from a constant or a small JSON fixture).
- No network; same list every time for deterministic tests.

**Dependency injection:** Orchestrator receives `SearchProvider`; in `main` or router dependency: if `TESTING` or env `SCIRA_USE_MOCK_SEARCH=true`, use mock; else use Tavily (or configured provider). Tests override dependency to `MockSearchProvider`.

---

## 4) Rate limit + cost cap

**Rate limit (per project):**
- **Approach (recommended for V1):** In-DB: store last use timestamp (and optionally count) per project.
  - Option A: New table `scira_usage(project_id, last_used_at, count_in_window)` with a simple rule, e.g. “max 10 requests per project per hour” (window = 1 hour, count reset or sliding).
  - Option B: Simpler — single column on `projects` or a small key-value table: `last_scira_used_at`; rule “at most 1 request per project per 5 minutes”. Easiest; no migration for “count” if we only need throttle.
- **Recommendation:** Start with Option B (one timestamp per project, e.g. 5-minute cooldown). Migration: add `scira_last_query_at` (nullable) to `projects` or add a tiny `scira_rate_limit` table. If we need “N per hour”, add count + window in a second iteration.
- **Redis:** Out of scope for V1; document as future option if we need cross-instance or stricter limits.

**Cost cap:** No explicit “cost” in code for V1. Mitigations: feature flag, rate limit, and `max_urls` cap (5). Optional: document “Tavily free tier X calls/day” in runbook; no code enforcement in first slice.

**Allowlist (optional):** If `SCIRA_ALLOWED_DOMAINS` env is set (e.g. `example.com,wikipedia.org`), filter `SearchResult` URLs to those domains before dedup/enqueue; otherwise allow all.

---

## 5) Test plan

- **Unit tests (pytest):**
  - **Orchestrator:** With `MockSearchProvider` and DB session:
    - Success: query → N URLs returned → N jobs created, `ingest_url` task sent N times (use `celery_app.send_task` mock or assert task name/args).
    - Dedup: mock returns same URL twice + one new URL → only one new job.
    - All duplicates: 200, `urls_enqueued=0`, `job_ids=[]`.
    - Feature flag off → 403.
    - Rate limit exceeded → 429.
    - Invalid request (missing query, max_urls > 5) → 400.
    - Project not found → 404.
  - **SearchProvider:** `MockSearchProvider.search` returns expected list; no network.
- **Integration-style (optional):** One test that calls `POST /projects/{id}/ingest/query` with mock provider injected; assert response shape and that jobs exist in DB (no real Celery run).
- **No live web/search calls in CI.** All search tests use `MockSearchProvider` or dependency override.

---

## 6) Minimal UI plan (or explicitly backend-only)

**V1 scope:** Backend-only is acceptable. If time/budget allows, minimal UI:

- **Place:** Same “Add source” entry point: add a third mode **“Query”** beside “URL” and “Upload” (in `AddSourceSheet`).
- **Behaviour:** Query mode shows a text input for “Search query” and a “Search and add sources” button. On submit: call `POST /api/v1/projects/{id}/ingest/query` with `query` and `workspace_id`; show toast “Searching…”, then “Added 3 sources” or error (using messages from §1). Invalidate project jobs query so existing job list/timeline shows the new jobs.
- **Feature visibility:** Show “Query” tab only when a backend capability flag is true (e.g. `GET /api/v1/projects/{id}/ingest-rules` or a small `GET /api/v1/config` returning `query_ingest_enabled`). If no such endpoint exists, derive from 403 on first use and hide tab after, or skip UI until backend exposes a flag.

**If diff budget exceeded (>450 LOC or >12 files):** Implement backend-only (endpoint + provider + rate limit + tests); document “Query intake UI” as a follow-up and do not add `AddSourceSheet` changes in this slice.

---

## Files to touch (estimate)

| Area | Files |
|------|--------|
| API | `apps/backend/app/api/ingest.py` (add route under projects prefix or new router mounted under `/api/v1/projects/{id}`) |
| Router | Either add to `ingest.py` with path prefix from main, or add to `projects.py` as `POST projects/{id}/ingest/query` |
| Search | `app/search/provider.py` (interface + Tavily), `app/search/__init__.py` |
| Orchestrator | `app/services/scira_orchestrator.py` or `app/api/ingest.py` inline (search → dedup → enqueue) |
| Rate limit | `app/services/scira_ratelimit.py` or inline; optional migration for `projects.scira_last_query_at` or `scira_usage` table |
| Config | Env only: `SCIRA_QUERY_INGEST_ENABLED`, `TAVILY_API_KEY`, optional `SCIRA_ALLOWED_DOMAINS`, `SCIRA_USE_MOCK_SEARCH` (tests) |
| Tests | `tests/test_scira_ingest.py` (or `test_ingest_query.py`), `tests/fixtures/search.py` (MockSearchProvider) |
| UI (optional) | `AddSourceSheet.tsx`, `api.ts` (`ingestQuery`), project page (invoke mutation), optional capability check |

**Total:** ~8–10 backend files, +2–3 frontend if UI included. Keep under 12 files and 450 LOC by making orchestrator thin and reusing existing ingest logic.

---

## Rollout

- **Flag:** `SCIRA_QUERY_INGEST_ENABLED` (default `false`). Only when `true` is the new endpoint active.
- **Docs:** Add to `.env.example`: `SCIRA_QUERY_INGEST_ENABLED=`, `TAVILY_API_KEY=`, optional `SCIRA_ALLOWED_DOMAINS=`, `SCIRA_USE_MOCK_SEARCH=` (for local testing).

---

## Links

- [[architecture/]] — Backend structure
- [[routing/]] — API routing
- Ingest API: `apps/backend/app/api/ingest.py`
- Ingest worker: `apps/backend/app/workers/ingest_task.py`
