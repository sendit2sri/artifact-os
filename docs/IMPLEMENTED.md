# Implemented Ledger

Shipped work with git evidence. No speculation—only commit hashes + changed files.

---

## Ground Truth

| Commit | Message | Key files |
|--------|---------|-----------|
| `e7f12f2` | Initialize repo | Full stack: `apps/backend/`, `apps/web/`, alembic migrations, E2E |
| `85914c4` | chore(docs): organize markdown docs under /docs | Moved docs to `docs/` |
| `7287a4c` | chore: initial import | Extractors (reddit, youtube, web), workspaces API, output page, phase/queuedWatchdog/savedViews, many E2E specs |
| `b9f3fa4` | chore: sync alembic migrations after backend deps bump | New migrations, eslint, playwright config |
| `cdf8734` | Stabilize E2E: live RQ idle, selection mode UX, panel pin history | `test_helpers.py`, `ingest_task.py`, `e2e-preflight.js`, seed/evidence helpers, E2E specs |
| `d86546d` | panels-pin: wait for history content before asserting both drawers | `panels-pin.spec.ts` |
| `54f73ac` | chore: ignore Playwright test artifacts | `.gitignore` |
| `f668d6a` | fix(api): correct suppressed facts filter | `projects.py`, `test_is_suppressed_filter.py` |
| `bd7ce55` | chore(devloop): validate patches before apply + improve ruff parsing | `parser.py`, `patch_validate.py`, `main.py` |
| `0a02a6c` | chore(devloop): patch scope + fence stripping + apply check | `patch.py`, `patch_validate.py` |
| `a42a4d1` | chore(devloop): hunk validation, prompt rules, ignore .runs/ | `coder.py`, `fixer.py`, `patch_validate.py` |
| `2c18957` | chore(devloop): reject hunks missing unified diff prefixes | Same + `config.yaml` |
| `9fb8b99` | devloop: harden patch apply, parsing, guards, and docs | `DEVLOOP_PLAYBOOK.md`, `TASK.md`, `patch.py`, `patch_validate.py` |
| `3bd9442` | backend: normalize UUID ids, clean alembic env imports | `ids.py`, `env.py`, `ingest_task.py`, tests |
| `52b9886` | chore(alembic): remove unused imports in migrations | Migration files |
| `6a4392f` | Backend: ruff fixes, TEST_PROJECT_ID, E701/E722 | `test_helpers.py`, `workspaces.py`, extractors, main, schemas, firecrawl, llm, content_formatter |
| *feat/v4a-ingest-rules* | V4a: Ingest rules CRUD | `models.py` (IngestRule), `projects.py` (list/create/delete), migration `y8b9c0d1e2f`, `test_ingest_rules.py` |
| `32e9c30` | feat: Krisp V1 media upload | `ingest.py`, `ingest_task.py` (ingest_media_task), `transcribe.py`, migration `x7a8b9c0d1e2`, `AddSourceSheet.tsx`, `SourceTracker.tsx`, `sources-add-media.spec.ts` |

---

## By Domain

### Backend (apps/backend)

- **API:** projects, sources, ingest, workspaces, test_helpers
- **Extractors:** web, Reddit, YouTube
- **Services:** Firecrawl, LLM, job_tracker, content_formatter
- **Workers:** Celery ingest task
- **Utils:** ids (UUID normalization), content_formatter
- **Tests:** content_formatter, ingest_review_status, is_suppressed_filter

Evidence: `e7f12f2`, `7287a4c`, `f668d6a`, `3bd9442`, `6a4392f`, feat/v4a-ingest-rules, feat/krisp-v1-media-upload (IngestRule, ingest-rules API, media upload + Whisper)

### Web (apps/web)

- **Pages:** project/[id], project/[id]/review, output/[id], home
- **Components:** EvidencePanel, FactCard, OutputDrawer, SynthesisBuilder, AddSourceSheet, PhaseIndicator, QueuedJobAlert, ProcessingTimeline, etc.
- **E2E:** ~30 Playwright specs (synthesis, evidence, facts, panels, seed-contract, etc.)
- **Helpers:** idle, facts, synthesis, setup, nav, known-facts

Evidence: `e7f12f2`, `7287a4c`, `cdf8734`, `d86546d`

### DevLoop (tools/devloop)

- Patch validation, hunk checks, fence stripping
- Planner, coder, fixer agents
- Config, playbook, TASK.md

Evidence: `9fb8b99`, `bd7ce55`, `0a02a6c`, `a42a4d1`, `2c18957`

### Infrastructure

- Docker Compose, Makefile
- GitHub Actions E2E workflow
- Alembic migrations (init → user_preferences, source_type, etc.)

Evidence: `e7f12f2`, `7287a4c`, `b9f3fa4`, `52b9886`

---

## Deep-Dive Docs (no duplicate content here)

- [[architecture/COMPLETE_IMPLEMENTATION_SUMMARY_FEB_2026]] — 9 features, 7 bugs, 25 tests
- [[architecture/CRITICAL_PATH_COMPLETED_FEB_2026]] — Critical path (6 features, 7 bugs)
- [[testing/e2e/E2E_SEED_AND_FIXTURE]] — Seed/fixture contract
- [[testing/e2e/E2E_SYNTHESIS_IMPROVEMENTS]] — Synthesis determinism
- `tools/devloop/TASK.md`, `tools/devloop/DEVLOOP_PLAYBOOK.md` — DevLoop usage
