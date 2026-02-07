# Bugfix: CORS Routing + Synthesis Contract Stability

**Date:** February 7, 2026  
**Issues Fixed:**
1. CORS errors in `make dev` mode (Prompt #4)
2. "Invalid response - no synthesis text found" errors (Prompt #3)

**Status:** ✅ Fixed

---

## Problem 1: CORS Errors in Dev Mode

### Root Cause

The `make dev` command in the Makefile was explicitly setting `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1`, which:

1. Overrode the default `/api/v1` in `apps/web/src/lib/api.ts`
2. Caused the frontend to make **absolute URL** requests directly to `http://localhost:8000`
3. Bypassed the Next.js rewrites in `next.config.js` that proxy `/api/*` to the backend
4. Resulted in **cross-origin requests** from `localhost:3000` → `localhost:8000`
5. Triggered browser CORS policy enforcement

### Solution

**Removed the `NEXT_PUBLIC_API_URL` override** from the Makefile `dev` target.

Now:
- Frontend defaults to `/api/v1` (relative URL)
- Next.js rewrites intercept and proxy to `http://localhost:8000/api/v1`
- Browser sees same-origin requests (`localhost:3000/api/v1`)
- **No CORS preflight required** ✅

### Files Changed

**1. `Makefile` (lines 43-60)**

Before:
```makefile
dev:
	@echo "🛠️  Starting Dev Environment (CORS Mode)..."
	@echo "   - ⚠️  Cross-origin mode (CORS enabled in backend)"
	cd apps/web && NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1 npm run dev
```

After:
```makefile
dev:
	@echo "🛠️  Starting Dev Environment (Same-Origin Mode)..."
	@echo "   - ✅ Same-origin routing (no CORS issues)"
	@echo ""
	@echo "📝 API calls:"
	@echo "   Browser → http://localhost:3000/api/v1/..."
	@echo "   Next.js → http://localhost:8000/api/v1/... (transparent proxy)"
	@echo ""
	cd apps/web && npm run dev
```

**2. `.env.example`**

Added documentation:
```bash
# Frontend API Configuration
# NEXT_PUBLIC_API_URL is intentionally NOT set here
# Default behavior: Uses "/api/v1" which triggers Next.js rewrites (same-origin, no CORS)
# Only override this if you need to test direct backend calls:
# NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

### How It Works Now

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (localhost:3000)                                     │
│   fetch("/api/v1/projects/123/facts")                       │
│   ↓                                                           │
│ Next.js Dev Server (localhost:3000)                          │
│   Rewrite rule matches: /api/:path* → localhost:8000/api/*  │
│   ↓                                                           │
│ Backend (localhost:8000)                                     │
│   Receives: GET /api/v1/projects/123/facts                  │
│   Returns: 200 OK + data                                     │
│   ↓                                                           │
│ Next.js proxies response back to browser                     │
│                                                               │
│ Result: Browser thinks it's same-origin ✅                   │
└─────────────────────────────────────────────────────────────┘
```

### Verification

**Before Fix:**
```bash
make dev
# Open http://localhost:3000
# DevTools Console:
❌ Access to fetch at 'http://localhost:8000/api/v1/projects/...' 
   from origin 'http://localhost:3000' has been blocked by CORS policy
```

**After Fix:**
```bash
make dev
# Open http://localhost:3000
# DevTools Network tab:
✅ Request URL: http://localhost:3000/api/v1/projects/...
✅ Status: 200 OK
✅ No CORS preflight (OPTIONS) requests
```

---

## Problem 2: Synthesis "Invalid Response" Errors

### Root Cause

Frontend had extensive multi-shape parsing logic (7+ shapes), but:

1. **No schema validation** - hard to debug when new shapes appeared
2. **No fallback to `/outputs/{id}`** - if synthesis text missing but `output_id` present
3. **Silent failures** - some error paths didn't show toast messages
4. **Backend inconsistency** - LLM could return arrays or other types in edge cases

### Solution

Implemented **strict contract enforcement** with graceful fallbacks:

#### Backend Changes

**File: `apps/backend/app/api/projects.py` (lines 176-232)**

Added normalization logic:

```python
@router.post("/projects/{project_id}/synthesize")
def synthesize_project_facts(project_id: str, payload: SynthesisRequest, db: Session = Depends(get_session)):
    """
    CANONICAL RESPONSE CONTRACT:
    Success: {"synthesis": str, "output_id": str (UUID), "clusters": Optional[list]}
    Error: Raises HTTPException with {detail: str, code?: str} and non-200 status
    """
    try:
        result = synthesize_facts(fact_dicts, payload.mode)
        
        # ✅ NORMALIZE: Ensure synthesis is always a string (join arrays if needed)
        synthesis_raw = result.get("synthesis", "")
        
        if isinstance(synthesis_raw, list):
            synthesis_text = "\n\n".join(str(s) for s in synthesis_raw if s)
        elif isinstance(synthesis_raw, str):
            synthesis_text = synthesis_raw
        else:
            synthesis_text = str(synthesis_raw)
        
        if not synthesis_text.strip():
            raise HTTPException(
                status_code=500, 
                detail="LLM returned empty synthesis",
                headers={"X-Error-Code": "EMPTY_SYNTHESIS"}
            )
        
        # Store output...
        
        # ✅ GUARANTEED: Always return canonical shape
        return {
            "synthesis": synthesis_text,
            "output_id": str(output.id),
            "clusters": result.get("clusters", [])
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Synthesis generation failed: {str(e)}",
            headers={"X-Error-Code": "SYNTHESIS_EXCEPTION"}
        )
```

#### Frontend Changes

**File: `apps/web/src/lib/api.ts` (lines 218-340)**

Added Zod schema validation with fallback logic:

```typescript
import { z } from "zod";

// ✅ STRICT SYNTHESIS CONTRACT: Canonical response schema
const SynthesisResponseSchema = z.object({
  synthesis: z.string().min(1),
  output_id: z.string().uuid(),
  clusters: z.array(z.any()).optional(),
});

export async function synthesizeFacts(...): Promise<SynthesisResponse> {
  const res = await fetch(`${API_URL}/projects/${projectId}/synthesize`, {...});
  const rawResponse = await res.json();
  
  // Log response structure in dev mode
  if (process.env.NODE_ENV === 'development') {
    console.log('SYNTHESIS_RAW_RESPONSE:', {
      keys: Object.keys(rawResponse),
      synthesis_type: typeof rawResponse.synthesis,
      output_id: rawResponse.output_id,
    });
  }
  
  // Validate canonical schema
  const validationResult = SynthesisResponseSchema.safeParse(rawResponse);
  
  if (validationResult.success) {
    return validationResult.data;
  }
  
  // FALLBACK: Try multi-shape parsing for backwards compatibility
  // (handles arrays, nested objects, etc.)
  
  // If we have output_id but no synthesis, fetch from /outputs/{id}
  if (!synthesisText && rawResponse.output_id) {
    console.warn('⚠️ Synthesis text missing but output_id present. Fetching from /outputs endpoint...');
    const output = await fetchOutput(rawResponse.output_id);
    synthesisText = output.content;
  }
  
  // Final validation with detailed error
  throw new Error(
    `Invalid synthesis response - no synthesis text found. ` +
    `Response keys: ${responseKeys}. ` +
    `Validation errors: ${validationResult.error?.errors.map(e => e.message).join(', ')}`
  );
}
```

**File: `apps/web/src/app/project/[id]/page.tsx` (lines 206-309)**

Simplified with guaranteed type safety:

```typescript
const executeSynthesis = async (finalRichFacts: any[], mode: "paragraph" | "outline" | "brief") => {
    setIsSynthesizing(true);
    const progressToast = toast.loading("Generating synthesis...");

    try {
        // ✅ NEW: synthesizeFacts now returns typed SynthesisResponse with validation
        const result = await synthesizeFacts(projectId, finalRichFacts, mode);
        
        // ✅ Guaranteed: result.synthesis is string, result.output_id is UUID
        const outputRes = await fetch(`/api/v1/outputs/${result.output_id}`);
        if (!outputRes.ok) {
            // Fallback: show synthesis text in toast if output fetch fails
            toast.success("Synthesis generated", { 
                id: progressToast,
                description: result.synthesis.substring(0, 100) + "..."
            });
            return;
        }
        
        const output = await outputRes.json();
        setCurrentOutput(output);
        setShowOutputDrawer(true);
        
        toast.success("Synthesis complete!", { 
            id: progressToast,
            description: "Opening result in drawer"
        });
    } catch (e) {
        // ✅ GUARANTEED: Always show clear error toast
        toast.error(e.message, { 
            id: progressToast,
            duration: 6000,
            description: "Check console for details"
        });
    } finally {
        setIsSynthesizing(false);
    }
};
```

### Contract Guarantees

| Component | Guarantee |
|-----------|-----------|
| **Backend** | Always returns `{synthesis: string, output_id: UUID, clusters?: any[]}` or throws HTTPException with 500 status |
| **Frontend** | Always validates response with Zod, attempts fallbacks, and ends with either OutputDrawer open OR clear toast error |
| **Error Handling** | All error paths log to console (dev mode) and show user-friendly toast messages |

---

## Files Changed Summary

### Modified (5 files)

1. **`Makefile`**
   - Removed `NEXT_PUBLIC_API_URL` override in `dev` target
   - Updated help text to reflect same-origin routing

2. **`.env.example`**
   - Added documentation for `NEXT_PUBLIC_API_URL` behavior
   - Clarified when to override (almost never)

3. **`apps/backend/app/api/projects.py`**
   - Added synthesis response normalization (array → string)
   - Added empty synthesis validation
   - Documented canonical contract in docstring

4. **`apps/web/src/lib/api.ts`**
   - Added Zod schema validation for synthesis response
   - Added fallback to `/outputs/{output_id}` if synthesis missing
   - Improved error messages with response structure details

5. **`apps/web/src/app/project/[id]/page.tsx`**
   - Simplified synthesis execution with typed response
   - Removed 7-shape parsing logic (moved to api.ts with validation)
   - Guaranteed toast error on all failure paths

### Created (1 file)

1. **`BUGFIX_CORS_SYNTHESIS_FEB2026.md`**
   - This document

---

## Testing Instructions

### Test CORS Fix

```bash
# 1. Start dev mode
make dev

# 2. Open http://localhost:3000 in browser
# 3. Open DevTools → Network tab
# 4. Navigate to a project page
# 5. Verify:
#    ✅ Request URLs show "localhost:3000/api/v1/..."
#    ✅ No CORS errors in Console
#    ✅ No OPTIONS preflight requests
#    ✅ Facts load successfully
```

### Test Synthesis Contract

```bash
# 1. Start dev mode (if not already running)
make dev

# 2. Open http://localhost:3000 in browser
# 3. Open DevTools → Console
# 4. Navigate to a project, select 2+ facts
# 5. Click "Generate" → "Paragraph"
# 6. Verify:
#    ✅ Console shows "SYNTHESIS_RAW_RESPONSE" with keys
#    ✅ Toast shows "Synthesis complete!" 
#    ✅ OutputDrawer opens with content
#    ✅ No "invalid response" errors

# 7. Test error handling:
#    - Stop backend: docker-compose stop backend
#    - Try generating again
#    ✅ Toast shows clear error: "Synthesis generation failed: ..."
```

---

## Migration Guide

### If you were using `make dev` and seeing CORS errors:

**Before (broken):**
```bash
make dev
# Browser console: ❌ CORS policy blocked...
```

**After (fixed):**
```bash
# No changes needed! Just run:
make dev
# Browser console: ✅ No CORS errors
```

### If you were overriding API_URL in .env:

**Before:**
```bash
# .env (local)
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1  # ❌ Don't do this
```

**After:**
```bash
# .env (local)
# NEXT_PUBLIC_API_URL is NOT set - let rewrites handle it ✅
```

---

## Technical Notes

### Why Rewrites Work

Next.js rewrites run **server-side** during dev mode:

1. Browser makes request: `GET http://localhost:3000/api/v1/facts`
2. Next.js server intercepts before routing
3. Matches rewrite rule: `/api/:path*` → `http://localhost:8000/api/:path*`
4. Next.js fetches from backend: `http://localhost:8000/api/v1/facts`
5. Returns response to browser as if from same origin

The browser never sees `localhost:8000` in the URL.

### Why Absolute URLs Break It

If `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1`:

1. Browser makes request: `GET http://localhost:8000/api/v1/facts` (absolute URL)
2. Next.js rewrite doesn't match (not a relative path starting with `/api`)
3. Browser sends **direct cross-origin request** to backend
4. Backend must have CORS headers (and does), but:
   - Adds latency (OPTIONS preflight)
   - More error-prone (CORS misconfiguration common)
   - Doesn't match production setup (where proxy is used)

### Production Behavior

In production (`make prod` or `make dev-proxy`):
- Nginx proxy handles routing: `/ → web:3000`, `/api → backend:8000`
- Same-origin routing (no CORS)
- Consistent behavior across dev and prod ✅

---

## Definition of Done ✅

- [x] `make dev` uses same-origin routing (no CORS)
- [x] Backend synthesis endpoint always returns `{synthesis: string, output_id: UUID}`
- [x] Frontend validates synthesis response with Zod schema
- [x] Fallback to `/outputs/{id}` if synthesis missing
- [x] All error paths show clear toast messages
- [x] Dev-mode logging shows response structure for debugging
- [x] Documentation updated (.env.example + this file)
- [x] No breaking changes to existing workflows

---

**Result:** Both CORS and synthesis contract issues are resolved. Users can now run `make dev` without CORS errors, and synthesis generation always completes with either a result drawer or a clear error message.
