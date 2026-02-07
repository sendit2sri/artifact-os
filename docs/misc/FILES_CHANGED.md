# Files Changed - UX Improvements

## Frontend (Next.js/React)

### Modified Files

1. **`apps/web/src/app/project/[id]/page.tsx`** ⭐ Major changes
   - Auto-refresh logic with completion tracking
   - Sort URL persistence
   - Project rename (inline contentEditable)
   - ProjectOverview component integration
   - OutputDrawer integration (replaced Dialog)
   - Persistent Generate bar with disabled state
   - Updated all query keys for consistency

2. **`apps/web/src/components/EvidenceInspector.tsx`** ⭐ COMPLETE REWRITE
   - Clean Reader view with proper paragraph spacing
   - Raw view preserves original formatting
   - Auto-scroll works on both tabs with retry logic
   - Theme-aware highlighting using CSS custom properties
   - Split into sub-components (ReaderView, RawView, RenderBlock)
   - Match status indicator (Exact/Normalized/Fuzzy/Not Found)
   - Citation removal in Reader mode only
   - Enhanced toolbar (Copy, Open Original, Close)

3. **`apps/web/src/components/SourceTracker.tsx`**
   - Inline rename (removed modal)
   - Updated query keys
   - Added rename mutation with toast feedback

4. **`apps/web/src/components/FactCard.tsx`**
   - Updated query key: `["project-facts"]`

5. **`apps/web/src/lib/api.ts`**
   - Added `Output` interface
   - Added output-related functions (fetch, delete)
   - Modified `synthesizeFacts` to return `output_id`

6. **`apps/web/src/app/globals.css`** ⭐ Evidence Panel Styles
   - Added `.evidence-mark` with theme-aware colors
   - Added `.reader-content` paragraph spacing rules
   - Added `.raw-content` formatting preservation
   - Box shadow effects for light/dark modes

### New Files Created

6. **`apps/web/src/components/OutputDrawer.tsx`** ⭐ New
   - Right-side drawer for viewing synthesis outputs
   - Copy and download functionality
   - Non-blocking design

7. **`apps/web/src/components/ProjectOverview.tsx`** ⭐ New
   - Stat cards for project-level metrics
   - Total sources, facts, key claims, needs review

8. **`apps/web/src/lib/evidenceUtils.ts`** ⭐ NEW (Evidence Panel Fix)
   - Multi-strategy quote matching (exact, normalized, fuzzy)
   - Text block parsing for clean Reader view
   - Auto-scroll with retry mechanism
   - Table data detection

### Deleted/Unused Files

8. **`apps/web/src/components/RenameSourceDialog.tsx`**
   - No longer imported or used (replaced by inline editing)
   - Can be deleted if desired

---

## Backend (FastAPI/Python)

### Modified Files

1. **`apps/backend/app/models.py`** ⭐
   - Added `Output` model with full schema
   - Includes id, project_id, title, content, output_type, mode, fact_ids, source_count, timestamps

2. **`apps/backend/app/api/projects.py`** ⭐
   - Modified `/projects/{project_id}/synthesize` to auto-save outputs
   - Added `GET /projects/{project_id}/outputs` endpoint
   - Added `GET /outputs/{output_id}` endpoint
   - Added `DELETE /outputs/{output_id}` endpoint
   - Added `PATCH /projects/{project_id}` endpoint for title updates
   - Added `ProjectUpdate` schema
   - Imported `Output` model

3. **`apps/backend/app/api/ingest.py`** ⭐ Error Handling Fix
   - Added graceful handling for duplicate key violations
   - Returns 409 Conflict instead of 500 for duplicates
   - Shows user-friendly message: "This source has already been added"
   - Catches IntegrityError race conditions
   - Logs technical errors but hides from users

### New Files Created

4. **`apps/backend/alembic/versions/f1c8d4a2e9b7_add_outputs_table.py`** ⭐ New
   - Database migration to create `outputs` table
   - Foreign key to projects
   - Index on project_id
   - Includes upgrade and downgrade functions

---

## Documentation

### New Files Created

1. **`IMPLEMENTATION_UX_IMPROVEMENTS.md`** ⭐
   - Comprehensive summary of all 9 issues
   - Verification checklists for each feature
   - Design improvements documentation
   - Testing recommendations

2. **`EVIDENCE_PANEL_FIX.md`** ⭐ NEW
   - Deep dive into Evidence Inspector improvements
   - Multi-strategy quote matching algorithm
   - Text block parsing and rendering
   - Complete verification checklist

3. **`FILES_CHANGED.md`** (this file)
   - Quick reference of all modified/created files
   - File-by-file summary of changes

---

## File Change Summary

| Category | Modified | Created | Deleted/Unused | Total |
|----------|----------|---------|----------------|-------|
| Frontend | 6 | 3 | 1 | 10 |
| Backend  | 3 | 1 | 0 | 4 |
| Bonus Fix | 1 | 0 | 0 | 1 |
| Docs     | 0 | 3 | 0 | 3 |
| **Total** | **10** | **7** | **1** | **18** |

---

## Migration Required

⚠️ **Important:** Run database migration before testing:

```bash
cd apps/backend
alembic upgrade head
```

---

## Quick Test Commands

### Frontend
```bash
cd apps/web
npm run dev
```

Visit: http://localhost:3000/project/[your-project-id]

### Backend
```bash
cd apps/backend
# Make sure virtual environment is activated
python -m uvicorn app.main:app --reload
```

### Full Stack
```bash
# From project root (if you have a Makefile or docker-compose)
make dev
# or
docker-compose up
```

---

## Git Commit Suggestion

```bash
git add .
git commit -m "feat: comprehensive UX improvements for Research Inbox

- Auto-refresh facts after ingestion completes
- Persistent sort with URL params and visual feedback
- Project overview dashboard with stat cards
- Inline project and source renaming (no modals)
- Evidence panel auto-scroll with theme-aware highlights
- Premium typography and citation removal in Reader mode
- Persistent Generate bar with disabled state
- Output storage and drawer display (non-blocking)
- Synthesis Builder verification (already non-blocking)

All changes follow 2026 SaaS design trends: fewer borders, more spacing,
soft surfaces, clear hierarchy, and strong feedback loops.

Backend changes:
- Add Output model and migration
- Add output endpoints (GET, DELETE)
- Add project PATCH endpoint for title updates

Breaking changes: None (all additive and backward-compatible)"
```

---

## Rollback Procedure

If issues arise and you need to rollback:

### Backend Only
```bash
cd apps/backend
alembic downgrade -1  # Rollback one migration (removes outputs table)
```

### Frontend Only
```bash
git checkout HEAD~1 -- apps/web/
npm install
```

### Full Rollback
```bash
git revert HEAD  # Creates a revert commit
alembic downgrade -1
```

---

## Next Steps (Optional)

1. **Test all verification checklists** in `IMPLEMENTATION_UX_IMPROVEMENTS.md`
2. **Update any CI/CD pipelines** if needed for new API endpoints
3. **Add backend tests** for new Output endpoints
4. **Add frontend E2E tests** for critical user flows
5. **Update user documentation/help guides** with new features
6. **Consider adding Sentry/error tracking** for new components
7. **Monitor performance** of new polling strategy in production
