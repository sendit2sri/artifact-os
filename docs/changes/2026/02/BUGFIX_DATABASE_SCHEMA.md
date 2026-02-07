# Bugfix: Database Schema Out of Sync (500 Errors on /facts)

**Date:** February 7, 2026  
**Issue:** 500 Internal Server Error on `/api/v1/projects/.../facts` endpoint  
**Status:** ✅ Fixed

---

## Problem Statement

The application was repeatedly failing with 500 errors when trying to fetch facts:

```
GET /api/v1/projects/96fd837f-4608-4df0-97c3-a69acb9e79ec/facts
→ 500 Internal Server Error (repeated 10+ times)
```

### Backend Error

```python
sqlalchemy.exc.ProgrammingError: (psycopg2.errors.UndefinedColumn) 
column research_nodes.evidence_start_char_raw does not exist

LINE 1: ...nodes.quote_text_raw, research_nodes.quote_hash, research_n...
                                                             ^

[SQL: SELECT research_nodes.id, research_nodes.project_id, ...
      research_nodes.evidence_start_char_raw,      ← Missing column
      research_nodes.evidence_end_char_raw,        ← Missing column  
      research_nodes.evidence_start_char_md,       ← Missing column
      research_nodes.evidence_end_char_md,         ← Missing column
      ...
FROM research_nodes 
WHERE research_nodes.project_id = %(project_id_1)s::UUID]
```

---

## Root Cause

**Database schema was out of sync with SQLModel definitions.**

### What Happened

1. **Model updated** - Evidence offset columns added to `ResearchNode` model (lines 98-102 in `models.py`):
   ```python
   # Evidence offset anchors for precise highlighting
   evidence_start_char_raw: Optional[int] = Field(default=None)
   evidence_end_char_raw: Optional[int] = Field(default=None)
   evidence_start_char_md: Optional[int] = Field(default=None)
   evidence_end_char_md: Optional[int] = Field(default=None)
   ```

2. **Migration created** - Alembic migration was generated:
   - File: `apps/backend/alembic/versions/a3f9b2c1d8e5_add_evidence_offsets.py`
   - Adds 4 new integer columns to `research_nodes` table

3. **Migration NOT applied** - Database was still on old schema
   - Running application tried to query new columns
   - PostgreSQL rejected query: "column does not exist"
   - SQLAlchemy raised `ProgrammingError`
   - FastAPI returned 500 to frontend

---

## Solution

Applied the pending database migration to sync schema.

### Commands Run

```bash
# 1. Apply pending migrations
docker-compose exec backend alembic upgrade head

# 2. Restart backend to pick up schema changes
docker-compose restart backend worker
```

### Migration Applied

```
INFO  [alembic.runtime.migration] Running upgrade f1c8d4a2e9b7 -> a3f9b2c1d8e5, add evidence offsets
```

**Result:** Database now has all 4 evidence offset columns.

---

## Technical Details

### Migration Content

**File:** `apps/backend/alembic/versions/a3f9b2c1d8e5_add_evidence_offsets.py`

```python
def upgrade():
    op.add_column('research_nodes', sa.Column('evidence_start_char_raw', sa.Integer(), nullable=True))
    op.add_column('research_nodes', sa.Column('evidence_end_char_raw', sa.Integer(), nullable=True))
    op.add_column('research_nodes', sa.Column('evidence_start_char_md', sa.Column('evidence_end_char_md', sa.Integer(), nullable=True))

def downgrade():
    op.drop_column('research_nodes', 'evidence_end_char_md')
    op.drop_column('research_nodes', 'evidence_start_char_md')
    op.drop_column('research_nodes', 'evidence_end_char_raw')
    op.drop_column('research_nodes', 'evidence_start_char_raw')
```

**Column Details:**
- **Type:** `INTEGER`
- **Nullable:** `TRUE` (optional fields)
- **Purpose:** Store character offsets for precise evidence highlighting in source documents

---

### Model Definition

**File:** `apps/backend/app/models.py` (lines 83-116)

```python
class ResearchNode(SQLModel, table=True):
    __tablename__ = "research_nodes"
    
    # ... existing fields ...
    
    # Evidence offset anchors for precise highlighting
    evidence_start_char_raw: Optional[int] = Field(default=None)   # Offset in content_text_raw
    evidence_end_char_raw: Optional[int] = Field(default=None)     # Offset in content_text_raw
    evidence_start_char_md: Optional[int] = Field(default=None)    # Offset in content_markdown
    evidence_end_char_md: Optional[int] = Field(default=None)      # Offset in content_markdown
    
    # ... other fields ...
```

**Use Case:**
- Frontend can request specific character ranges for highlighting
- Supports both raw text and markdown formats
- Enables "jump to source" feature with precise evidence location

---

## Why This Happened

### Common Migration Pitfalls

1. **Model changed but migration not run**
   - Developer adds field to model
   - Forgets to create/apply migration
   - Local dev DB out of sync

2. **Migration created but not applied**
   - `alembic revision --autogenerate` creates migration file
   - Developer forgets `alembic upgrade head`
   - Code expects new columns, DB doesn't have them

