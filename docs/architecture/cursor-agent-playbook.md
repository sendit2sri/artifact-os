# Cursor Agent Operating Manual (Artifact-OS)

This repo is governed by `.cursorrules`. This manual is a practical “how to run Cursor Agent” guide that enforces those rules every time.

---

## 1) Repo Ground Rules (authoritative)

### Repo layout
- Backend: `apps/backend/**`
- Frontend: `apps/web/**`
- Docs: `docs/**`
- Support: `scripts/**`, `tools/**` (**only if task mentions them**)
- Root scripts: `run-synthesis-tests.sh`, `start-*.sh` (**only if task mentions them**)
- Infra: `docker-compose*.yml`, `nginx.conf`, `Makefile` (**only if task mentions them**)

### Never read/scan by default (cost + noise)
- `node_modules/**`
- `test-results/**`
- `e2e.log`
- `*.rtf`, `directory_struture.txt`, `project_tree_structure*`

---

## 2) Operating Modes (must follow)

Pick exactly one mode per run.

### PLAN mode
Use when the task is non-trivial or touches multiple layers.
**Required output in PLAN:**
- Scope + Non-scope
- Acceptance criteria
- Allowed files list (before any coding)
- Thin vertical slices if needed

### EXECUTE mode
Use when the scope is clear or a plan exists (e.g., `docs/plan/<feature>.md`).
**Rules in EXECUTE:**
- Implement exactly the plan/scope
- Minimal diffs (no unrelated refactors)
- Stay within Allowed files; if more needed → STOP and ask

### REVIEW mode
Review only the diff / changed files provided.
**Rules in REVIEW:**
- Do not scan the repo
- Output: risks + missing tests + edge cases (with file/line references)

---

## 3) Agent Loop Guardrails (always-on)

Every Cursor Agent run MUST include:

1) **Goal** (one sentence)
2) **Allowed files** (explicit list or glob)
3) **Stop conditions**
   - acceptance criteria met
   - tests pass (or commands listed)
4) **Max iterations: 2**
   - pass 1 implement
   - pass 2 fix only
   - if still failing → STOP + write a handoff

### Diff budget
If patch exceeds ~300 lines changed OR touches too many files:
- STOP
- propose a smaller slice plan

### Scope expansion
- If you need files outside Allowed files → STOP and ask
- No refactor/rename/reformat unrelated code
- No dependency upgrades unless explicitly asked

---

## 4) Allowed File Presets (use the smallest one)

### Backend-only slice
- `apps/backend/**`
- plus: `docs/**` (if documenting), backend tests/migrations only (if relevant)

### Web-only slice
- `apps/web/**`
- plus: `docs/**` (if documenting), web tests only (if relevant)

### Full vertical slice (backend + web)
- `apps/backend/**`
- `apps/web/**`
- plus: `docs/**` and minimal tests required

### Docs-only
- `docs/**` only

### Infra-only (only when asked)
- `docker-compose*.yml`, `nginx.conf`, `Makefile`, `scripts/**`, `tools/**`

---

## 5) File Open Budget (anti-bloat)

Default limit: open ≤ 10 files per run.

**How to instruct Agent:**
- “Open only the files I list + direct dependencies.”
- If more files are needed: STOP and ask.

---

## 6) Prompt Template (copy/paste)

Use this exact skeleton to keep Agent compliant:

MODE: PLAN | EXECUTE | REVIEW

GOAL (1 sentence):
<what you want done>

SCOPE:
- In-scope:
  - <bullets>
- Out-of-scope:
  - No unrelated refactors
  - No dependency upgrades
  - No infra changes unless explicitly requested

