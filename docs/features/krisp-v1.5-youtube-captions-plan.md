# Krisp V1.5: YouTube Captions-Only Ingestion — Plan

## Summary

Implement YouTube URL ingestion via **captions-only** transcript fetching (no audio download), pipe transcript through existing extraction, and surface a **typed error + minimal UX fallback** when captions are unavailable.

## Context

- **Current state:** The backend already detects YouTube URLs (`detect_source_type`), normalizes them, and in the worker calls `extract(url, SourceType.YOUTUBE)` → `extract_youtube(url)` which uses `youtube-transcript-api` (captions-only). If transcript is empty, the worker sets the job to FAILED with `TRANSCRIPT_DISABLED` and message "Captions not available — upload audio file". The web app already shows failed jobs and `error_code` / `error_message` in ProcessingTimeline and SourceTracker.
- **Gaps:** (1) Standardize error code to `CAPTIONS_UNAVAILABLE` for this case and ensure it is never a generic 500. (2) Add CI-safe unit tests for the ingest worker YouTube path (fixtures/mocks, no network). (3) Minimal UI: show a clear “upload audio” fallback when `CAPTIONS_UNAVAILABLE`.

---

## 1) Backend flow changes + where YouTube handling plugs in

- **API (`apps/backend/app/api/ingest.py`):** No change. Already:
  - Accepts `IngestURLRequest(project_id, workspace_id, url)`.
  - Uses `detect_source_type(url)` → YOUTUBE for youtube.com/youtu.be.
  - Normalizes URL, dedupes by canonical_url, creates Job, queues `ingest_url` task. No synchronous YouTube call; no 500 for “captions unavailable” — that outcome is async (job ends in FAILED with typed `result_summary`).

- **Worker (`apps/backend/app/workers/ingest_task.py`):**
  - **YouTube branch (existing):** After `extract(url, source_type)` for `SourceType.YOUTUBE`, `extracted` has `title`, `transcript` (list of segments), `video_url`. If `not transcript`:
    - **Change:** Call `_set_job_failed(job, "CAPTIONS_UNAVAILABLE", "Captions not available — upload audio file", {...})` instead of `TRANSCRIPT_DISABLED`. Keep same `result_summary` shape (`source_title`, `source_type`).
  - **Exception path:** In the broad `except` that handles failures, when setting `error_code` from `str(e)`, if the exception message indicates captions/transcript unavailable (e.g. "transcript" / "disabled" / "not available"), set `error_code = "CAPTIONS_UNAVAILABLE"` so a YouTube transcript failure never surfaces as a generic UNSUPPORTED/500 to the user.
  - **ERROR_CODES:** Add `"CAPTIONS_UNAVAILABLE"` to the tuple (and keep TRANSCRIPT_DISABLED for backward compatibility if needed; prefer one canonical code for “no captions” = CAPTIONS_UNAVAILABLE).

- **Extractors:** No change. `app/extractors/youtube.py` already:
  - Fetches captions only (`YouTubeTranscriptApi.get_transcript(video_id)`), no audio download.
  - Returns `{ title, channel, transcript[], video_url }`; empty transcript when captions disabled/unavailable.
  - `extract(url, source_type)` in `app/extractors/__init__.py` already delegates to `extract_youtube(url)` for YOUTUBE.

**Flow summary:** URL → API creates Job → Celery `ingest_url` → `detect_source_type` (from job params) → for YOUTUBE, `extract(url, YOUTUBE)` → `extract_youtube(url)` → transcript segments → if empty → `_set_job_failed(CAPTIONS_UNAVAILABLE, ...)`; else build `text_content` from segments, persist SourceDoc, run `extract_facts_from_markdown`, save facts, complete job.

---

## 2) Error contract for captions unavailable

- **Code:** `CAPTIONS_UNAVAILABLE`.
- **Where:** `job.result_summary.error_code` and `job.result_summary.error_message` when `job.status === "FAILED"`.
- **Message:** `"Captions not available — upload audio file"` (or equivalent; keep short and actionable).
- **When:** (1) Worker explicitly: YOUTUBE and `extract()` returns empty `transcript`. (2) Worker exception path: exception from YouTube/transcript path mapped to `CAPTIONS_UNAVAILABLE` so client never sees a generic 500 for this case.
- **API:** No new HTTP status or endpoint. Client polls job; on `status: "FAILED"` and `result_summary.error_code === "CAPTIONS_UNAVAILABLE"`, UI shows the fallback (see below).

---

## 3) Test plan (fixtures-based)

