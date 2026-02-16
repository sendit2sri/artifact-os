# Artifact OS — Project Summary for Next Implementations

**Date**: 2026-02-16  
**Purpose**: Feed into Gemini for next implementations  
**Audience**: AI assistants, new contributors

---

## Summary

Artifact OS is a research artifact management platform with a FastAPI backend, Next.js frontend, and PostgreSQL + Redis + Celery stack. The project has undergone extensive UX polish, bug fixes, E2E stabilization, and feature additions through Feb 2026. This document summarizes what exists, what was fixed, and what remains.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16, React, TypeScript |
| **Backend** | FastAPI, Python 3.10+ |
| **Database** | PostgreSQL, SQLAlchemy, Alembic |
| **Queue** | Celery, Redis |
| **Dev** | Docker, Nginx (reverse proxy), Syncthing-friendly structure |
| **E2E** | Playwright |

---

## Project Structure

```
artifact-os/
├── apps/
│   ├── backend/          # FastAPI API, Celery workers
│   └── web/              # Next.js frontend
├── docs/                 # Obsidian-style docs (docs/_index.md)
├── docker-compose.yml    # Main compose (proxy, web, backend, worker, db, redis)
├── docker-compose.e2e.yml # E2E-specific (no bind mounts)
├── Makefile              # dev, dev-proxy, prod, db-rev, db-up, e2e
└── nginx.conf             # Routes /api → backend, / → web
```

**Key commands:**
- `make dev-proxy` — Dev with hot reload, no CORS (recommended)
- `make dev` — Frontend on :3000, API proxied via Next.js rewrites
- `make prod` — Production-like stack
- `make db-rev msg="..."` — Create Alembic migration
- `make db-up` — Apply migrations

---

## Features Implemented

### Core Product Features

1. **Project / Workspace Management**
   - Projects within workspaces (Personal, Team)
   - Workspace switch updates URL `?ws=<teamId>`
   - Project creation reads workspace from router/store

2. **Source Ingestion**
   - Add URLs (paste, import)
   - Celery worker processes URLs → extracts facts
   - Job status: PENDING → RUNNING → SUCCESS/FAILED
   - Multi-source import (Reddit, YouTube, etc.)

3. **Facts & Evidence**
   - Research facts with review status: `pending`, `approved`, `needs_review`, `flagged`, `rejected`
   - Evidence panel (Raw / Reader views)
   - Evidence highlight + auto-scroll in both views
   - Reader formatting: tables, headings, paragraph breaks (4-step backend pipeline)

4. **Synthesis**
   - Generate from selected facts (2+ required)
   - Trust gate (remove non-approved vs include anyway)
   - Synthesis Builder / Cluster Preview → Confirm → Output Drawer
   - Synthesis History: list past outputs, open any output
   - Output types: merge, split, cluster

5. **View State & Filters**
   - Sort (newest, oldest, relevance)
   - Group by source
   - Review status filter (All, Approved, Needs Review, Flagged)
   - Search, scope, collapse similar, show only selected
   - Filter chips row (dismissible badges for active filters)
   - Server prefs + localStorage migration

6. **Phase State Machine**
   - Phases: EMPTY → INGESTING → PROCESSING → READY | ERROR
   - PhaseIndicator, PhaseProgressBar, PhaseStatusLine
   - Phase-aware CTAs and onboarding

7. **Onboarding**
   - Empty-only overlay (non-blocking, inline)
   - Visible only in EMPTY phase

8. **Queued Watchdog**
   - Stuck job detection (30s threshold)
   - Warning at 15s
   - Retry button + troubleshooting links

9. **Needs Review Workflow**
   - Dashboard "Needs Review" tile
   - Filter to needs_review facts
   - One-click actions (approve, flag, reject)
   - Bulk actions

10. **Outputs History**
    - `GET /api/v1/projects/{id}/outputs?limit=20&offset=0`
    - History drawer lists outputs; click row → OutputDrawer

---

## Bugs Fixed (Production)

### View State (7 critical)

1. Server prefs never applied (React Query timing — lock before data loaded)
2. URL links didn't work (state frozen on navigation)
3. Effect loops from hydration timing
4. Filters silently changing view (no chips)
5. `group=off` polluting URLs
6. URL comparison failures (param order sensitivity)
7. Empty query strings malformed (trailing `?`)

### Other Fixes

- **CORS / Routing** — Same-origin via Next.js rewrites or Nginx proxy
- **Synthesis Contract** — Zod validation, backend normalization, `/outputs/{id}` fallback
- **Evidence Auto-Scroll** — State machine (IDLE → INJECTED → SCROLLED), double RAF, retry loop
- **Reader Formatting** — "Brick wall" paragraphs, collapsed tables, missing headings
- **Turbopack Stability** — Dev recovery scripts, webpack fallback, `dev:clean`, `dev:recovery`
- **Hydration Mismatch** — SSR/client alignment
- **Delete Job** — Correct job deletion flow
- **Research Inbox** — Inbox-related fixes

