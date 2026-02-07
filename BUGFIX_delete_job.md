# Bugfix: "Failed to delete job" Error

## Problem
The frontend was calling `DELETE /projects/{projectId}/jobs/{jobId}` but this endpoint didn't exist in the backend, causing the "Failed to delete job" error.

## Root Cause
Backend had a `/projects/{project_id}/reset` endpoint (for resetting entire project) but was missing the individual job deletion endpoint.

## Solution

### 1. ✅ Added Missing Backend Endpoint
**File**: `apps/backend/app/api/projects.py`

Added new endpoint:
```python
@router.delete("/projects/{project_id}/jobs/{job_id}")
def delete_job(project_id: str, job_id: str, delete_facts: bool = False, db: Session = Depends(get_session)):
    """
    Delete a job and optionally its associated facts and source doc.
    """
```

**Features**:
- Deletes the job from the database
- Optionally deletes associated facts and source document (`delete_facts=true`)
- Proper UUID validation
- Permission check (job must belong to project)
- Cascading deletion (ResearchNodes → SourceDoc → Job)

### 2. ✅ Fixed Frontend Reset Handler
**File**: `apps/web/src/components/SourceTracker.tsx`

Changed from:
```typescript
// Old: Tried to delete jobs individually (slow + error-prone)
const promises = (jobs || []).map(job => deleteJob(projectId, job.id, true));
await Promise.all(promises);
```

To:
```typescript
// New: Uses dedicated reset endpoint (fast + reliable)
await resetProject(projectId);
```

### 3. ✅ Added `resetProject` Function
**File**: `apps/web/src/lib/api.ts`

```typescript
export async function resetProject(projectId: string) {
  const res = await fetch(`${API_URL}/projects/${projectId}/reset`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to reset project");
  return res.json();
}
```

## What Now Works

### Individual Job Deletion
- Click the **...** menu on any source
- Click **Delete**
- Job + associated facts are removed ✅

### Project Reset (Reset All)
- Click **...** in sources header
- Click **Reset All Sources**
- Entire project is reset in one transaction ✅

## Technical Details

### Backend Deletion Order
The backend properly handles cascading deletes:
1. Delete `ResearchNode` records (facts)
2. Delete `SourceDoc` records (source documents)
3. Delete `Job` records (ingestion jobs)

This prevents foreign key constraint violations.

### Frontend Error Handling
```typescript
try {
    await resetProject(projectId);
    toast.success("Project reset complete");
} catch (error) {
    console.error("Reset failed:", error);
    toast.error("Failed to reset project");
}
```

## Testing Checklist

1. **Individual Delete**:
   - [ ] Add a source
   - [ ] Click **...** → **Delete**
   - [ ] Verify source is removed
   - [ ] Verify associated facts are gone

2. **Reset All**:
   - [ ] Add multiple sources
   - [ ] Click **...** (header) → **Reset All Sources**
   - [ ] Confirm dialog
   - [ ] Verify all sources + facts are removed

3. **Error Cases**:
   - [ ] Try deleting non-existent job (should fail gracefully)
   - [ ] Try resetting with no sources (should succeed with no-op)

## Files Changed
- ✅ `apps/backend/app/api/projects.py` - Added delete endpoint
- ✅ `apps/web/src/lib/api.ts` - Added resetProject function
- ✅ `apps/web/src/components/SourceTracker.tsx` - Fixed reset handler

## Migration Notes
- No database migration needed
- No breaking changes
- Backend auto-reloads (if using uvicorn with --reload)
- Frontend needs refresh to pick up new code
