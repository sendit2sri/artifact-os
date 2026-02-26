# DevLoop Playbook (Docs + Fixes + Troubleshooting)

This document is the "operating manual" for DevLoop in this repo.

---

## 0) What DevLoop does (mental model)

DevLoop is a loop:
1) Plan → 2) Generate patch → 3) Validate patch → 4) Apply patch → 5) Verify chain → 6) Fix if failed

Key goals:
- Prevent corrupt unified diffs
- Prevent out-of-scope edits
- Stop on infra failures
- Keep task idempotent ("already applied" should be safe)

---

## 1) One-command usage

### Run with a prompt + file allowlist
```bash
tools/devloop/run.sh "YOUR TASK TEXT" --files path/to/file1.py path/to/file2.py
```

### Use TASK.md (recommended)
```bash
tools/devloop/run.sh "$(cat tools/devloop/TASK.md)" --files <files...>
```

---

## 2) Important configuration

**tools/devloop/config.yaml** (expected)
- Shadow mode ON (asks before applying)
- Backend lint/unit pinned to venv
- Gate uses a real Makefile target (or removed)

Example:
```yaml
verify_chain:
  - backend_lint
  - backend_unit
  # - gate   # only if configured to a real target

commands:
  backend_lint: "cd apps/backend && .venv/bin/python -m ruff check ."
  backend_unit: "cd apps/backend && DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/artifact_test PYTHONPATH=. .venv/bin/python -m pytest -q"
  # gate: "make e2e-sanity"
```

Notes:
- If ruff says "No module named ruff", install inside venv:
  - `cd apps/backend && .venv/bin/python -m pip install ruff pytest`

---

## 3) Patch rules (why apply used to fail)

**Unified diff must be valid for git apply**
- Must include: diff --git, ---, +++, and correct @@ hunk headers
- Inside hunks: every line must start with one of:
  - ` ` context
  - `+` add
  - `-` delete
  - `\` for "No newline at end of file"
- Blank lines inside hunks must be a single space line: ` ` (so `sed -n 'l'` shows ` $`)

**Cleaned diffs**

DevLoop writes:
- `patch.cleaned.diff` (validated diff fed to apply)
- `fix_patch_{attempt}.cleaned.diff`

Inspect:
```bash
RUN=$(ls -td tools/devloop/.runs/* | head -n 1)
sed -n '1,80l' "$RUN/patch.cleaned.diff"
```

---

## 4) Idempotency (no-op / already-applied safety)

**Problem**

If a task says "add X" and X already exists, the coder should not try to add it again.

**Implemented behavior**
- If only one file is selected:
  - Extract quoted literals from the task ('...' or "...")
  - If literal already exists in the file → SKIP CODER
- "noop comment" style tasks:
  - If task looks noop-ish and `# devloop noop` already exists → SKIP CODER

**Apply safety**

Before applying any patch:
- Run `git apply --reverse --check`:
- If reverse succeeds → treat as already applied, return ok.

---

## 5) Scope control (stop unwanted edits)

**Allowed-files lock**

Fixer MUST only edit:
- the file(s) returned by the failure parser
- and only after you approve "Expand scope to include …"

Fixer prompt includes an explicit ALLOWED FILES block.

If you see placeholders like `file.py` / `your_script.py`, reject.

---

## 6) Failure parsing rules

**Ruff parsing (backend_lint)**

Ruff format:
```
E402 ...
  --> alembic/env.py:13:1
```

DevLoop should:
- parse path + line + code
- prefix with `apps/backend/` since ruff runs from there

**Pytest parsing (backend_unit)**

Pytest stack frames often include `.venv/site-packages/...`

Parser should:
- skip `.venv/`, `site-packages`, `/opt/`, `/usr/`, `/System/`
- choose the first repo file: `apps/backend/app/...` or `apps/backend/tests/...`

---

## 7) Infra guards (do NOT run fixer)

These are environment problems, not code problems.
If logs contain any of these, DevLoop should STOP and print guidance:

**Docker / compose**
- Cannot connect to the Docker daemon
- Is the docker daemon running
- no such service
- Error response from daemon
- port is already allocated
- connection refused (proxy/backend down)

Example:
```bash
DOCKER_HOST=unix:///nonexistent make e2e-sanity
```
Should STOP with "INFRA FAILURE".

**Makefile missing targets**

If you see:
- `No rule to make target 'gate'`

Fix by:
- removing gate from verify_chain OR
- setting `gate: "make e2e-sanity"` (or another existing target)

---

## 8) Postgres-first testing (recommended)

SQLite compatibility causes extra maintenance (UUID/JSON types).
We are Postgres-first.

**Ensure DB exists + migrations**
```bash
docker compose up -d db
# create artifact_test if needed
# run migrations
```

Use:
```
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/artifact_test
```

---

## 9) "Golden path" workflow for feature work

**Step 1:** Pick the smallest deliverable

Example: "Ingest URL happy path"
- create job
- worker completes job
- return minimal payload

**Step 2:** Run DevLoop scoped to the exact files

Keep `--files` tight.

**Step 3:** If verify fails, approve scope expansion ONLY to the failing file

Reject unrelated patches.

**Step 4:** Repeat until ✅

---

## 10) Quick commands cheat sheet

**Latest run directory**
```bash
RUN=$(ls -td tools/devloop/.runs/* | head -n 1); echo "$RUN"
```

**View logs**
```bash
sed -n '1,160p' "$RUN/verify_0.log"
cat "$RUN/failure_0.json"
```

**Inspect diffs**
```bash
sed -n '1,120l' "$RUN/patch.cleaned.diff"
ls "$RUN"/fix_patch_*.cleaned.diff
```

---

## 11) Common "what now?" decisions

**If patch apply fails**
- Open `patch.cleaned.diff`
- Check:
  - hunk header counts vs actual body
  - missing ---/+++
  - empty lines inside hunks
  - patch based on stale file content

**If fixer edits wrong file**
- Parser problem or selected_files fallback
- Ensure for backend_lint you don't pass selected_files fallback
- Ensure ruff paths are prefixed with `apps/backend/`

**If pytest fails due to missing DATABASE_URL**
- This is ENV
- Fix verify command to set DATABASE_URL (Postgres URL)
- Or stop and tell user to start docker

---

## 12) Where to put future improvements (optional)

- Add `make devloop-verify` target to unify verify chain
- Add `devloop doctor` command to check:
  - venv exists
  - ruff installed
  - docker up
  - db reachable