3. **Docker environment sync**
   - Migration applied in one environment (local)
   - Not applied in Docker containers
   - Container DB schema lags behind

---

## Prevention

### Development Workflow

**After adding model fields:**

```bash
# 1. Create migration
make db-rev msg="add_new_fields"

# 2. Review generated migration
cat apps/backend/alembic/versions/*_add_new_fields.py

# 3. Apply migration
make db-up

# 4. Restart backend (if running)
docker-compose restart backend

# 5. Verify
docker-compose logs backend --tail=20
```

---

### Makefile Commands

**File:** `Makefile` (lines 88-98)

```makefile
# Create a new DB migration
db-rev:
	@if [ -z "$(msg)" ]; then 
	    echo "❌ Error: msg is missing. Usage: make db-rev msg='your_message'"; 
	    exit 1; 
	fi
	docker-compose exec backend alembic revision --autogenerate -m "$(msg)"
	@echo "✅ Revision created."

# Apply pending DB migrations
db-up:
	docker-compose exec backend alembic upgrade head
```

**Usage:**
```bash
make db-rev msg="add_evidence_columns"  # Create
make db-up                               # Apply
```

---

## Verification

### Test Backend Health

```bash
curl http://localhost:8000/health
# Should return: {"status":"ok","system":"Artifact OS"}
```

### Test Facts Endpoint

```bash
curl http://localhost:8000/api/v1/projects/{project_id}/facts
# Should return: 200 OK with JSON array of facts
```

### Check Database Schema

```bash
docker-compose exec db psql -U postgres -d artifact_dev -c "\d research_nodes"
```

**Expected output should include:**
```
 evidence_start_char_raw | integer
 evidence_end_char_raw   | integer
 evidence_start_char_md  | integer
 evidence_end_char_md    | integer
```

---

## Other Errors in Log (Non-Critical)

### 1. WebSocket HMR Failures

```
WebSocket connection to 'ws://localhost/_next/webpack-hmr' failed
```

**Cause:** Next.js Hot Module Replacement in Docker  
**Impact:** Hot reload might be slower, but app works  
**Fix:** Already configured in `nginx.conf` with WebSocket support  
**Status:** Cosmetic warning, ignore in development

---

### 2. Next.js Chunk 503 Errors

```
Failed to load chunk /_next/static/chunks/...ts_c8c997ce._.js
Status: 503 (Service Temporarily Unavailable)
```

**Cause:** Next.js dev server restarting or slow response  
**Impact:** Page might need manual refresh  
**Fix:** Restart dev environment if persistent:
```bash
make down
make dev-proxy
```
**Status:** Transient, resolves automatically

---

## Files Changed

**Modified: Database Schema (via migration)**
- Table: `research_nodes`
- Added: 4 integer columns for evidence offsets

**Commands Used:**
- `docker-compose exec backend alembic upgrade head`
- `docker-compose restart backend worker`

**No code changes required** - Migration applied schema updates

---

## Best Practices

### 1. Always Run Migrations After Model Changes

```bash
# Edit apps/backend/app/models.py
# Then immediately:
make db-rev msg="describe_change"
make db-up
docker-compose restart backend
```

---

### 2. Check Migration Before Applying

```bash
make db-rev msg="add_field"
# Review the generated file
cat apps/backend/alembic/versions/*_add_field.py
# Verify upgrade/downgrade logic
make db-up
```

---

### 3. Keep Migrations in Version Control

```bash
git add apps/backend/alembic/versions/*.py
git commit -m "feat(db): add evidence offset columns"
```

---

### 4. Document Breaking Changes

If migration changes existing data:
- Add comment in migration file
- Update `CHANGELOG.md`
- Notify team before deploying

---

## Troubleshooting Guide

### Error: "column does not exist"

```
sqlalchemy.exc.ProgrammingError: column X does not exist
```

**Fix:**
```bash
make db-up
docker-compose restart backend
```

---

### Error: "Target database is not up to date"

```
ERROR [alembic.util.messaging] Target database is not up to date.
```

**Fix:**
```bash
# Apply pending migrations first
make db-up
# Then create new one
make db-rev msg="new_change"
```

---

### Error: "Multiple heads in database"

```
ERROR [alembic.util.messaging] Multiple heads detected
```

**Fix:**
```bash
# Merge migration branches
docker-compose exec backend alembic merge heads -m "merge_branches"
make db-up
```

---

## Related Documentation

- [Alembic Documentation](https://alembic.sqlalchemy.org/)
- [SQLModel Migrations](https://sqlmodel.tiangolo.com/tutorial/create-db-and-table/#alembic-migrations)
- [FastAPI + Alembic Guide](https://fastapi.tiangolo.com/tutorial/sql-databases/#alembic)

---

## Definition of Done ✅

- [x] Identified missing database columns causing 500 errors
- [x] Applied pending Alembic migration
- [x] Restarted backend to pick up schema changes
- [x] Verified backend health endpoint responding
- [x] Documented migration workflow
- [x] Added troubleshooting guide
- [x] Updated best practices

---

**Result:** The `/api/v1/projects/.../facts` endpoint now returns 200 OK. All evidence offset columns are available in the database, enabling future evidence highlighting features.
