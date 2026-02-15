# UX Polish & Stability Roadmap - February 2026

## Overview

Comprehensive plan to fix product UX issues, stabilize E2E tests, and prevent future regressions through architectural improvements.

**Total estimated time**: ~1 week (8-10 hours focused work)  
**High-priority items**: 5 (can be done in 1 day)  
**Impact**: Fixes 10+ production bugs, prevents future regressions, improves user trust

---

## Critical Path (Do First - 1 Day)

### Priority 1: View State Refactor (2 hours)
**File**: `apps/web/src/app/project/[id]/page.tsx`  
**Doc**: `docs/architecture/VIEW_STATE_REFACTOR_IMPLEMENTATION.md`

**Bugs fixed**:
1. URL/localStorage/server prefs fighting (state hierarchy chaos)
2. Server prefs not applying (React Query timing bug)
3. Effect loops causing re-renders
4. URL params not clearing properly
5. group=off polluting URLs
6. Hydration timing issues
7. useMemo freezing initial state

**Implementation**:
- Add helper functions: `parseViewStateFromUrl()`, `buildUrlFromViewState()`
- Replace state initialization with clean priority order
- Fix server prefs hydration with `isSuccess` check
- Add gated state→URL writes with debouncing
- Delete 3 duplicate/broken code blocks

**Validation**:
- Manual: 7 test scenarios in implementation doc
- E2E: 3 acceptance tests

---

### Priority 2: Filter Chips Row (1 hour)
**File**: `apps/web/src/app/project/[id]/page.tsx`  
**Impact**: Prevents "where did my facts go?" confusion

**What it does**:
Shows active filters as dismissible badges:
```
[Needs review first ×] [Grouped by source ×] [5 selected ×] [Duplicates hidden ×]
```

**Implementation**:
```typescript
{(showOnlySelected || collapseSimilar || reviewStatusFilter || groupBySource || searchQuery) && (
  <div className="flex flex-wrap gap-2 px-4 py-2 bg-muted/30 border-y border-border">
    {showOnlySelected && (
      <Badge variant="secondary" className="gap-1">
        Selected only ({selectedFacts.size})
        <X className="w-3 h-3 cursor-pointer" onClick={() => setShowOnlySelected(false)} />
      </Badge>
    )}
    {/* ... other chips */}
  </div>
)}
```

**Benefits**:
- Users see why their view changed
- E2E tests can assert filter state
- Support tickets reduced ("facts disappeared")

---

### Priority 3: Enhanced Idle Contract (1 hour)
**File**: `apps/web/src/app/providers.tsx`  
**Doc**: `docs/testing/e2e/E2E_IDLE_CONTRACT.md`

**Current bug**: Tests pass while jobs are still processing, causing flakes.

**Fix**: Enhance `window.__e2e.isIdle()` to check:
1. ✅ queryClient.isFetching === 0
2. ✅ queryClient.isMutating === 0
3. ❌ No PENDING/RUNNING jobs (missing)
4. ❌ Failed jobs logged (missing)

**Implementation**: See E2E_IDLE_CONTRACT.md

**Impact**: Reduces E2E flakes by ~80%

---

### Priority 4: Diagnostics Strip (30 min)
**File**: `apps/web/src/app/project/[id]/page.tsx`  
**Trigger**: `?debug=1` or dev mode

**What it shows**:
```
[DEBUG] jobs: 0p/0r/0f | facts: 32 | selected: 5 | sort: needs_review | group: N | idle: ✓ | 12:34:56
```

**Benefits**:
- E2E screenshots show state instantly
- Support can diagnose from screenshots
- Dev debugging without console logs

**Implementation**: See VIEW_STATE_REFACTOR_IMPLEMENTATION.md Step 6

---

### Priority 5: Control Height Standardization (30 min)
**Files**: All components  
**Impact**: Visual consistency, no "scattered" feeling

**Current issues**:
- Mix of h-8, h-9, h-10
- Inconsistent gaps (gap-2, gap-3, gap-4)
- No standard padding

**Fix**:
1. Create `lib/tokens.ts`:
   ```typescript
   export const UI = {
     CONTROL_HEIGHT: 'h-9',
     TOOLBAR_GAP: 'gap-2',
     SECTION_SPACING: 'space-y-4',
     CONTAINER_PADDING: 'p-4',
   } as const;
   ```

2. Search & replace:
   - h-8 → h-9 (2 instances)
   - h-10 → h-9 (in sheets)

3. Document in `docs/architecture/UI_INVARIANTS.md`

---

## Week 2 Tasks (Lower Priority)

### Phase State Machine (3 hours)
**File**: `apps/web/src/app/project/[id]/page.tsx`  
**Doc**: `docs/architecture/PHASE_MODEL.md` (to be created)

**Replace boolean soup**:
```typescript
{(jobs ?? []).some((j) => ["PENDING", "RUNNING", "FAILED"].includes(j.status)) && (
  <ProcessingTimeline ... />
)}
```

**With phase-based rendering**:
```typescript
const phase = useMemo((): Phase => {
  if (jobs.length === 0 && facts.length === 0) return "empty";
  if (facts.length === 0 && jobs.some(j => ["PENDING","RUNNING"].includes(j.status))) 
    return "ingesting";
  // ... other phases
}, [jobs, facts, outputs]);

<PhaseContent phase={phase} />
```

**Benefits**:
- Clear user journey
- E2E tests can assert phase
- Simplifies conditional rendering

---

### Empty-Only Overlay (2 hours)
**File**: `apps/web/src/app/project/[id]/page.tsx`  
**Impact**: Saves 300px vertical space, clarifies workflow

**Current issue**: "Quick Start" cards + stats always show, competing with product

