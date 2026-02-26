# Current Status

**Last updated:** feat/krisp-v1-media-upload (Krisp V1 shipped)

---

## Summary

Artifact-OS is a research synthesis app: FastAPI backend + Next.js frontend + Celery workers. Core loop: import sources → extract facts → review → synthesize outputs.

---

## Implemented (git evidence)

| Area | Evidence | Notes |
|------|----------|-------|
| **Backend** | `e7f12f2`, `7287a4c`, `f668d6a`, `3bd9442`, `6a4392f` | Projects, sources, ingest, extractors (web/Reddit/YouTube), workspaces API |
| **V4a Ingest Rules** | feat/v4a-ingest-rules | IngestRule table, list/create/delete API; worker in V4b |
| **Krisp V1 Media** | `32e9c30`, feat/krisp-v1-media-upload | Media upload → Whisper transcription → facts; SourceType.MEDIA, ingest_media task |
| **Web** | `e7f12f2`, `7287a4c`, `cdf8734`, `d86546d` | Project/review/output pages, evidence panel, synthesis, selection UX, panel pin |
| **E2E** | `e7f12f2`, `cdf8734`, `d86546d` | Playwright specs, seed/evidence helpers, idle contract, preflight |
| **DevLoop** | `9fb8b99` | Patch apply, parsing guards, validation; see `tools/devloop/TASK.md` |
| **DB** | Alembic migrations | Sources, outputs, facts, key claims, review status, content variants, user prefs |

Deep-dive: [[architecture/COMPLETE_IMPLEMENTATION_SUMMARY_FEB_2026]], [[architecture/CRITICAL_PATH_COMPLETED_FEB_2026]].

---

## Known Issues (from recent commits)

- **E2E flakiness:** Addressed via idle contract, seed helpers, panel-pin wait (`cdf8734`, `d86546d`). Remaining gaps: [[testing/e2e/E2E_FAILED_TESTS_SUMMARY_FEB_2026]].
- **Suppressed facts filter:** Fixed in `f668d6a` (projects API).

---

## Next (not yet implemented)

- **Krisp V1.5:** (see [[plan/krisp-intake-and-ux-slices]])
- **V4b:** Ingest rule worker (folder watch, RSS, scheduled) — picks up rules created in V4a
- See [[architecture/UX_POLISH_ROADMAP_FEB_2026]] for UX/stability roadmap

---

## Links

- [[context]] — Architecture, env vars, gotchas  
- [[IMPLEMENTED]] — Shipped ledger with commit hashes  
- [[docs/_index]] — Full doc index