ALLOWED FILES:
- <preset or explicit list>
- Never open/scan: node_modules/**, test-results/**, e2e.log, *.rtf, project_tree_structure*

OPEN FIRST (≤ 8 files):
1) <file>
2) <file>
...

STOP CONDITIONS:
- Acceptance criteria:
  - <bullets>
- Commands to run:
  - <commands>
- Max iterations: 2 (implement + 1 fix pass). If still failing: STOP + handoff.

DIFF BUDGET:
- Stop if >300 LOC changed OR too many files touched → propose smaller slice.

OUTPUT FORMAT:
1) Mode used
2) Files changed/added
3) Patch summary (per file)
4) Commands to run (tests/migrations)
5) If blocked: docs/handoff/<feature>-handoff.md

---

## 7) Backend Standards (FastAPI/SQLAlchemy)

When touching backend:
- Type hints on all functions
- Use existing session dependency / transaction conventions
- Do not mix async/sync DB patterns
- Schema changes require Alembic migration with upgrade + downgrade
- Proper status codes + error handling
- No breaking API/response contract unless explicitly asked

Security defaults:
- Never log secrets
- Use env vars for secrets
- If new config: update `.env.example` + brief docs in `docs/`

---

## 8) Documentation Rules (Obsidian-first)

When asked to write docs / summary / generate `.md`:

1) Write under `docs/**` (never root except README.md and QUICK_START.md)
2) Use structure:
   - `# <Title>`
   - `## Summary`
   - `## Context`
   - `## What changed`
   - `## How to run / verify`
   - `## Files touched`
   - `## Links` (Obsidian wikilinks)
3) Update `docs/_index.md` with links
4) Output final paths as Obsidian-friendly wikilinks

Docs buckets:
- `docs/testing/e2e/`
- `docs/changes/YYYY/MM/`
- `docs/features/`
- `docs/architecture/`
- `docs/solutions/`
- `docs/routing/`
- `docs/release/`
- `docs/misc/`

Spine docs (must stay short):
- `docs/context.md` (evergreen)
- `docs/STATUS.md` (≤ ~120 lines)
- `docs/IMPLEMENTED.md` (≤ ~200 lines)
- `docs/PENDING.md` (small backlog)

---

## 9) “What’s implemented so far?” (ground-truth only)

When asked to summarize implementation status:
- Use git history + file diffs as ground truth
- Do NOT infer from memory/chat
- If evidence missing: write “Unknown / needs confirmation”

Must update ONLY:
- `docs/IMPLEMENTED.md`
- `docs/STATUS.md`
- optionally `docs/_index.md`

If git/PR evidence is not available to Agent, request user to paste:
- `git log --oneline --since="<date>"`
- `git log --name-status --since="<date>" --pretty=format:"%h %s"`

---

## 10) Example Prompts (ready to run)

### A) Toolbar consolidation (PLAN)
MODE: PLAN
GOAL (1 sentence):
Consolidate top toolbar: keep only Tabs + Search + Filters(sheet) + primary CTA; move sort/group/collapse into Filters sheet.

SCOPE:
- In-scope: adjust toolbar layout; move controls into filter sheet
- Out-of-scope: no redesign; no new features

ALLOWED FILES:
- apps/web/**
- docs/** (optional)

STOP CONDITIONS:
- Toolbar contains only Tabs/Search/Filters/CTA
- Moved controls still work
- Playwright E2E passes: <your command>
Max iterations: 2
Diff budget: stop if >300 LOC changed

---

### B) Transcription intake (Slice 1) (PLAN)
MODE: PLAN
GOAL (1 sentence):
Add audio file upload intake -> transcription -> feed transcript into existing extraction pipeline (Slice 1 only).

SCOPE:
- In-scope: backend upload + worker job + persist transcript; run extraction on transcript
- Out-of-scope: YouTube URL (later slice); fancy UI (minimal hook only)

ALLOWED FILES:
- apps/backend/**
- apps/web/** (only minimal UI hook if needed)
- docs/**

STOP CONDITIONS:
- Upload accepted and job queued
- Transcript stored
- Facts extracted from transcript
- Minimal test or E2E coverage added
Max iterations: 2
Diff budget: stop if >300 LOC or too many files

---

### C) “What’s implemented so far?” (EXECUTE docs update)
MODE: EXECUTE
GOAL (1 sentence):
Update docs/IMPLEMENTED.md and docs/STATUS.md with what is implemented so far, grounded in git evidence only.

SCOPE:
- In-scope: evidence-based feature ledger + current snapshot
- Out-of-scope: no code changes

ALLOWED FILES:
- docs/IMPLEMENTED.md
- docs/STATUS.md
- docs/_index.md (optional)

STOP CONDITIONS:
- Both docs updated with commit hashes + key files per feature
- If git evidence not accessible, STOP and request the exact git commands output
Max iterations: 1

---

## 11) Two Anti-Drift Lines (use often)

Add these to most prompts:
- “Do not scan the repo. Open only the files listed + direct dependencies.”
- “No refactors. Minimal diff. If tempted: STOP and propose a smaller slice.”

### PR creation without gh
After pushing a branch, print (and if possible open) the Compare URL:

`https://github.com/sendit2sri/artifact-os/compare/<branch>?expand=1`

On macOS, attempt:
`open "https://github.com/sendit2sri/artifact-os/compare/<branch>?expand=1"`

## Git rules:
  - Branch: feat/<slice-id>-<shortname>
  - Commit: feat: <slice-id> <shortname>
  - Push: git push -u origin <branch>
  - After push: print PR URL:
    https://github.com/sendit2sri/artifact-os/compare/<branch>?expand=1
  - Try to auto-open it (macOS):
    open "https://github.com/sendit2sri/artifact-os/compare/<branch>?expand=1"
  - DO NOT push to main
  