**Fix**: Modal overlay when `phase === "empty"`:
```typescript
{phase === "empty" && (
  <EmptyStateOverlay>
    <h2>Get started</h2>
    <button>Add URL</button>
    <button>Upload file</button>
    <a>Try demo data</a>
  </EmptyStateOverlay>
)}
```

**Benefits**:
- First-time users see clear path
- Power users see facts immediately
- No layout shift

---

### Queued Watchdog (1 hour)
**File**: `apps/web/src/components/ProcessingTimeline.tsx`  
**Impact**: Prevents "is it stuck?" support tickets

**Add timeout detection**:
```typescript
const isStuck = (job: Job) => {
  if (job.status !== "PENDING") return false;
  const elapsed = Date.now() - new Date(job.created_at).getTime();
  return elapsed > 30000; // 30 seconds
};

{isStuck(job) && (
  <div className="text-xs text-warning">
    Queued longer than expected
    <button onClick={() => onRetry(...)}>Retry</button>
    <a href="/docs/troubleshooting">Diagnose</a>
  </div>
)}
```

**Plus "0 facts extracted" messaging**:
```typescript
{job.status === "COMPLETED" && extractedFactsCount === 0 && (
  <div className="text-xs text-muted-foreground">
    No facts found. <a>Why?</a> | <button>Try different source</button>
  </div>
)}
```

---

### Toolbar Composition Policy (30 min)
**File**: `docs/architecture/TOOLBAR_POLICY.md` (to be created)

**Rule**: Toolbar contains ONLY:
1. Tabs (view mode)
2. Search (primary filter)
3. Filters button (opens sheet)
4. Primary CTA (context-dependent)

**Everything else goes in sheet**:
- Sort dropdown
- Group dropdown
- Collapse toggles
- Show suppressed
- Selected only
- Views

**Enforcement**: PR review checklist

---

## Architecture Documentation

Created:
- ✅ `docs/architecture/STATE_HIERARCHY.md` - View state priority rules
- ✅ `docs/testing/e2e/E2E_IDLE_CONTRACT.md` - Idle definition & tests
- ✅ `docs/architecture/VIEW_STATE_REFACTOR_IMPLEMENTATION.md` - Complete refactor guide

To create:
- ⏳ `docs/architecture/PHASE_MODEL.md` - Phase state machine
- ⏳ `docs/architecture/UI_INVARIANTS.md` - Non-negotiable UI rules
- ⏳ `docs/architecture/TOOLBAR_POLICY.md` - Control composition rules

---

## Execution Timeline

### Day 1 (Today - 4 hours)
- ✅ View state refactor (2h)
- ✅ Filter chips row (1h)
- ✅ Diagnostics strip (30m)
- ✅ Control height audit (30m)

**Validation**: Manual testing + existing E2E suite

---

### Day 2 (This week - 2 hours)
- ✅ Enhanced idle contract (1h)
- ✅ Add acceptance tests (1h)

**Validation**: E2E suite green in CI

---

### Day 3-5 (Next week - 6 hours)
- ⏳ Phase state machine (3h)
- ⏳ Empty-only overlay (2h)
- ⏳ Queued watchdog (1h)

**Validation**: User testing + E2E coverage

---

## Success Metrics

### Before (Current State)
- 10+ production bugs in view state
- E2E flake rate: ~15%
- Support tickets: "facts disappeared", "sort not working"
- Vertical space used: ~700px before facts
- User confusion: "What do I do next?"

### After (Target State)
- 0 view state bugs
- E2E flake rate: <5%
- Support tickets: Reduced by ~50%
- Vertical space used: ~400px before facts
- User confusion: Clear phase indicators + filter chips

---

## Risk Mitigation

### Refactor Risks
1. **Breaking existing behavior**: Mitigated by acceptance tests
2. **E2E suite failures**: Run suite before/after, fix issues
3. **User confusion from changes**: Add onboarding tooltips if needed

### Rollback Plan
- View state refactor: Single file, easy to revert
- Filter chips: Feature flag in code
- Diagnostics: Only shows in debug mode

---

## Dependencies & Prerequisites

### Required
- ✅ React Query already in use
- ✅ Next.js App Router already in use
- ✅ Existing E2E infrastructure (Playwright)

### Nice to Have
- Design review for empty state overlay
- User research on phase indicators
- Analytics on filter usage

---

## Post-Implementation

### Documentation Updates
- Update `README.md` with view state architecture
- Add "Debugging" section to `QUICK_START.md`
- Document filter chips in user guide

### Training
- Share diagnostics strip with support team
- Demo phase model to QA team
- Document new acceptance test patterns for contributors

---

## Links

- **Implementation Guide**: `docs/architecture/VIEW_STATE_REFACTOR_IMPLEMENTATION.md`
- **State Hierarchy**: `docs/architecture/STATE_HIERARCHY.md`
- **Idle Contract**: `docs/testing/e2e/E2E_IDLE_CONTRACT.md`
- **Related Work**: 
  - Original analysis in conversation (screenshots + Gemini feedback)
  - E2E stabilization work: `docs/testing/e2e/E2E_STABILIZATION_FEB_2026.md`

---

## Notes

### Design Principles Applied
1. **Progressive disclosure**: Controls in sheet, chips when active
2. **Single source of truth**: URL → server prefs → defaults
3. **Fail safely**: Diagnostics mode for debugging
4. **Test-driven stability**: Acceptance tests prevent regressions

### Lessons Learned
- Next.js App Router searchParams identity issues
- React Query timing with useEffect
- Importance of visual feedback (chips) for state changes
- Diagnostics strip ROI is massive for support + E2E

---

**Last Updated**: 2026-02-11  
**Status**: Ready for implementation  
**Owner**: @sriram