---

## E2E Testing

### Implemented

- **Seed contract** — Backend returns `seed_verification`; fixture asserts before tests
- **Idle contract** — `isIdle()` checks jobs; `waitForIdle()` with diagnostics
- **Header-driven force error** — `X-E2E-Force-Error: true` (not query param)
- **Browser storage isolation** — `setupCleanTestState()` clears localStorage before each test
- **E2E compose** — No bind mounts (`volumes: !reset []`) so built image is used
- **Evidence navigation** — Simplified to wait for panel visibility
- **25 view-state acceptance tests** — Regression prevention
- **Stable selectors** — `data-testid` attributes

### E2E Gaps (19 failing tests, Feb 2026)

| Gap | Priority | Effort | Fix |
|-----|----------|--------|-----|
| Selector ambiguity (kitchen sink seed) | P0 | Low | Add stable anchors per fact type (`[E2E:APPROVED-1]`) |
| Import tests need real evidence records | P0 | Medium | Ensure `seed_sources` creates evidence linkage |
| Evidence nav + virtualization | P1 | Medium | FactIds snapshot when panel opens |
| Undo action React Query race | P2 | Low | Wait for PATCH + badge update |
| Workspace switch pointer interception | P2 | Low | Close overlays, deterministic click |

### E2E Contracts to Honor

1. **Synthesis flow**: Generate → [Trust Gate] → Builder/Preview → Confirm → Output Drawer
2. **Duplicate add**: Add enabled on duplicate; API returns `is_duplicate`; toast + `source-highlight-pulse`
3. **Workspace**: Switch updates `?ws=`; create project uses that workspace
4. **Mutation/idle**: Use `waitForAppIdle(page)` after mutations before asserting

---

## Architecture Patterns

### View State Hierarchy

1. URL params (highest)
2. Server prefs (React Query)
3. localStorage (legacy, migrated to server)

### Phase Model

- `lib/phase.ts` — Deterministic phase from sources/jobs/facts
- `data-phase` attributes for E2E

### UI Invariants

- Control height: `h-9` (from `lib/tokens.ts`)
- Documented in `docs/architecture/UI_INVARIANTS.md`

### Debug Mode

- `?debug=1` — Diagnostics strip (jobs, facts count, idle, sort, group)
- `window.__e2e.state` — E2E state exposure

---

## Documentation Structure

- `docs/_index.md` — Central index
- `docs/architecture/` — Design, phase model, view state, UI invariants
- `docs/testing/e2e/` — E2E specs, contracts, guardrails
- `docs/features/` — Feature docs
- `docs/changes/2026/02/` — Dated change notes
- `docs/solutions/` — Fixes, runbooks
- `docs/release/` — Runbook, PR template

---

## Known Issues & Workarounds

1. **Next.js 16.1.6 security advisory** — Upgrade to 16.2+ when stable
2. **Turbopack experimental** — Use `npm run dev:webpack` for stability
3. **Migration rollback** — PostgreSQL enum; `needs_review` is one-way

---

## Files to Know

| Purpose | Path |
|---------|------|
| Project page (main UX) | `apps/web/src/app/project/[id]/page.tsx` |
| Phase logic | `apps/web/src/lib/phase.ts` |
| Queued watchdog | `apps/web/src/lib/queuedWatchdog.ts` |
| UI constants | `apps/web/src/lib/tokens.ts` |
| Idle contract | `apps/web/src/app/providers.tsx` |
| API client | `apps/web/src/lib/api.ts` |
| Backend projects API | `apps/backend/app/api/projects.py` |
| Test helpers / seed | `apps/backend/app/api/test_helpers.py` |
| E2E setup | `apps/web/tests/e2e/helpers/setup.ts` |

---

## Suggested Next Implementations

1. **E2E stabilization** — Seed fact anchors, evidence linkage, evidence nav snapshot
2. **Source dedupe UX** — Allow Add on duplicate; toast + pulse on existing row
3. **Synthesis specs** — Use `ensureOutputDrawerAfterGenerate`; don’t assert drawer immediately
4. **Workspace switch** — Enforce URL/state; assert `ws` before create
5. **Mutation tests** — Add `waitForAppIdle` after approve/flag/undo
6. **Auto-assign needs_review** — Backend confidence < 75 → needs_review
7. **Playwright CI** — Add E2E to GitHub Actions

---

## Links

- [[_index]]
- [[architecture/COMPLETE_IMPLEMENTATION_SUMMARY_FEB_2026]]
- [[architecture/CRITICAL_PATH_COMPLETED_FEB_2026]]
- [[testing/e2e/E2E_GUARDRAILS_STABILITY]]
- [[testing/e2e/E2E_FAILED_TESTS_SUMMARY_FEB_2026]]
- [[release/RUNBOOK]]
