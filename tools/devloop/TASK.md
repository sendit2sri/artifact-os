# DevLoop Tasks (Single Source of Truth)

## How to run (no copy/paste between apps)
### Run the current task (edit ONLY the files listed under the task)
```bash
# From repo root
tools/devloop/run.sh "$(python - << 'PY'
from pathlib import Path
p = Path("tools/devloop/TASK.md").read_text(encoding="utf-8")
# Take text between markers for the active task
start = p.find("## ✅ ACTIVE TASK")
end = p.find("## 📦 BACKLOG")
print(p[start:end].strip())
PY
)" --files apps/backend/app/workers/ingest_task.py apps/backend/app/utils/ids.py

# Or: quick manual run (just copy the prompt section once)
# tools/devloop/run.sh "$(cat tools/devloop/TASK.md | sed -n '/## ✅ ACTIVE TASK/,$p' | sed -n '1,120p')" --files <files...>
```

---

## ✅ ACTIVE TASK (edit this block only)

Feature: Ingest URL happy-path (MVP)

Goal: user submits a URL → backend creates SourceDoc + Facts → job status becomes COMPLETED → UI can show the result.

Rules:
- Keep changes minimal and scoped.
- Update only the files passed in –files unless DevLoop asks to expand scope.
- Add/modify tests if needed.
- If a failure is infra-related (Docker down / ports), stop and fix env (do not patch code).

Deliverables:
1. Ingest worker should reliably mark job RUNNING → COMPLETED (or FAILED with error_summary).
2. If the same URL already exists for the project (url or canonical_url), mark job COMPLETED with is_duplicate=true and include source_id/title/type in result_summary.
3. Ensure job_id normalization is always applied before db.get (use as_uuid).
4. Add or update tests for the above behavior (Postgres-backed).

Acceptance:
- cd apps/backend && .venv/bin/python -m ruff check . passes
- cd apps/backend && DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/artifact_test PYTHONPATH=. .venv/bin/python -m pytest -q passes
- make e2e-sanity passes (when Docker is up)

Notes:
- Don't implement "perfect architecture" now. Just get the loop working.

---

## 📦 BACKLOG (do later, keep short)

P0
- API: POST /projects/{id}/ingest-url (creates job) + GET /jobs/{id}
- UI: show job progress + SourceDoc title + facts list
- Add "Retry job" endpoint for FAILED jobs

P1
- Background fetch content (playwright/requests) + extract facts pipeline
- Add canonical_url normalization rules per source_type
- Add basic rate limit + request validation

P2
- Add E2E Playwright test for "ingest url → facts visible"
- Add audit logging + structured error codes

---

**How you'll use it:**
- You edit only the "✅ ACTIVE TASK" block in Cursor.
- Run DevLoop using `cat TASK.md` (no more prompt copy/paste into Cursor/ChatGPT).