- **Extractor tests (existing):** `tests/test_extractors_youtube.py` already uses `tests.fixtures.youtube` (`load_fixture`, `segments_for_fetcher`) and a mock `transcript_fetcher`; no network. Keep as-is; ensure fixture IDs match: with captions `6MBq1paspVU`, without `HpMPhOtT3Ow`.

- **Worker tests (new):** Add CI-safe unit tests for the ingest worker YouTube path.
  - **Location:** e.g. `tests/test_ingest_task_youtube.py` or a dedicated section in an existing ingest worker test file if present.
  - **Approach:** Patch `extract` (or `app.extractors.youtube.extract_youtube`) so it returns fixture-driven data:
    - **With captions:** Patch so `extract(url, YOUTUBE)` returns a dict with `title`, `transcript` (list of segments, e.g. from `segments_for_fetcher(load_fixture("6MBq1paspVU"))` converted to worker-expected shape `[{start_s, end_s, text}]`), `video_url`. Assert: job completes successfully, SourceDoc created, facts extracted (or at least one fact), `result_summary.source_type === "YOUTUBE"`.
    - **Without captions:** Patch so `extract(url, YOUTUBE)` returns `transcript: []` (and optionally `title`, `video_url`). Assert: job status FAILED, `result_summary.error_code === "CAPTIONS_UNAVAILABLE"`, `result_summary.error_message` contains “upload audio” or equivalent.
  - **No network:** All external calls (YouTube API, oEmbed, etc.) must be mocked/patched; use only in-memory fixture data.

- **Fixtures:** Use existing `tests/fixtures/youtube/6MBq1paspVU.json` and `HpMPhOtT3Ow.json`. Helper can convert fixture segments to the format the worker expects (`start_s`, `end_s`, `text`) if not already identical.

---

## 4) Minimal UI change plan

- **ProcessingTimeline (`apps/web/src/components/ProcessingTimeline.tsx`):**
  - In `errorCodeLabel`, add `CAPTIONS_UNAVAILABLE: "Captions not available"` (and keep `TRANSCRIPT_DISABLED` if still used elsewhere).
  - When `job.result_summary?.error_code === "CAPTIONS_UNAVAILABLE"` (or `TRANSCRIPT_DISABLED`), show a short fallback line below the error message, e.g. **“Upload the audio file to add this source.”** (or a link to the file upload area if there is a clear target). Prefer a single line to stay within “minimal” scope.

- **SourceTracker:** Already shows `job.result_summary?.error_message` on failed jobs (tooltip/title). No change required unless we want the same one-line fallback in the tracker; optional.

- **api.ts:** Ensure `Job.result_summary` type includes `error_code` and `error_message` (already present). No API contract change.

- **Intake page:** No new modal or separate “captions unavailable” page; the failed job row in ProcessingTimeline (and optionally in SourceTracker) is the place for the message and “upload audio” fallback.

---

## How to run / verify

- **Backend tests (CI-safe):**  
  `cd apps/backend && PYTHONPATH=. pytest tests/test_extractors_youtube.py tests/test_ingest_task_youtube.py -q`  
  (or the chosen test module name)
- **Web typecheck:**  
  `cd apps/web && npm run typecheck`
- **Manual smoke (out of scope for CI):**  
  - With captions: `https://www.youtube.com/watch?v=6MBq1paspVU` → transcript stored, facts extracted.  
  - Without captions: `https://www.youtube.com/watch?v=HpMPhOtT3Ow` → job FAILED, `CAPTIONS_UNAVAILABLE`, UI shows “upload audio” fallback.

---

## Files touched (estimate)

| Area        | File(s) |
|------------|---------|
| Backend    | `app/workers/ingest_task.py` (error code + exception mapping) |
| Backend    | `tests/test_ingest_task_youtube.py` (new) or extend existing ingest test |
| Web        | `apps/web/src/components/ProcessingTimeline.tsx` (error label + fallback line) |
| Docs       | `docs/features/krisp-v1.5-youtube-captions-plan.md` (this file) |

Total: ~4 files; well under 300 LOC and 8 files. No change to API ingest.py, extractors, or models unless we add a constant for the error code in a shared place (optional).

---

## Links

- [[docs/_index]]
- Existing YouTube extractor: `apps/backend/app/extractors/youtube.py`
- Existing YouTube fixtures: `apps/backend/tests/fixtures/youtube/`
- Ingest API: `apps/backend/app/api/ingest.py`
- Ingest worker: `apps/backend/app/workers/ingest_task.py`
