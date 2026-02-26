# Krisp Intake & UX Slices Plan

## Summary

Thin vertical slice roadmap: Krisp intake (audio → transcription → facts) → Toolbar Consolidation → Graph View → Auto-ingest.

## Context

- **Current state:** URL ingest + file upload stub (PDF/txt/md; `file_ingest` worker not wired). YouTube transcript via `youtube-transcript-api`. Extractors: Web, Reddit, YouTube.
- **Reference:** ideafromreddit — Krisp transcription for research; TicNote mindmaps for graph view.
- **Architecture:** [[architecture/UX_POLISH_ROADMAP_FEB_2026]], [[architecture/TOOLBAR_POLICY]], [[architecture/cursor-agent-playbook]]

---

## Do Not Do (Legal / Constraints)

| Constraint | Reason |
|------------|--------|
| Do NOT scrape YouTube directly | Use official APIs (Data API, transcript API). Respect ToS. |
| Do NOT circumvent rate limits / robots.txt | Rate-limit ingestion; honor robots.txt for web sources |
| Do NOT ingest copyrighted audio without user attestation | User uploads = user responsibility. Surface clear ToS. |
| No Krisp API integration (brand-specific) | Use open transcription (Whisper, AssemblyAI, etc.). "Krisp intake" = UX concept (audio → transcript → facts). |

---

## Slice List

### V1: Krisp Intake (Audio Upload → Transcription → Facts)

**UX entry point:** AddSourceSheet "Upload" tab — add audio formats (`.mp3,.wav,.m4a,.webm,.ogg`); keep PDF/txt/md.

**Backend flow:**
1. `POST /ingest/file` accepts audio MIME types
2. Save to temp; create `file_ingest` job
3. Celery `ingest_file_task`: transcribe audio → produce transcript segments
4. Feed transcript into existing `extract_facts_from_markdown` path (same as YouTube)

**Data persistence:** `SourceDoc` with `source_type=SourceType.AUDIO`, `metadata_json.transcript`, `content_text_raw` = full transcript.

**Acceptance criteria:**
- Upload audio file → job queued → transcript stored → facts extracted
- Source badge "Audio" in sidebar; fact context chip "Transcript" (optional timestamp)

**Test strategy:**
- Unit: transcription service mock → segment → markdown → fact extraction
- E2E: seed audio stub (or deterministic fixture) → assert facts count, source type badge
- Idle contract: wait for job COMPLETED before assertions

**Risks:** Transcription cost (Whisper/API); large file handling. Mitigate: file size cap, rate limit.

---

### V2: Toolbar Consolidation

**UX entry point:** Project page top toolbar.

**Backend flow:** None (UI-only slice).

**Acceptance criteria:**
- Toolbar contains only: Tabs (view mode), Search, Filters (opens sheet), Primary CTA (context-dependent)
- Sort, Group, Collapse toggles, Show suppressed, Selected only, Saved views → moved into Filters sheet
- All controls still functional; URL/localStorage prefs unchanged
- [[architecture/TOOLBAR_POLICY]] enforced

**Test strategy:**
- E2E: open filters sheet → change sort/group → assert facts reorder; visual regression optional
- Manual: PR review checklist (per TOOLBAR_POLICY)

**Risks:** Layout regression. Mitigate: existing E2E (view-state, sources-add-url) must pass.

---

### V3: Graph View

**UX entry point:** New tab in view mode: "Graph" alongside List/Grouped.

**Backend flow:**
- Reuse `fetchProjectFacts` + optional `fetchFactsGroup`; no new endpoints for V3
- Optional: lightweight relation API (fact↔fact, fact↔source) if needed for edges

**Data persistence:** No new tables. Graph = visualization of existing facts + sources; edges from similarity or section context.

**Acceptance criteria:**
- Graph tab visible; nodes = facts (or sources); edges from shared source or similarity
- Pan/zoom; click node → open evidence panel
- Works with existing filters (search, group) where applicable

**Test strategy:**
- E2E: switch to Graph tab → assert graph renders; click node → panel opens
- Unit: graph layout/serialization (if custom); prefer library (e.g. vis.js, react-force-graph)

**Risks:** Perf with many nodes. Mitigate: limit nodes (e.g. top 100), lazy load.

---

### V4: Auto-ingest

**UX entry point:** Project settings or empty-state: "Add watch folder" / "Add RSS feed" / "Scheduled ingest".

**Backend flow:**
- New job types: `folder_watch`, `rss_ingest`, `scheduled_url`
- Celery beat or polling: detect new items → create `url_ingest` or `file_ingest` jobs
- Persist config: workspace/project-level ingest rules (DB or config)

**Data persistence:** New table `IngestRule` (project_id, type, config_json, enabled) or equivalent.

**Acceptance criteria:**
- User adds folder path or RSS URL → rules stored
- Worker picks up new items (folder: new files; RSS: new entries) → creates ingest jobs
- ?ingest=URL (existing) unchanged; extended to support rule-based ingest

**Test strategy:**
- Unit: rule evaluation; job creation logic
- E2E: add rule → trigger (or mock trigger) → assert job created and facts appear
- Integration: folder watcher / RSS parser in isolation

**Risks:** File system access; RSS rate limits; security (path traversal). Mitigate: sandbox paths; validate URLs.

---

## Execution Order

1. **V1** — Krisp intake (unblocks audio research workflow)
2. **V2** — Toolbar (UX polish; low risk)
3. **V3** — Graph view (differentiation; builds on existing facts)
4. **V4** — Auto-ingest (extends ?ingest=; higher complexity)

---

## Next Slice to EXECUTE (V4b)

**V4a shipped:** IngestRule table + list/create/delete API. V4b = worker that picks up rules.

```
MODE: EXECUTE
GOAL: Ship Krisp intake V1 — audio upload → transcription → facts.

SCOPE:
- In-scope: AddSourceSheet audio formats; /ingest/file audio handling; ingest_file_task (transcribe + extract); SourceType.AUDIO; minimal E2E
- Out-of-scope: YouTube URL changes; Krisp API; Graph view; Auto-ingest

ALLOWED FILES:
- apps/backend/app/api/ingest.py
- apps/backend/app/workers/ingest_task.py
- apps/backend/app/models.py (SourceType)
- apps/web/src/components/AddSourceSheet.tsx
- apps/web/src/lib/api.ts (uploadFile — accept types)
- docs/plan/krisp-intake-and-ux-slices.md

STOP CONDITIONS:
- Audio file upload → job COMPLETED → facts in DB
- E2E or manual smoke passes
- Diff budget: ≤300 LOC

MAX ITERATIONS: 2
```

---

## Links

- [[architecture/UX_POLISH_ROADMAP_FEB_2026]]
- [[architecture/cursor-agent-playbook]]
- [[testing/e2e/E2E_IDLE_CONTRACT]]
- [[context]]
