# Krisp V1.5: YouTube Captions-Only Ingest — Plan

## Summary

Implement YouTube URL ingestion using **captions/transcript only** (no audio download). When captions are unavailable, show a clear fallback message and do not enqueue a broken job. The codebase already implements captions-only flow; this plan aligns copy, confirms behavior, and adds minimal tests.

## Context

- **Current state:** Ingest API detects YouTube via `detect_source_type()`; worker calls `extract(url, SourceType.YOUTUBE)` → `extract_youtube()` which uses `youtube-transcript-api` (captions only, no API key, no audio). If transcript is empty, job is failed with `TRANSCRIPT_DISABLED` and a message; otherwise transcript is stored as source content and fed into the existing fact extraction pipeline.
- **Gap:** Fallback copy and UI label should match the product spec; tests for YouTube extractor and failure path are minimal.

## Proposed Backend Approach (Captions Only)

- **How captions are obtained:** Keep using `youtube-transcript-api` in `apps/backend/app/extractors/youtube.py`. It uses YouTube’s public timedtext/caption endpoints (no audio/video download, no yt-dlp). ToS-safe for reading captions that the video owner has made available.
- **No changes to ingestion path:** No new endpoints; no audio download. YouTube remains a branch inside the existing `ingest_url` Celery task: `extract_youtube(url)` → if `transcript` empty → fail job with clear message; else build `text_content` from segments → create/update `SourceDoc` → `extract_facts_from_markdown()` → create facts.

## Exact Endpoints Impacted

- **POST /ingest** — No contract change. Request/response unchanged. Behavior: YouTube URLs already go through same flow; only the **error_message** string for the TRANSCRIPT_DISABLED case is updated (see below).
- **POST /ingest/file** — Unchanged (used for upload-audio fallback).
- No new routes.

## Data Flow: Transcript → Extraction

1. User submits URL → `POST /ingest` → `detect_source_type(url)` → `YOUTUBE` → Job created, `ingest_url` task enqueued.
2. Worker: `extract(url, SourceType.YOUTUBE)` → `extract_youtube(url)`:
   - Gets `video_id` from URL; calls `YouTubeTranscriptApi.get_transcript(video_id)` (captions only).
   - Returns `{ title, channel, transcript: [{ start_s, end_s, text }], video_url }`.
3. If `transcript` is empty: `_set_job_failed(job, "TRANSCRIPT_DISABLED", "<fallback message>", ...)`; commit; return. **No SourceDoc created; job not “broken” in the queue.**
4. If transcript present: Build `text_content` as `## [start_s-end_s]\n{text}` per segment; set `content_formats["text_raw"]`; create/update `SourceDoc` (url, title, content_text, content_text_raw, metadata_json with video_url and transcript); then `extract_facts_from_markdown(text_content)` → persist facts; complete job.

## What Changed (Implementation Checklist)

| Item | File | Change |
|------|------|--------|
| Fallback message (worker) | `apps/backend/app/workers/ingest_task.py` | Set `error_message` for TRANSCRIPT_DISABLED to **"Captions not available — upload audio file"** (single place where real failed jobs get this message). |
| E2E seed message | `apps/backend/app/api/test_helpers.py` | For `transcript_disabled` mode, set `err_msg` to **"Captions not available — upload audio file"** so e2e sees same copy. |
| UI label (optional) | `apps/web/src/components/ProcessingTimeline.tsx` | In `errorCodeLabel`, map `TRANSCRIPT_DISABLED` to **"Captions not available"** so the short label matches the message. |
| Unit test | `apps/backend/tests/test_extractors_youtube.py` (new) | Test `extract_youtube`: (1) mock `YouTubeTranscriptApi.get_transcript` returning segments → assert transcript and title; (2) mock raising / returning empty → assert transcript empty, no exception. |

No changes to: `ingest.py` (API), `models.py`, `extractors/youtube.py` (logic), or frontend intake form beyond the optional label.

## Test Plan

**Strategy: CI does not hit YouTube live.** Use a small transcript fetcher interface (mockable); unit tests use fixtures; optional manual smoke with real URLs locally.

1. **Backend transcript fetcher interface (tiny):** A callable `(video_id: str) -> list[dict] | None`. Default implementation calls `youtube-transcript-api`; tests inject a mock that returns fixture data or `None` (CAPTIONS_UNAVAILABLE).
2. **Unit tests with fixtures:** "With captions" mock returns segment list; "without captions" mock returns `None`. No live network.
3. **Optional manual smoke:** Run locally with golden URLs when needed.

- **Backend unit:** `tests/test_extractors_youtube.py`: use fetcher mock; fixtures for with/without captions; assert transcript populated vs empty; canonical URL (no `?si=`). Run: `pytest apps/backend/tests/test_extractors_youtube.py -v`.
- **E2E:** Use existing `source-failure-modes.spec.ts`: seed includes YouTube `transcript_disabled`; assert timeline shows failed job with error code and message. After backend copy change, optionally assert message text contains “Captions not available” and “upload audio file”. Run: `ARTIFACT_ENABLE_TEST_SEED=true npx playwright test apps/web/tests/e2e/source-failure-modes.spec.ts`.

## Acceptance Criteria (deterministic)

- [x] YouTube URL with captions produces facts (existing behavior).
- [x] YouTube URL without captions produces a clear fallback message and does not create a SourceDoc or leave a broken job (existing behavior; copy updated).
- [x] No audio downloading is introduced (confirmed: only youtube-transcript-api).
- [ ] Unit test for YouTube extractor added; e2e (source-failure-modes) still passes.

**Test URLs (golden):**

- **Captions available:** https://www.youtube.com/watch?v=6MBq1paspVU  
  Expected: transcript fetched (captions-only), stored, facts extracted.
- **Captions unavailable:** https://www.youtube.com/watch?v=HpMPhOtT3Ow  
  Expected: no transcript fetched; UI returns a clear message: "Captions not available — upload audio file"; no broken ingestion job queued.

**URL normalization (reduce flakiness):** In code and tests, normalize to canonical form (drop `?si=...`): use `https://www.youtube.com/watch?v={video_id}` only.

## Commands to Run

```bash
# Backend unit (new test)
cd apps/backend && pytest tests/test_extractors_youtube.py -v

# E2E (existing)
ARTIFACT_ENABLE_TEST_SEED=true npx playwright test apps/web/tests/e2e/source-failure-modes.spec.ts
```

## Files Touched (Target)

| File | Action |
|------|--------|
| `apps/backend/app/workers/ingest_task.py` | Edit: 1 line (error_message string). |
| `apps/backend/app/api/test_helpers.py` | Edit: 1 line (err_msg for transcript_disabled). |
| `apps/web/src/components/ProcessingTimeline.tsx` | Edit: 1 line (TRANSCRIPT_DISABLED label). |
| `apps/backend/app/extractors/youtube.py` | Add `TranscriptFetcher` type + `_default_transcript_fetcher`; `extract_youtube(url, transcript_fetcher=None)` for mockable fetcher. |
| `apps/backend/tests/test_extractors_youtube.py` | New: unit tests with fixtures (with/without captions); URL normalization (no `?si=`). |

Total well under 300 LOC and 6 files. If scope grows (e.g. more extractor tests or docs), implement Slice 1.5a: copy + label + single unit test only; defer extra e2e assertions.

## Links

- [[_index]]
- Ingest API: `apps/backend/app/api/ingest.py`
- Ingest worker: `apps/backend/app/workers/ingest_task.py`
- YouTube extractor: `apps/backend/app/extractors/youtube.py`
- Processing timeline: `apps/web/src/components/ProcessingTimeline.tsx`
